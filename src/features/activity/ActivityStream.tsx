import { href } from '@/app/router';
import { EmptyState } from '@/components/ui';
import { describeEvent } from '@/domain/describe';
import { EVENT_CATEGORY } from '@/domain/events';
import { filterEvents, type ActivityFilter } from './filter';
import { eventRefs } from './refs';
import { formatTimeOfDay } from '@/domain/time';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';

/** Chronological operations stream rendered from structured events. */
export function ActivityStream({
  filter = {},
  limit = 50,
  showLinks = true,
}: {
  filter?: ActivityFilter;
  limit?: number;
  showLinks?: boolean;
}) {
  const snapshot = useSnapshot();
  const { m } = useI18n();
  const events = filterEvents(snapshot.events, filter).slice(-limit).reverse();
  if (events.length === 0) return <EmptyState title={m.activity.none} />;

  return (
    <ol className="stream" aria-label={m.activity.stream}>
      {events.map((e) => {
        const d = describeEvent(e, snapshot, m);
        const category = EVENT_CATEGORY[e.kind];
        return (
          <li
            key={e.id}
            className="stream__item"
            data-category={category}
            data-kind={e.kind}
            data-focus-id={e.id}
          >
            <time className="stream__time mono" dateTime={e.at} title={e.at}>
              {formatTimeOfDay(e.at)}
            </time>
            <span className="stream__dot" aria-hidden="true" />
            <div className="stream__content">
              <div className="stream__title">{d.title}</div>
              {d.detail && <div className="stream__detail">{d.detail}</div>}
            </div>
            {showLinks && (
              <div className="stream__refs">
                {e.workerId && (
                  <a href={href.worker(e.workerId)}>
                    {snapshot.workers.find((w) => w.id === e.workerId)?.name.split(' ')[0] ??
                      e.workerId}
                  </a>
                )}
                {e.missionId && (
                  <a className="mono" href={href.mission(e.missionId)}>
                    {e.missionId}
                  </a>
                )}
                {eventRefs(e).map((r) => (
                  <a key={`${r.kind}:${r.id}`} className="mono" href={r.href}>
                    <span className="visually-hidden">{m.search.type[r.kind]} </span>
                    {r.id}
                  </a>
                ))}
                {e.via && (
                  <span className="stream__via" data-via={e.via} title={m.activity.viaTitle[e.via]}>
                    {m.activity.via[e.via]}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
