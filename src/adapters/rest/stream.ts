import type { DashboardEvent } from '@/domain/events';
import { checkDecision } from '@/domain/governance';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type { WorkerStateMapping } from '@/domain/status';
import { mapWorkerState } from '@/domain/status';
import type { Blocker, WorkerMessage } from '@/domain/types';
import {
  type IssueLog,
  normalizeAlert,
  normalizeApproval,
  normalizeArtifact,
  normalizeEvent,
  normalizeHealth,
  normalizeMission,
} from './normalize';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.slice(0, 2000) : undefined);

/**
 * Turn one raw SSE `data:` payload into an event that is SAFE TO APPLY with
 * `applyEvent`. Everything is re-normalized: an event stream is untrusted input,
 * exactly like a REST payload.
 *
 * Returns `null` (and records an issue) for malformed JSON, unknown kinds,
 * invalid payloads, and approval decisions whose claimed authority fails the
 * governance rules. The decision never reaches the snapshot.
 */
export function normalizeStreamEvent(
  data: string,
  snapshot: DashboardSnapshot,
  log: IssueLog,
  mapping?: WorkerStateMapping,
): DashboardEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    log.add('warning', 'stream', 'Dropped stream message that is not valid JSON');
    return null;
  }
  const base = normalizeEvent(raw, 0, log);
  if (!base) return null;
  const p = (isObj(raw) && isObj(raw.payload) ? raw.payload : {}) as Obj;
  const src = `stream ${base.kind} ${base.id}`;
  const reject = (why: string, severity: 'warning' | 'error' = 'warning') => {
    log.add(severity, src, why);
    return null;
  };

  switch (base.kind) {
    case 'mission.created': {
      const mission = normalizeMission(p.mission, 0, log);
      return mission
        ? { ...base, missionId: mission.id, payload: { mission } }
        : reject('Invalid mission');
    }
    case 'approval.requested': {
      const request = normalizeApproval(p.request, 0, log);
      if (!request) return reject('Invalid approval request');
      // A newly requested approval is always open; a stream cannot create a pre-decided one.
      if (request.status !== 'PENDING' || request.decision) {
        return reject('approval.requested must be PENDING without a decision', 'error');
      }
      return { ...base, missionId: request.missionId, payload: { request } };
    }
    case 'approval.decided': {
      if (base.kind !== 'approval.decided') return null;
      const request = snapshot.approvals.find((a) => a.id === base.payload.approvalId);
      const check = checkDecision(
        request,
        base.payload.record.decidedBy,
        snapshot.workers,
        base.payload.record.decision,
      );
      if (!check.ok) {
        return reject(
          `Rejected backend decision claim: ${check.reason ?? 'not verifiable'}`,
          'error',
        );
      }
      return base;
    }
    case 'alert.raised': {
      const alert = normalizeAlert(p.alert, 0, log);
      return alert ? { ...base, payload: { alert } } : reject('Invalid alert');
    }
    case 'health.updated': {
      const health = normalizeHealth(p.health, log, base.at);
      return health ? { ...base, payload: { health } } : reject('Invalid health');
    }
    case 'artifact.produced': {
      if (!base.missionId) return reject('artifact.produced without missionId');
      const artifact = normalizeArtifact(p.artifact, base.missionId, log, src);
      return artifact ? { ...base, payload: { artifact } } : null;
    }
    case 'worker.blocked': {
      const b = isObj(p.blocker) ? p.blocker : {};
      const dep = isObj(b.dependsOn) ? b.dependsOn : undefined;
      const kinds = ['mission', 'task', 'approval', 'external'];
      const blocker: Blocker = {
        id: str(b.id) ?? `${base.id}-blocker`,
        description: str(b.description) ?? 'Blocked (no description)',
        dependsOn:
          dep && kinds.includes(String(dep.kind)) && str(dep.id)
            ? { kind: dep.kind as NonNullable<Blocker['dependsOn']>['kind'], id: str(dep.id)! }
            : undefined,
        since: base.at,
      };
      return { ...base, payload: { blocker } };
    }
    case 'worker.unblocked':
      return str(p.blockerId)
        ? { ...base, payload: { blockerId: str(p.blockerId)! } }
        : reject('Missing blockerId');
    case 'worker.state_changed': {
      const state = mapWorkerState(String(p.state), mapping);
      const progress =
        typeof p.progress === 'number' && p.progress >= 0 && p.progress <= 1
          ? p.progress
          : undefined;
      return { ...base, payload: { state, activity: str(p.activity), progress } };
    }
    case 'task.progress': {
      const progress =
        typeof p.progress === 'number' && p.progress >= 0 && p.progress <= 1 ? p.progress : null;
      if (progress === null || !str(p.taskId)) return reject('Invalid task progress');
      const mp =
        typeof p.missionProgress === 'number' && p.missionProgress >= 0 && p.missionProgress <= 1
          ? p.missionProgress
          : undefined;
      return { ...base, payload: { taskId: str(p.taskId)!, progress, missionProgress: mp } };
    }
    case 'message.posted': {
      const m = isObj(p.message) ? p.message : {};
      const message: WorkerMessage = {
        id: str(m.id) ?? base.id,
        workerId: str(m.workerId) ?? base.workerId ?? '',
        direction: m.direction === 'to-worker' ? 'to-worker' : 'from-worker',
        author: str(m.author) ?? 'unknown',
        body: str(m.body) ?? '',
        sentAt: base.at,
        delivery: 'delivered',
      };
      return message.workerId
        ? { ...base, payload: { message } }
        : reject('Message without worker');
    }
    case 'certification.updated': {
      const ok = ['NOT_REQUIRED', 'PENDING', 'IN_PROGRESS', 'CERTIFIED', 'REJECTED'];
      return ok.includes(String(p.status)) ? base : reject('Unknown certification status');
    }
    default:
      return base;
  }
}
