import type { ConnectionStatus } from '@/adapters/types';
import { resourceUnavailable } from '@/domain/selectors';
import type { DashboardSnapshot } from '@/domain/snapshot';

/**
 * An AUTOMATIC "last viewed" record (on leaving a page or hiding the tab) is
 * written only from complete, connected data. Otherwise the older, complete
 * record is kept: an outage at the moment of leaving must not erase the
 * baseline. Explicit "mark as seen" records whatever is on screen, and each
 * area that was unavailable is stored as unknown.
 */
export function canAutoRecord(
  s: DashboardSnapshot | null,
  status: ConnectionStatus,
): s is DashboardSnapshot {
  if (!s || status !== 'connected') return false;
  return !['missions', 'workers', 'approvals', 'alerts', 'events'].some((r) =>
    resourceUnavailable(s, r),
  );
}
