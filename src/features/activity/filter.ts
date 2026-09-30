import {
  EVENT_CATEGORY,
  LOW_SIGNAL_EVENTS,
  type DashboardEvent,
  type EventCategory,
} from '@/domain/events';

export interface ActivityFilter {
  categories?: EventCategory[];
  workerId?: string;
  missionId?: string;
  includeLowSignal?: boolean;
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
      (!f.missionId || e.missionId === f.missionId),
  );
}
