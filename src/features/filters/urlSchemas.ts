import { flag, idOrAll, oneOf, text, type Schema } from '@/app/urlState';
import { ALERT_SEVERITIES, WORKER_STATES } from '@/domain/types';
import type { AlertFilter, ApprovalFilter, MissionFilter, WorkerFilter } from './filters';

/**
 * URL parameters per list surface. Keys are short and human readable; every
 * value is validated against the fixed set it may take (ids are format-checked
 * only and are never assumed to exist in the data).
 */

export const MISSION_GROUPS = [
  'all',
  'in-flight',
  'founder',
  'blocked',
  'queued',
  'complete',
  'failed',
  'unknown',
] as const;
export const MISSION_SORTS = ['status', 'priority', 'newest', 'elapsed', 'id'] as const;
export const PRIORITIES = ['all', 'low', 'normal', 'high', 'critical'] as const;

export const MISSION_SCHEMA: Schema<MissionFilter> = {
  q: { key: 'q', codec: text },
  group: { key: 'group', codec: oneOf(MISSION_GROUPS) },
  priority: { key: 'priority', codec: oneOf(PRIORITIES) },
  workerId: { key: 'worker', codec: idOrAll },
  sort: { key: 'sort', codec: oneOf(MISSION_SORTS) },
};

export const WORKER_FLAGS = [
  'all',
  'active',
  'blocked',
  'founder',
  'idle',
  'failed',
  'unknown',
] as const;
export const WORKER_SORTS = ['attention', 'name', 'longest-in-state'] as const;

export const WORKER_SCHEMA: Schema<WorkerFilter> = {
  q: { key: 'q', codec: text },
  flag: { key: 'show', codec: oneOf(WORKER_FLAGS) },
  state: { key: 'state', codec: oneOf(['all', ...WORKER_STATES] as const) },
  crewId: { key: 'crew', codec: idOrAll },
  roomId: { key: 'room', codec: idOrAll },
  authority: { key: 'authority', codec: oneOf(['all', 'granted', 'none'] as const) },
  sort: { key: 'sort', codec: oneOf(WORKER_SORTS) },
};

export const APPROVAL_SCHEMA: Schema<ApprovalFilter> = {
  q: { key: 'q', codec: text },
  view: { key: 'view', codec: oneOf(['open', 'held', 'decided', 'unknown', 'all'] as const) },
  risk: { key: 'risk', codec: oneOf(['all', 'low', 'medium', 'high', 'critical'] as const) },
  sort: { key: 'sort', codec: oneOf(['oldest', 'risk', 'newest'] as const) },
};

export const ALERT_SCHEMA: Schema<AlertFilter> = {
  q: { key: 'q', codec: text },
  severity: { key: 'severity', codec: oneOf(['ALL', ...ALERT_SEVERITIES] as const) },
  humanOnly: { key: 'human', codec: flag },
  sort: { key: 'sort', codec: oneOf(['severity', 'newest', 'oldest'] as const) },
};
