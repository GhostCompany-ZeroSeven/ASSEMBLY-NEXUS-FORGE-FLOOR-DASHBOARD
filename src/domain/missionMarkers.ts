import type { AttentionQueue } from './attention';
import type { Checkpoint } from './checkpoint';
import {
  computeMissionDigest,
  type FreshnessView,
  type MissionChangeKind,
  type MissionCheckpoint,
} from './missionView';
import { resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';

/**
 * Mission Control markers. A small, fixed grammar with one deterministic
 * definition each. Markers are orientation aids, never authority:
 *
 * - NEW: the mission is in the data now, and the comparable global last view
 *   (same source, missions loaded then and now) did not list it.
 * - CHANGED: this mission has its own last-view record from the same source,
 *   and a mission-record change or a new mission event is proven since then.
 *   Global data-quality changes (a resource failing, freshness) are not mission
 *   changes and do not set it.
 * - NEEDS FOUNDER: an approval gate linked to this mission is in the attention
 *   queue as PENDING_FOUNDER_GATE (open, requiring the human authority).
 *
 * No marker means "not proven", not "proven absent". An unknown comparison
 * never sets or clears a marker by guessing.
 */
export interface MissionMarkers {
  new: boolean;
  changed: boolean;
  founder: boolean;
}

const DATA_KINDS: ReadonlySet<MissionChangeKind> = new Set([
  'dataBecameUnavailable',
  'dataRecovered',
  'freshnessChanged',
]);

export function selectMissionMarkers(
  s: DashboardSnapshot,
  globalBaseline: Checkpoint | null,
  missionView: (missionId: string) => MissionCheckpoint | null,
  queue: AttentionQueue,
  freshness: FreshnessView,
): Map<string, MissionMarkers> {
  const out = new Map<string, MissionMarkers>();
  const missionsNow = !resourceUnavailable(s, 'missions');
  const then =
    globalBaseline && globalBaseline.adapterId === s.provenance.adapterId
      ? globalBaseline.missions
      : undefined;
  const founder = new Set<string>();
  for (const item of queue.items)
    if (item.reason === 'gate-open')
      for (const r of item.related) if (r.kind === 'mission') founder.add(r.id);

  for (const m of s.missions) {
    const isNew =
      missionsNow && then !== undefined && !Object.prototype.hasOwnProperty.call(then, m.id);
    const view = missionView(m.id);
    let changed = false;
    if (view && view.adapterId === s.provenance.adapterId) {
      const d = computeMissionDigest(s, m.id, view, freshness);
      changed = d.changes.some((c) => !DATA_KINDS.has(c.kind)) || d.events.observedNew > 0;
    }
    out.set(m.id, { new: isNew, changed, founder: founder.has(m.id) });
  }
  return out;
}

/** Latest source event time per mission (one pass). Missions without events are absent. */
export function lastActivityByMission(s: DashboardSnapshot): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of s.events) {
    if (!e.missionId) continue;
    const prev = out.get(e.missionId);
    if (prev === undefined || e.at > prev) out.set(e.missionId, e.at);
  }
  return out;
}
