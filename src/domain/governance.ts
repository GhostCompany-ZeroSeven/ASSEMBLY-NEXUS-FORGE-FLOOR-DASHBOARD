import type { DashboardSnapshot } from './snapshot';
import type { ApprovalDecision, ApprovalRequest, Worker } from './types';

/**
 * Governance rules shared by every adapter and by the UI.
 *
 * Invariants:
 * - Only a human authority named in `requiredAuthority` may decide.
 * - A worker can never decide, even its own request, whatever capabilities it has.
 * - Missing or malformed authority data blocks the decision. It never allows one.
 * - Only PENDING or HELD requests can be decided. HELD is not APPROVED.
 *
 * These checks run client-side as defence in depth. A real backend must enforce
 * the same rules itself against an authenticated identity.
 */

export class GovernanceError extends Error {
  readonly code: GovernanceRefusal;
  constructor(code: GovernanceRefusal, message: string) {
    super(message);
    this.name = 'GovernanceError';
    this.code = code;
  }
}

export type GovernanceRefusal =
  | 'unknown-request'
  | 'not-open'
  | 'missing-authority'
  | 'wrong-authority'
  | 'worker-cannot-decide'
  | 'invalid-decision';

const DECISIONS: readonly ApprovalDecision[] = ['APPROVE', 'DENY', 'HOLD'];

export function isOpenForDecision(request: Pick<ApprovalRequest, 'status'>): boolean {
  return request.status === 'PENDING' || request.status === 'HELD';
}

function norm(s: unknown): string {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

/** True if `identity` matches any worker's id or name, or the requesting worker. */
export function isWorkerIdentity(
  identity: string,
  workers: readonly Pick<Worker, 'id' | 'name'>[],
  requestedBy?: string,
): boolean {
  const n = norm(identity);
  if (!n) return false;
  if (requestedBy && norm(requestedBy) === n) return true;
  return workers.some((w) => norm(w.id) === n || norm(w.name) === n);
}

export interface DecisionCheck {
  ok: boolean;
  code?: GovernanceRefusal;
  reason?: string;
}

/**
 * Can `decider` decide `request`? Pure, and used by the UI to decide whether to
 * offer decision buttons and by adapters before sending anything.
 */
export function checkDecision(
  request: ApprovalRequest | undefined,
  decider: string,
  workers: readonly Pick<Worker, 'id' | 'name'>[],
  decision?: unknown,
): DecisionCheck {
  if (!request) return { ok: false, code: 'unknown-request', reason: 'Unknown approval request.' };
  if (decision !== undefined && !DECISIONS.includes(decision as ApprovalDecision)) {
    return {
      ok: false,
      code: 'invalid-decision',
      reason: `Invalid decision "${String(decision)}".`,
    };
  }
  if (!isOpenForDecision(request)) {
    return {
      ok: false,
      code: 'not-open',
      reason: `Approval ${request.id} is already ${request.status}.`,
    };
  }
  const required =
    typeof request.requiredAuthority === 'string' ? request.requiredAuthority.trim() : '';
  if (!required) {
    return {
      ok: false,
      code: 'missing-authority',
      reason: `Approval ${request.id} does not name a required authority, so it cannot be decided.`,
    };
  }
  // A request whose "required authority" is itself a worker is malformed.
  if (isWorkerIdentity(required, workers, request.requestedBy)) {
    return {
      ok: false,
      code: 'worker-cannot-decide',
      reason: `Approval ${request.id} names a worker as its authority. Workers cannot decide approvals.`,
    };
  }
  if (isWorkerIdentity(decider, workers, request.requestedBy)) {
    return {
      ok: false,
      code: 'worker-cannot-decide',
      reason: 'Workers cannot decide approvals, including their own requests.',
    };
  }
  if (norm(decider) !== norm(required) || !decider.trim()) {
    return {
      ok: false,
      code: 'wrong-authority',
      reason: `Approval ${request.id} requires ${required}.`,
    };
  }
  return { ok: true };
}

/** Throwing variant for adapters. Returns the request when allowed. */
export function assertHumanDecisionAllowed(
  snapshot: Pick<DashboardSnapshot, 'approvals' | 'workers'>,
  input: { approvalId: string; decision: unknown; decidedBy: string },
): ApprovalRequest {
  const request = snapshot.approvals.find((a) => a.id === input.approvalId);
  const check = checkDecision(request, input.decidedBy, snapshot.workers, input.decision);
  if (!check.ok || !request) {
    throw new GovernanceError(check.code ?? 'unknown-request', check.reason ?? 'Refused.');
  }
  return request;
}

export interface AuthorityClaimProblem {
  source: string;
  message: string;
}

/**
 * BACKEND CLAIM ≠ VERIFIED AUTHORITY.
 *
 * Cross-checks authority claims in backend data against the governance rules:
 * - a decision record must be made by the request's named human authority, and never
 *   by a worker (including the requester); otherwise the request becomes UNKNOWN and
 *   its decision is discarded;
 * - an authority grant attributed to a worker (a worker granting authority) is dropped.
 *
 * Pure: returns corrected copies plus a problem list for data-quality reporting.
 */
export function verifyBackendAuthorityClaims(
  approvals: readonly ApprovalRequest[],
  workers: readonly Worker[],
): { approvals: ApprovalRequest[]; workers: Worker[]; problems: AuthorityClaimProblem[] } {
  const problems: AuthorityClaimProblem[] = [];
  const checked = approvals.map((a) => {
    if (!a.decision) return a;
    const required = typeof a.requiredAuthority === 'string' ? a.requiredAuthority.trim() : '';
    const by = a.decision.decidedBy;
    const valid =
      required !== '' &&
      !isWorkerIdentity(required, workers, a.requestedBy) &&
      !isWorkerIdentity(by, workers, a.requestedBy) &&
      norm(by) === norm(required);
    if (valid) return a;
    problems.push({
      source: `approval ${a.id}`,
      message: `Decision attributed to "${by}" is not by the required authority "${required || '(none)'}". Status shown as UNKNOWN`,
    });
    return { ...a, status: 'UNKNOWN' as const, decision: undefined };
  });
  const cleanWorkers = workers.map((w) => {
    const grants = w.authority.filter((g) => !isWorkerIdentity(g.grantedBy, workers));
    if (grants.length === w.authority.length) return w;
    problems.push({
      source: `worker ${w.id}.authority`,
      message: 'Dropped authority grant attributed to a worker. Workers cannot grant authority',
    });
    return { ...w, authority: grants };
  });
  return { approvals: checked, workers: cleanWorkers, problems };
}
