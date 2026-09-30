import { eventRefs } from './refs';
import {
  EVENT_CATEGORY,
  LOW_SIGNAL_EVENTS,
  type DashboardEvent,
  type EventCategory,
  type EventVia,
} from '@/domain/events';

export interface ActivityFilter {
  categories?: EventCategory[];
  workerId?: string;
  missionId?: string;
  includeLowSignal?: boolean;
  /** Only events whose EVENT time is at or after this instant (ISO). */
  since?: string;
  /** Only events received over this ingest path. */
  via?: EventVia;
  /** Only events that EXPLICITLY name this approval gate / alert (see refs.ts). */
  approvalId?: string;
  alertId?: string;
}

export function filterEvents(
  events: readonly DashboardEvent[],
  f: ActivityFilter,
): DashboardEvent[] {
  return events.filter(
    (e) =>
      (f.includeLowSignal || !LOW_SIGNAL_EVENTS.has(e.kind)) &&
      (!f.categories || f.categories.includes(EVENT_CATEGORY[e.kind])) &&
      (!f.workerId || e.workerId === f.workerId) &&
      (!f.missionId || e.missionId === f.missionId) &&
      (!f.since || e.at >= f.since) &&
      (!f.via || e.via === f.via) &&
      (!f.approvalId || eventRefs(e).some((r) => r.kind === 'approval' && r.id === f.approvalId)) &&
      (!f.alertId || eventRefs(e).some((r) => r.kind === 'alert' && r.id === f.alertId)),
  );
}

/**
 * Timeline order: newest EVENT time first (ties keep arrival order, newest
 * first). Only observed events are shown; nothing is interpolated.
 */
export function timelineOrder(events: readonly DashboardEvent[]): DashboardEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i)
    .map((x) => x.e);
}

/**
 * Events that ARRIVED out of order: received after another event whose event
 * time is later. Derived only from adapter-stamped arrival times; events that
 * arrived together (e.g. a history load) are never flagged against each other.
 */
export function arrivedOutOfOrder(events: readonly DashboardEvent[]): Set<string> {
  const byArrival = events
    .filter((e) => e.receivedAt)
    .map((e) => ({ id: e.id, at: e.at, rx: e.receivedAt! }))
    .sort((a, b) => a.rx.localeCompare(b.rx));
  const late = new Set<string>();
  let maxBefore = '';
  let i = 0;
  while (i < byArrival.length) {
    // One arrival batch: same receivedAt.
    let j = i;
    let batchMax = '';
    while (j < byArrival.length && byArrival[j]!.rx === byArrival[i]!.rx) {
      const x = byArrival[j]!;
      if (maxBefore && x.at < maxBefore) late.add(x.id);
      if (x.at > batchMax) batchMax = x.at;
      j++;
    }
    if (batchMax > maxBefore) maxBefore = batchMax;
    i = j;
  }
  return late;
}
