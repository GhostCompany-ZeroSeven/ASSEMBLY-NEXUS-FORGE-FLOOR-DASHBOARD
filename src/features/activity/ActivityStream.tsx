import { useMemo } from 'react';
import { href } from '@/app/router';
import { EmptyState } from '@/components/ui';
import { describeEvent } from '@/domain/describe';
import { EVENT_CATEGORY, type DashboardEvent } from '@/domain/events';
import { resourceUnavailable } from '@/domain/selectors';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type { Messages } from '@/i18n/en';
import { arrivedOutOfOrder, filterEvents, timelineOrder, type ActivityFilter } from './filter';
import { eventRefs } from './refs';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';
import { useMissionLabel } from '@/hooks/useMissionLabel';

type StateIndex = {
  missions: Map<string, DashboardSnapshot['missions'][number]>;
  workers: Map<string, DashboardSnapshot['workers'][number]>;
};

/**
 * Current state of the record an event names, from the LATEST data. Labelled
 * "Now" in the UI: it is not the state at the time of the event.
 */
function currentState(e: DashboardEvent, idx: StateIndex, m: Messages): string | null {
  if (e.missionId) {
    const mission = idx.missions.get(e.missionId);
    return mission ? m.status.mission[mission.status] : m.activity.gone;
  }
  if (e.workerId) {
    const worker = idx.workers.get(e.workerId);
    return worker ? m.status.worker[worker.state] : m.activity.gone;
  }
  return null;
}

/**
 * Operations timeline rendered from structured, OBSERVED events only, newest
 * event time first. Arrival facts (path, time, out-of-order) come from the
 * adapter's ingest stamps and are shown separately from the event time.
 */
export function ActivityStream({
  filter = {},
  limit = 50,
  showLinks = true,
  showNow = false,
  details = false,
  newIds,
  boundary = false,
}: {
  filter?: ActivityFilter;
  limit?: number;
  showLinks?: boolean;
  /** Show the linked record's CURRENT state next to each event. */
  showNow?: boolean;
  /** Show when each event was received, not only how. */
  details?: boolean;
  /** Events not observed at a checkpoint (tagged "new since your view"). */
  newIds?: ReadonlySet<string>;
  /** Mark where retained history begins when the whole filtered history is shown. */
  boundary?: boolean;
}) {
  const snapshot = useSnapshot();
  const { m, pct, time, dateTime } = useI18n();
  const missionRef = useMissionLabel();
  const late = useMemo(() => arrivedOutOfOrder(snapshot.events), [snapshot.events]);
  const index = useMemo<StateIndex | null>(
    () =>
      showNow
        ? {
            missions: new Map(snapshot.missions.map((x) => [x.id, x])),
            workers: new Map(snapshot.workers.map((x) => [x.id, x])),
          }
        : null,
    [showNow, snapshot.missions, snapshot.workers],
  );
  // Bounded input (the log keeps at most MAX_EVENTS), so filtering per render is cheap.
  const all = timelineOrder(filterEvents(snapshot.events, filter));
  const events = all.slice(0, limit);
  const t = m.activity;
  // EMPTY is not UNKNOWN: with the events resource unavailable, an empty list
  // proves nothing and a non-empty one may be incomplete.
  const unavailable = resourceUnavailable(snapshot, 'events');
  const warning = unavailable && (
    <p className="brief__warning" role="note">
      {t.unavailable}
    </p>
  );
  if (events.length === 0)
    return (
      <>
        {warning}
        <EmptyState title={unavailable ? t.noneUnknown : t.none} />
      </>
    );
  let oldestRetained: string | undefined;
  if (boundary && all.length <= limit)
    for (const e of snapshot.events)
      if (oldestRetained === undefined || e.at < oldestRetained) oldestRetained = e.at;

  return (
    <>
      {warning}
      <ol className="stream" aria-label={m.activity.stream}>
        {events.map((e) => {
          const d = describeEvent(e, snapshot, m, pct);
          const category = EVENT_CATEGORY[e.kind];
          const now = index ? currentState(e, index, m) : null;
          const isLate = late.has(e.id);
          const isNew = newIds?.has(e.id) ?? false;
          return (
            <li
              key={e.id}
              className="stream__item"
              data-category={category}
              data-kind={e.kind}
              data-focus-id={e.id}
            >
              <time
                className="stream__time mono"
                dateTime={e.at}
                title={t.eventTitle(
                  dateTime(e.at),
                  e.receivedAt ? dateTime(e.receivedAt) : t.receivedUnknown,
                )}
              >
                {time(e.at)}
              </time>
              <span className="stream__dot" aria-hidden="true" />
              <div className="stream__content">
                <div className="stream__title">{d.title}</div>
                {d.detail && <div className="stream__detail">{d.detail}</div>}
              </div>
              <div className="stream__refs">
                {isNew && (
                  <span className="stream__new" title={t.newSinceViewTitle}>
                    {t.newSinceView}
                  </span>
                )}
                {showLinks && (
                  <>
                    {e.workerId && (
                      <a href={href.worker(e.workerId)}>
                        {snapshot.workers.find((w) => w.id === e.workerId)?.name.split(' ')[0] ??
                          e.workerId}
                      </a>
                    )}
                    {e.missionId && (
                      <a className="mono" href={href.mission(e.missionId)}>
                        {missionRef(e.missionId)}
                      </a>
                    )}
                    {eventRefs(e).map((r) => (
                      <a key={`${r.kind}:${r.id}`} className="mono" href={r.href}>
                        <span className="visually-hidden">{m.search.type[r.kind]} </span>
                        {r.id}
                      </a>
                    ))}
                  </>
                )}
                {e.via && (
                  <span className="stream__via" data-via={e.via} title={t.viaTitle[e.via]}>
                    {t.via[e.via]}
                  </span>
                )}
                {isLate && (
                  <span className="stream__late" title={t.lateTitle}>
                    {t.late}
                  </span>
                )}
                {details && (
                  <span className="stream__received mono">
                    {t.received(e.receivedAt ? time(e.receivedAt) : t.receivedUnknown)}
                  </span>
                )}
                {now && (
                  <span className="stream__now" title={t.nowTitle}>
                    {t.now}: {now}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {oldestRetained && (
        <p className="stream__boundary" role="note">
          {t.historyBoundary(dateTime(oldestRetained))}
        </p>
      )}
    </>
  );
}
