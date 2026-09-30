import { href } from '@/app/router';
import { EmptyState } from '@/components/ui';
import { describeEvent } from '@/domain/describe';
import { EVENT_CATEGORY } from '@/domain/events';
import { filterEvents, type ActivityFilter } from './filter';
import { formatTimeOfDay } from '@/domain/time';
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
  const events = filterEvents(snapshot.events, filter).slice(-limit).reverse();
  if (events.length === 0) return <EmptyState title="No activity yet" />;

  return (
    <ol className="stream" aria-label="Activity stream">
      {events.map((e) => {
        const d = describeEvent(e, snapshot);
        const category = EVENT_CATEGORY[e.kind];
        return (
          <li key={e.id} className="stream__item" data-category={category} data-kind={e.kind}>
            <time className="stream__time mono" dateTime={e.at}>
              {formatTimeOfDay(e.at)}
            </time>
            <span className="stream__dot" aria-hidden="true" />
            <div className="stream__content">
              <div className="stream__title">{d.title}</div>
              {d.detail && <div className="stream__detail">{d.detail}</div>}
            </div>
            {showLinks && (
              <div className="stream__refs">
                {e.missionId && (
                  <a className="mono" href={href.mission(e.missionId)}>
                    {e.missionId}
                  </a>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
