import { createWatermark, parseWatermark, type EventWatermark } from './eventCoverage';
import { resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';
import { WORKER_STATES, type ApprovalStatus, type MissionStatus, type WorkerState } from './types';

/**
 * "Last looked" checkpoint: a bounded fingerprint of what the dashboard showed
 * when the Founder last viewed it. Used ONLY to compute the change digest.
 *
 * It stores ids and enum states, never authority, never display text, never
 * decisions. A resource that could not be loaded is stored as ABSENT
 * (undefined), so "we did not know" is never mistaken for "there was nothing".
 */
/**
 * v2 (Phase 6): the event watermark (ids + newest SOURCE time) replaced v1's
 * `lastEventAt`, so event coverage never compares the source clock with the
 * browser clock. v1 records are discarded, not migrated (derived local state).
 */
export const CHECKPOINT_VERSION = 2;
/** Per-resource cap; beyond it the fingerprint is marked truncated (UNKNOWN comparisons). */
export const MAX_CHECKPOINT_ENTRIES = 2000;

/** Clock tolerance for a stored checkpoint's time. */
const FUTURE_TOLERANCE_MS = 60_000;

export type AlertPhase = 'open' | 'acknowledged' | 'resolved';

export interface Checkpoint {
  v: typeof CHECKPOINT_VERSION;
  /** Wall-clock time the view was recorded. */
  at: string;
  /** Source identity: digests across different sources are not comparable. */
  adapterId: string;
  mode: 'demo' | 'live' | 'disconnected' | 'replay';
  missions?: Record<string, MissionStatus>;
  workers?: Record<string, WorkerState>;
  approvals?: Record<string, ApprovalStatus>;
  alerts?: Record<string, AlertPhase>;
  /** Artifact ids known at the time (bounded). */
  artifacts?: string[];
  /** Events retained at the time (absent when the events resource was unavailable). */
  events?: EventWatermark;
  truncated?: boolean;
}

export const MISSION_STATUSES: readonly MissionStatus[] = [
  'QUEUED',
  'ACTIVE',
  'WAITING_REVIEW',
  'WAITING_APPROVAL',
  'BLOCKED',
  'COMPLETE',
  'FAILED',
  'CANCELLED',
  'UNKNOWN',
];
export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'PENDING',
  'HELD',
  'APPROVED',
  'DENIED',
  'EXPIRED',
  'WITHDRAWN',
  'UNKNOWN',
];
export const ALERT_PHASES: readonly AlertPhase[] = ['open', 'acknowledged', 'resolved'];
export const MODES = ['demo', 'live', 'disconnected', 'replay'] as const;

export function alertPhase(a: { acknowledgedAt?: string; resolvedAt?: string }): AlertPhase {
  return a.resolvedAt ? 'resolved' : a.acknowledgedAt ? 'acknowledged' : 'open';
}

function capped<T>(entries: [string, T][]): { map: Record<string, T>; truncated: boolean } {
  const truncated = entries.length > MAX_CHECKPOINT_ENTRIES;
  return {
    map: Object.fromEntries(entries.slice(0, MAX_CHECKPOINT_ENTRIES)),
    truncated,
  };
}

/** Build a checkpoint from what the dashboard currently shows. */
export function createCheckpoint(s: DashboardSnapshot, atIso: string): Checkpoint {
  let truncated = false;
  const take = <T>(resource: string, entries: [string, T][]) => {
    if (resourceUnavailable(s, resource)) return undefined;
    const c = capped(entries);
    truncated ||= c.truncated;
    return c.map;
  };
  const artifacts = s.missions.flatMap((m) => m.artifacts.map((a) => a.id));
  if (artifacts.length > MAX_CHECKPOINT_ENTRIES) truncated = true;
  return {
    v: CHECKPOINT_VERSION,
    at: atIso,
    adapterId: s.provenance.adapterId,
    mode: s.provenance.mode,
    missions: take(
      'missions',
      s.missions.map((m) => [m.id, m.status]),
    ),
    workers: take(
      'workers',
      s.workers.map((w) => [w.id, w.state]),
    ),
    approvals: take(
      'approvals',
      s.approvals.map((a) => [a.id, a.status]),
    ),
    alerts: take(
      'alerts',
      s.alerts.map((a) => [a.id, alertPhase(a)]),
    ),
    artifacts: resourceUnavailable(s, 'missions')
      ? undefined
      : artifacts.slice(0, MAX_CHECKPOINT_ENTRIES),
    events: resourceUnavailable(s, 'events') ? undefined : createWatermark(s.events),
    truncated: truncated || undefined,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function enumMap<T extends string>(
  v: unknown,
  allowed: readonly T[],
): Record<string, T> | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) throw new Error('bad map');
  const entries = Object.entries(v);
  if (entries.length > MAX_CHECKPOINT_ENTRIES) throw new Error('too large');
  const out: Record<string, T> = Object.create(null) as Record<string, T>;
  for (const [k, val] of entries) {
    if (typeof val !== 'string' || !(allowed as readonly string[]).includes(val) || k.length > 200)
      throw new Error('bad entry');
    out[k] = val as T;
  }
  return out;
}

/**
 * Parse an untrusted stored checkpoint. Anything malformed, oversized, from
 * another version, or carrying unexpected types is REJECTED as a whole (null),
 * which the digest reports as "no baseline": it fails closed, never guesses.
 * Unknown extra fields are dropped (they can never carry meaning, e.g. authority).
 */
export function parseCheckpoint(raw: unknown, nowMs?: number): Checkpoint | null {
  try {
    if (!isObj(raw) || raw.v !== CHECKPOINT_VERSION) return null;
    if (!isIso(raw.at) || typeof raw.adapterId !== 'string' || raw.adapterId.length > 200)
      return null;
    // A checkpoint dated in the future (clock change, tampering) would hide every
    // later event and read as "nothing changed": reject it.
    if (nowMs !== undefined && Date.parse(raw.at) > nowMs + FUTURE_TOLERANCE_MS) return null;
    if (!(MODES as readonly unknown[]).includes(raw.mode)) return null;
    let artifacts: string[] | undefined;
    if (raw.artifacts !== undefined) {
      if (
        !Array.isArray(raw.artifacts) ||
        raw.artifacts.length > MAX_CHECKPOINT_ENTRIES ||
        !raw.artifacts.every((x) => typeof x === 'string' && x.length <= 200)
      )
        return null;
      artifacts = raw.artifacts as string[];
    }
    return {
      v: CHECKPOINT_VERSION,
      at: raw.at,
      adapterId: raw.adapterId,
      mode: raw.mode as Checkpoint['mode'],
      missions: enumMap(raw.missions, MISSION_STATUSES),
      workers: enumMap(raw.workers, WORKER_STATES),
      approvals: enumMap(raw.approvals, APPROVAL_STATUSES),
      alerts: enumMap(raw.alerts, ALERT_PHASES),
      artifacts,
      events: parseWatermark(raw.events),
      truncated: raw.truncated === true || undefined,
    };
  } catch {
    return null;
  }
}

/** The schema version a stored record claims, if any (to report "outdated", not "corrupt"). */
export function storedVersion(raw: unknown): number | undefined {
  return isObj(raw) && typeof raw.v === 'number' ? raw.v : undefined;
}
