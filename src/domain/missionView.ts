import {
  ALERT_PHASES,
  APPROVAL_STATUSES,
  MISSION_STATUSES,
  MODES,
  alertPhase,
  type AlertPhase,
} from './checkpoint';
import {
  createWatermark,
  eventCoverage,
  parseWatermark,
  type EventCoverage,
  type EventWatermark,
} from './eventCoverage';
import type { FreshnessQualifier, FreshnessSource } from './freshness';
import { resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';
import { WORKER_STATES, type ApprovalStatus, type MissionStatus, type WorkerState } from './types';

/**
 * Per-mission "last viewed" checkpoint and mission-scoped change digest.
 *
 * A mission checkpoint records what THIS browser showed about ONE mission when
 * the Founder last looked at it. It is local view state only. It is not an
 * acknowledgement, an approval, a completion or a certification, and it never
 * changes anything in the backend.
 *
 * Each area (status, workers, approvals, alerts, artifacts, events) is compared
 * only when it was known both then and now. An area that cannot be compared is
 * reported as UNKNOWN with a reason, never as "no change".
 */
export const MISSION_VIEW_VERSION = 1;
const MAX_RELATED = 200;

export const NOT_REPORTED = 'NOT_REPORTED' as const;
type Reported<T> = T | typeof NOT_REPORTED;

export type MissionArea = 'status' | 'workers' | 'approvals' | 'alerts' | 'artifacts' | 'events';
export const MISSION_AREAS: readonly MissionArea[] = [
  'status',
  'workers',
  'approvals',
  'alerts',
  'artifacts',
  'events',
];
const RESOURCES = ['missions', 'workers', 'approvals', 'alerts', 'events'] as const;
type Resource = (typeof RESOURCES)[number];

const FRESHNESS_SOURCES: readonly FreshnessSource[] = [
  'SIMULATED',
  'LIVE',
  'DISCONNECTED',
  'REPLAY',
];
const QUALIFIERS: readonly FreshnessQualifier[] = ['STALE', 'PARTIAL', 'UNKNOWN', 'LAST_KNOWN'];

export interface MissionCheckpoint {
  v: typeof MISSION_VIEW_VERSION;
  missionId: string;
  /** Browser time of the view (display only; never compared with source times). */
  at: string;
  adapterId: string;
  mode: (typeof MODES)[number];
  /** Whether the mission was in the data at the time (undefined: missions unavailable). */
  present?: boolean;
  status?: MissionStatus;
  hadResult?: boolean;
  /** Assigned worker ids (from the mission record). */
  assigned?: string[];
  /** Assigned workers' states; absent when the workers resource was unavailable. */
  workers?: Record<string, Reported<WorkerState>>;
  /** Linked approval gates' statuses; absent when approvals were unavailable. */
  approvals?: Record<string, Reported<ApprovalStatus>>;
  /** Alerts that name this mission as affected; absent when alerts were unavailable. */
  alerts?: Record<string, AlertPhase>;
  artifacts?: string[];
  /** This mission's events at the time; absent when events were unavailable. */
  events?: EventWatermark;
  /** Data quality at the time. */
  quality: { unavailable: Resource[]; source: FreshnessSource; qualifiers: FreshnessQualifier[] };
}

export interface FreshnessView {
  source: FreshnessSource;
  qualifiers: FreshnessQualifier[];
}

const nullMap = <T>() => Object.create(null) as Record<string, T>;
const own = <T>(m: Record<string, T>, k: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(m, k) ? m[k] : undefined;

function unavailableResources(s: DashboardSnapshot): Resource[] {
  return RESOURCES.filter((r) => resourceUnavailable(s, r));
}

/** Events that explicitly name this mission. */
export function missionEvents(s: DashboardSnapshot, missionId: string) {
  return s.events.filter((e) => e.missionId === missionId);
}

export function createMissionCheckpoint(
  s: DashboardSnapshot,
  missionId: string,
  freshness: FreshnessView,
  atIso: string,
): MissionCheckpoint {
  const down = new Set(unavailableResources(s));
  const mission = down.has('missions') ? undefined : s.missions.find((m) => m.id === missionId);
  const cp: MissionCheckpoint = {
    v: MISSION_VIEW_VERSION,
    missionId,
    at: atIso,
    adapterId: s.provenance.adapterId,
    mode: s.provenance.mode,
    present: down.has('missions') ? undefined : mission !== undefined,
    quality: {
      unavailable: [...down],
      source: freshness.source,
      qualifiers: [...freshness.qualifiers],
    },
  };
  if (!mission) {
    if (!down.has('events')) cp.events = createWatermark(missionEvents(s, missionId));
    return cp;
  }
  cp.status = mission.status;
  cp.hadResult = mission.result !== undefined;
  cp.assigned = mission.assignedWorkerIds.slice(0, MAX_RELATED);
  cp.artifacts = mission.artifacts.map((a) => a.id).slice(0, MAX_RELATED);
  if (!down.has('workers')) {
    const map = nullMap<Reported<WorkerState>>();
    for (const id of cp.assigned)
      map[id] = s.workers.find((w) => w.id === id)?.state ?? NOT_REPORTED;
    cp.workers = map;
  }
  if (!down.has('approvals')) {
    const map = nullMap<Reported<ApprovalStatus>>();
    for (const id of mission.approvalIds.slice(0, MAX_RELATED))
      map[id] = s.approvals.find((a) => a.id === id)?.status ?? NOT_REPORTED;
    cp.approvals = map;
  }
  if (!down.has('alerts')) {
    const map = nullMap<AlertPhase>();
    for (const al of s.alerts)
      if (al.affected.some((x) => x.kind === 'mission' && x.id === missionId))
        map[al.id] = alertPhase(al);
    cp.alerts = map;
  }
  if (!down.has('events')) cp.events = createWatermark(missionEvents(s, missionId));
  return cp;
}

/* ------------------------------- Validation ------------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const FUTURE_TOLERANCE_MS = 60_000;

function idList(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (
    !Array.isArray(v) ||
    v.length > MAX_RELATED ||
    !v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 200)
  )
    throw new Error('bad id list');
  return v as string[];
}

function enumMap<T extends string>(
  v: unknown,
  allowed: readonly string[],
): Record<string, T> | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) throw new Error('bad map');
  const entries = Object.entries(v);
  if (entries.length > MAX_RELATED) throw new Error('too large');
  const out = nullMap<T>();
  for (const [k, val] of entries) {
    if (typeof val !== 'string' || !allowed.includes(val) || k.length > 200)
      throw new Error('bad entry');
    out[k] = val as T;
  }
  return out;
}

/**
 * Parse an untrusted stored mission checkpoint. Anything malformed, oversized,
 * future-dated, from another schema version or for a different mission is
 * rejected as a whole (null): the mission view then says "no previous view".
 */
export function parseMissionCheckpoint(
  raw: unknown,
  missionId: string,
  nowMs: number,
): MissionCheckpoint | null {
  try {
    if (!isObj(raw) || raw.v !== MISSION_VIEW_VERSION || raw.missionId !== missionId) return null;
    if (!isIso(raw.at) || Date.parse(raw.at) > nowMs + FUTURE_TOLERANCE_MS) return null;
    if (typeof raw.adapterId !== 'string' || raw.adapterId.length > 200) return null;
    if (!(MODES as readonly unknown[]).includes(raw.mode)) return null;
    if (raw.present !== undefined && typeof raw.present !== 'boolean') return null;
    if (raw.status !== undefined && !(MISSION_STATUSES as readonly unknown[]).includes(raw.status))
      return null;
    if (raw.hadResult !== undefined && typeof raw.hadResult !== 'boolean') return null;
    const q = raw.quality;
    if (
      !isObj(q) ||
      !Array.isArray(q.unavailable) ||
      !q.unavailable.every((r) => (RESOURCES as readonly unknown[]).includes(r)) ||
      !FRESHNESS_SOURCES.includes(q.source as FreshnessSource) ||
      !Array.isArray(q.qualifiers) ||
      !q.qualifiers.every((x) => QUALIFIERS.includes(x as FreshnessQualifier))
    )
      return null;
    return {
      v: MISSION_VIEW_VERSION,
      missionId,
      at: raw.at,
      adapterId: raw.adapterId,
      mode: raw.mode as MissionCheckpoint['mode'],
      present: raw.present as boolean | undefined,
      status: raw.status as MissionStatus | undefined,
      hadResult: raw.hadResult as boolean | undefined,
      assigned: idList(raw.assigned),
      workers: enumMap(raw.workers, [...WORKER_STATES, NOT_REPORTED]),
      approvals: enumMap(raw.approvals, [...APPROVAL_STATUSES, NOT_REPORTED]),
      alerts: enumMap(raw.alerts, ALERT_PHASES),
      artifacts: idList(raw.artifacts),
      events: parseWatermark(raw.events),
      quality: {
        unavailable: q.unavailable as Resource[],
        source: q.source as FreshnessSource,
        qualifiers: q.qualifiers as FreshnessQualifier[],
      },
    };
  } catch {
    return null;
  }
}

/* --------------------------------- Digest --------------------------------- */

export type MissionChangeKind =
  | 'missionNoLongerReported'
  | 'missionReappeared'
  | 'status'
  | 'resultAppeared'
  | 'assigned'
  | 'unassigned'
  | 'workerState'
  | 'workerNoLongerReported'
  | 'workerReappeared'
  | 'approvalLinked'
  | 'approvalStatus'
  | 'approvalUnlinked'
  | 'approvalNoLongerReported'
  | 'alertOpened'
  | 'alertPhase'
  | 'alertNoLongerReported'
  | 'artifactNew'
  | 'dataBecameUnavailable'
  | 'dataRecovered'
  | 'freshnessChanged';

export interface MissionChange {
  kind: MissionChangeKind;
  /** Record id (worker, gate, alert, artifact) or resource name. */
  id?: string;
  /** Enum values or resource/freshness codes (localized by the UI). */
  from?: string;
  to?: string;
}

export type MissionUnknownReason =
  'unavailable-then' | 'unavailable-now' | 'mission-not-reported' | 'history-not-covered';

export interface MissionDigest {
  baseline: 'none' | 'different-source' | 'ok';
  since?: string;
  sourceThen?: MissionCheckpoint['mode'];
  sourceNow: MissionCheckpoint['mode'];
  /** Proven differences only. */
  changes: MissionChange[];
  /** Areas that could not be compared, with why. */
  unknown: Partial<Record<MissionArea, MissionUnknownReason>>;
  events: EventCoverage;
  /**
   * true: a change or a new event was proven. false: every area was comparable
   * and nothing changed, with exact event coverage. null: cannot say.
   */
  changed: boolean | null;
}

export function computeMissionDigest(
  s: DashboardSnapshot,
  missionId: string,
  cp: MissionCheckpoint | null,
  freshness: FreshnessView,
): MissionDigest {
  const sourceNow = s.provenance.mode;
  const down = new Set(unavailableResources(s));
  const events = missionEvents(s, missionId);
  if (!cp || cp.adapterId !== s.provenance.adapterId) {
    const reason: MissionUnknownReason = 'unavailable-then';
    return {
      baseline: cp ? 'different-source' : 'none',
      since: cp?.at,
      sourceThen: cp?.mode,
      sourceNow,
      changes: [],
      unknown: Object.fromEntries(MISSION_AREAS.map((a) => [a, reason])),
      events: eventCoverage(events, undefined, !down.has('events'), false),
      changed: null,
    };
  }

  const changes: MissionChange[] = [];
  const unknown: Partial<Record<MissionArea, MissionUnknownReason>> = {};
  const then = new Set(cp.quality.unavailable);

  // Data quality transitions are facts about the data, not about the mission.
  for (const r of RESOURCES) {
    if (!then.has(r) && down.has(r)) changes.push({ kind: 'dataBecameUnavailable', id: r });
    if (then.has(r) && !down.has(r)) changes.push({ kind: 'dataRecovered', id: r });
  }
  const fThen = [cp.quality.source, ...cp.quality.qualifiers].join('+');
  const fNow = [freshness.source, ...freshness.qualifiers].join('+');
  if (fThen !== fNow) changes.push({ kind: 'freshnessChanged', from: fThen, to: fNow });

  const mission = down.has('missions') ? undefined : s.missions.find((m) => m.id === missionId);
  const missionKnown = !down.has('missions') && cp.present !== undefined;
  if (!missionKnown) {
    const reason: MissionUnknownReason =
      cp.present === undefined ? 'unavailable-then' : 'unavailable-now';
    for (const a of ['status', 'workers', 'approvals', 'artifacts'] as const) unknown[a] = reason;
  } else if (cp.present && !mission) {
    changes.push({ kind: 'missionNoLongerReported', from: cp.status });
  } else if (!cp.present && mission) {
    // Reported again. This says nothing about execution having resumed.
    changes.push({ kind: 'missionReappeared', to: mission.status });
  }

  if (mission && cp.present && missionKnown) {
    if (cp.status !== undefined && cp.status !== mission.status)
      changes.push({ kind: 'status', from: cp.status, to: mission.status });
    if (!cp.hadResult && mission.result) changes.push({ kind: 'resultAppeared' });
    // Assignment is a fact of the mission record.
    const before = new Set(cp.assigned ?? []);
    const after = new Set(mission.assignedWorkerIds);
    for (const id of after) if (!before.has(id)) changes.push({ kind: 'assigned', id });
    for (const id of before) if (!after.has(id)) changes.push({ kind: 'unassigned', id });
    // Worker states: only for workers assigned both then and now.
    if (!cp.workers) unknown.workers = 'unavailable-then';
    else if (down.has('workers')) unknown.workers = 'unavailable-now';
    else
      for (const id of after) {
        if (!before.has(id)) continue;
        const prev = own(cp.workers, id);
        const w = s.workers.find((x) => x.id === id);
        const now: Reported<WorkerState> = w?.state ?? NOT_REPORTED;
        if (prev === undefined || prev === now) continue;
        if (now === NOT_REPORTED) changes.push({ kind: 'workerNoLongerReported', id, from: prev });
        else if (prev === NOT_REPORTED) changes.push({ kind: 'workerReappeared', id, to: now });
        else changes.push({ kind: 'workerState', id, from: prev, to: now });
      }
    // Approval gates linked to the mission.
    if (!cp.approvals) unknown.approvals = 'unavailable-then';
    else if (down.has('approvals')) unknown.approvals = 'unavailable-now';
    else {
      const linked = new Set(mission.approvalIds);
      for (const id of linked) {
        const prev = own(cp.approvals, id);
        const now: Reported<ApprovalStatus> =
          s.approvals.find((a) => a.id === id)?.status ?? NOT_REPORTED;
        if (prev === undefined) changes.push({ kind: 'approvalLinked', id, to: now });
        else if (prev !== now)
          changes.push(
            now === NOT_REPORTED
              ? { kind: 'approvalNoLongerReported', id, from: prev }
              : { kind: 'approvalStatus', id, from: prev, to: now },
          );
      }
      for (const id of Object.keys(cp.approvals))
        if (!linked.has(id)) changes.push({ kind: 'approvalUnlinked', id });
    }
    // Artifacts on the mission record.
    const seen = new Set(cp.artifacts ?? []);
    for (const a of mission.artifacts)
      if (!seen.has(a.id)) changes.push({ kind: 'artifactNew', id: a.id });
  } else if (missionKnown) {
    // Not reported then or not reported now: nothing to compare against.
    for (const a of ['status', 'workers', 'approvals', 'artifacts'] as const)
      unknown[a] = 'mission-not-reported';
  }

  // Alerts that name this mission (independent of the mission record).
  if (!cp.alerts) unknown.alerts = 'unavailable-then';
  else if (down.has('alerts')) unknown.alerts = 'unavailable-now';
  else {
    const nowIds = new Set<string>();
    for (const al of s.alerts) {
      if (!al.affected.some((x) => x.kind === 'mission' && x.id === missionId)) continue;
      nowIds.add(al.id);
      const prev = own(cp.alerts, al.id);
      const phase = alertPhase(al);
      if (prev === undefined) {
        if (phase !== 'resolved') changes.push({ kind: 'alertOpened', id: al.id, to: phase });
      } else if (prev !== phase)
        changes.push({ kind: 'alertPhase', id: al.id, from: prev, to: phase });
    }
    for (const id of Object.keys(cp.alerts))
      if (!nowIds.has(id))
        changes.push({ kind: 'alertNoLongerReported', id, from: own(cp.alerts, id) });
  }

  const cov = eventCoverage(events, cp.events, !down.has('events'));
  if (cov.state !== 'exact')
    unknown.events =
      cov.reason === 'events-unavailable-now'
        ? 'unavailable-now'
        : cov.reason === 'events-unavailable-then'
          ? 'unavailable-then'
          : 'history-not-covered';

  const recordChanges = changes.length > 0;
  const newEvents = cov.observedNew > 0;
  const allKnown = Object.keys(unknown).length === 0 && cov.state === 'exact';
  return {
    baseline: 'ok',
    since: cp.at,
    sourceThen: cp.mode,
    sourceNow,
    changes,
    unknown,
    events: cov,
    changed: recordChanges || newEvents ? true : allKnown ? false : null,
  };
}
