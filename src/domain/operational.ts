import type { AdapterCapabilities } from '@/adapters/types';
import type { Freshness, FreshnessQualifier } from './freshness';
import { resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';
import type { ApprovalRequest, Artifact, DataMode, Mission } from './types';

/**
 * Shared operational semantics (Phase 12). Pure functions only: every surface
 * classifies actions, connection and mission lifecycle through this module, so
 * no page invents its own (and possibly more optimistic) reading.
 *
 * AUTONOMY ≠ AUTHORITY. UI ≠ AUTHORITY. A BUTTON ≠ A CAPABILITY.
 */

/* ------------------------------------------------------------------------- */
/* Action safety                                                             */
/* ------------------------------------------------------------------------- */

/**
 * What pressing a control actually does.
 * - NAVIGATION / LOCAL_PRESENTATION / READ_ONLY_INSPECTION change nothing outside this view.
 * - DEMO_SIMULATION changes only the local simulation; nothing outside this browser.
 * - FOUNDER_GATED_OPERATION is delivered to a connected backend and needs the named human authority.
 * - UNAVAILABLE: the connected adapter cannot perform it; the control must not look executable.
 */
export type ActionClass =
  | 'NAVIGATION'
  | 'LOCAL_PRESENTATION'
  | 'READ_ONLY_INSPECTION'
  | 'DEMO_SIMULATION'
  | 'FOUNDER_GATED_OPERATION'
  | 'UNAVAILABLE';

/** Operations that would change state somewhere if they were real. */
export type Operation =
  'approval-decision' | 'alert-acknowledge' | 'worker-message' | 'simulation-control';

export interface ActionClassification {
  cls: ActionClass;
  /** True when the real operation requires the named human authority (Founder #0007). */
  founderGated: boolean;
}

const CAPABILITY: Record<Operation, keyof AdapterCapabilities> = {
  'approval-decision': 'approvals',
  'alert-acknowledge': 'alertAcknowledgement',
  'worker-message': 'messaging',
  'simulation-control': 'simulationControls',
};

const FOUNDER_GATED: Record<Operation, boolean> = {
  'approval-decision': true,
  'alert-acknowledge': true,
  'worker-message': false,
  'simulation-control': false,
};

/**
 * Classify an operation for the current data mode and adapter. In demo mode
 * every operation is a simulation, whatever it would mean for real; on a
 * connected backend an operation the adapter cannot deliver is UNAVAILABLE.
 * Unknown/disconnected/replay views never offer a real operation.
 */
export function classifyOperation(
  op: Operation,
  ctx: { mode: DataMode; capabilities: AdapterCapabilities },
): ActionClassification {
  const founderGated = FOUNDER_GATED[op];
  if (!ctx.capabilities[CAPABILITY[op]]) return { cls: 'UNAVAILABLE', founderGated };
  if (ctx.mode === 'demo' || op === 'simulation-control')
    return { cls: 'DEMO_SIMULATION', founderGated };
  if (ctx.mode !== 'live') return { cls: 'UNAVAILABLE', founderGated };
  return { cls: founderGated ? 'FOUNDER_GATED_OPERATION' : 'READ_ONLY_INSPECTION', founderGated };
}

/* ------------------------------------------------------------------------- */
/* Connection claim                                                          */
/* ------------------------------------------------------------------------- */

/**
 * What the dashboard may truthfully claim about its connection.
 * CONNECTED requires a verified live backend AND complete data; the page
 * having loaded proves nothing. LIVE with stale, partial or unknown data is
 * PARTIALLY_CONNECTED, with the reasons listed.
 */
export type ConnectionClaim =
  'DEMO_SIMULATED' | 'CONNECTED' | 'PARTIALLY_CONNECTED' | 'DISCONNECTED' | 'REPLAY';

export interface ConnectionClaimResult {
  claim: ConnectionClaim;
  /** Why the claim is weaker than CONNECTED (empty for CONNECTED and DEMO). */
  reasons: FreshnessQualifier[];
}

export function selectConnectionClaim(f: Freshness): ConnectionClaimResult {
  switch (f.source) {
    case 'SIMULATED':
      return { claim: 'DEMO_SIMULATED', reasons: [] };
    case 'REPLAY':
      return { claim: 'REPLAY', reasons: [] };
    case 'DISCONNECTED':
      return { claim: 'DISCONNECTED', reasons: [...f.qualifiers] };
    case 'LIVE':
      return f.complete
        ? { claim: 'CONNECTED', reasons: [] }
        : { claim: 'PARTIALLY_CONNECTED', reasons: [...f.qualifiers] };
  }
}

/* ------------------------------------------------------------------------- */
/* Mission lifecycle ladder                                                  */
/* ------------------------------------------------------------------------- */

/**
 * The false-green guard. Each rung is reported separately and from its own
 * field; no rung is ever inferred from another:
 *
 *   COMPLETED ≠ TESTED ≠ REVIEWED ≠ CERTIFIED ≠ FOUNDER APPROVED ≠ DEPLOYED
 *
 * There is no readiness percentage: a rung the data does not report is
 * NOT_REPORTED or UNKNOWN, and deployment is NOT_TRACKED by this dashboard.
 */
export const LADDER_STEPS = [
  'work',
  'tests',
  'review',
  'certification',
  'founder',
  'deployment',
] as const;
export type LadderStep = (typeof LADDER_STEPS)[number];

export type LadderState =
  | 'DONE'
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'BLOCKED'
  | 'FAILED'
  | 'CANCELLED'
  | 'NOT_REQUIRED'
  | 'NOT_REQUESTED'
  | 'EVIDENCE_REPORTED'
  | 'NOT_REPORTED'
  | 'NOT_TRACKED'
  | 'UNKNOWN';

export interface LadderRung {
  step: LadderStep;
  state: LadderState;
  /** Evidence the rung is read from (artifact or approval ids). Never invented. */
  evidence: string[];
  /** True when the rung's state comes only from a simulated (demo) decision. */
  simulated?: boolean;
}

function workRung(m: Mission): LadderRung {
  const state: LadderState = (
    {
      QUEUED: 'PENDING',
      ACTIVE: 'IN_PROGRESS',
      WAITING_REVIEW: 'SUBMITTED',
      WAITING_APPROVAL: 'SUBMITTED',
      BLOCKED: 'BLOCKED',
      COMPLETE: 'DONE',
      FAILED: 'FAILED',
      CANCELLED: 'CANCELLED',
      UNKNOWN: 'UNKNOWN',
    } as const
  )[m.status];
  return { step: 'work', state, evidence: [] };
}

/** Test results are evidence only: their outcome is never interpreted as a pass. */
function testsRung(m: Mission): LadderRung {
  const results = m.artifacts.filter((a: Artifact) => a.kind === 'test-result');
  return results.length
    ? { step: 'tests', state: 'EVIDENCE_REPORTED', evidence: results.map((a) => a.id) }
    : { step: 'tests', state: 'NOT_REPORTED', evidence: [] };
}

function reviewRung(m: Mission): LadderRung {
  const state: LadderState = (
    {
      NOT_REQUESTED: 'NOT_REQUESTED',
      REQUESTED: 'PENDING',
      IN_REVIEW: 'IN_PROGRESS',
      PASSED: 'DONE',
      FAILED: 'FAILED',
      UNKNOWN: 'UNKNOWN',
    } as const
  )[m.review.status];
  return { step: 'review', state: state ?? 'UNKNOWN', evidence: [m.review.id] };
}

function certificationRung(m: Mission): LadderRung {
  const state: LadderState = (
    {
      NOT_REQUIRED: 'NOT_REQUIRED',
      PENDING: 'PENDING',
      IN_PROGRESS: 'IN_PROGRESS',
      CERTIFIED: 'DONE',
      REJECTED: 'FAILED',
      UNKNOWN: 'UNKNOWN',
    } as const
  )[m.certification];
  return { step: 'certification', state: state ?? 'UNKNOWN', evidence: [] };
}

function founderRung(m: Mission, s: DashboardSnapshot): LadderRung {
  if (!m.approvalIds.length) return { step: 'founder', state: 'NOT_REQUIRED', evidence: [] };
  if (resourceUnavailable(s, 'approvals'))
    return { step: 'founder', state: 'UNKNOWN', evidence: [...m.approvalIds] };
  const gates = m.approvalIds.map((id) => s.approvals.find((a) => a.id === id));
  const evidence = [...m.approvalIds];
  if (gates.some((g) => g === undefined)) return { step: 'founder', state: 'UNKNOWN', evidence };
  const known = gates as ApprovalRequest[];
  const simulated = known.some((g) => g.decision?.delivery === 'simulated') || undefined;
  const has = (st: ApprovalRequest['status']) => known.some((g) => g.status === st);
  let state: LadderState;
  if (has('UNKNOWN')) state = 'UNKNOWN';
  else if (has('DENIED')) state = 'FAILED';
  else if (has('PENDING') || has('HELD')) state = 'PENDING';
  else if (known.every((g) => g.status === 'APPROVED')) state = 'DONE';
  else state = 'CANCELLED'; // expired or withdrawn: no decision stands
  return { step: 'founder', state, evidence, ...(simulated ? { simulated } : {}) };
}

export function missionLifecycle(m: Mission, s: DashboardSnapshot): LadderRung[] {
  return [
    workRung(m),
    testsRung(m),
    reviewRung(m),
    certificationRung(m),
    founderRung(m, s),
    // The data model carries no deployment signal and this dashboard never deploys.
    { step: 'deployment', state: 'NOT_TRACKED', evidence: [] },
  ];
}

/* ------------------------------------------------------------------------- */
/* Health report                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Why the dashboard shows the health it shows. Health is whatever the data
 * source REPORTED, attributed to that source (simulated in demo mode), with
 * the components that are NOT covered by any report listed explicitly:
 * the frontend rendering proves nothing about the wider ecosystem.
 */
export interface HealthReport {
  status: DashboardSnapshot['health']['status'];
  checkedAt?: string;
  /** Reported by a demo simulation, not by a backend. */
  simulated: boolean;
  /** Components reporting anything other than NOMINAL: the reasons for the status. */
  reasons: DashboardSnapshot['health']['components'];
  /** True when the status is not NOMINAL but no component explains it. */
  unexplained: boolean;
  components: DashboardSnapshot['health']['components'];
  /** Areas no health report covers in this build. */
  notCovered: readonly ('frontend' | 'associates' | 'deployment')[];
}

export function selectHealthReport(s: DashboardSnapshot): HealthReport {
  const components = s.health.components;
  const reasons = components.filter((c) => c.status !== 'NOMINAL');
  return {
    status: s.health.status,
    checkedAt:
      s.health.components.length || s.health.status !== 'UNKNOWN' ? s.health.checkedAt : undefined,
    simulated: s.provenance.mode === 'demo' || s.provenance.adapterId === 'demo',
    reasons,
    unexplained: s.health.status !== 'NOMINAL' && s.health.status !== 'UNKNOWN' && !reasons.length,
    components,
    notCovered: ['frontend', 'associates', 'deployment'],
  };
}

/* ------------------------------------------------------------------------- */
/* Data source classification                                                */
/* ------------------------------------------------------------------------- */

/**
 * Where data comes from, by adapter kind (never by what the data claims).
 * DEMO = built-in simulation; REMOTE = a network adapter of this codebase
 * (REMOTE ≠ AUTHORITATIVE: it is only as good as the backend behind it);
 * UNKNOWN = a custom/registered adapter this dashboard cannot classify.
 * LOCAL is reserved for a future local-file adapter; none exists today.
 */
export type SourceClass = 'DEMO' | 'LOCAL' | 'REMOTE' | 'UNKNOWN';

const REMOTE_ADAPTERS = new Set(['rest']);

export function classifySource(p: { adapterId: string; mode: DataMode }): SourceClass {
  if (p.adapterId === 'demo' || p.mode === 'demo') return 'DEMO';
  if (REMOTE_ADAPTERS.has(p.adapterId)) return 'REMOTE';
  return 'UNKNOWN';
}
