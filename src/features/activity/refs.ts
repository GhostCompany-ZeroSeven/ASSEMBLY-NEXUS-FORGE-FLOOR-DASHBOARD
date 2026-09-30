import { href, withQuery } from '@/app/router';
import type { DashboardEvent } from '@/domain/events';

export interface EventRef {
  kind: 'approval' | 'alert' | 'artifact';
  id: string;
  href: string;
}

/**
 * References an event carries EXPLICITLY in its payload. Nothing is inferred:
 * an event without an approval/alert/artifact id gets no such link, and no room
 * is shown (events do not record where a worker was at the time).
 */
export function eventRefs(e: DashboardEvent): EventRef[] {
  switch (e.kind) {
    case 'approval.requested':
      return [
        {
          kind: 'approval',
          id: e.payload.request.id,
          href: withQuery(href.approvals(), { focus: e.payload.request.id }),
        },
      ];
    case 'approval.decided':
      return [
        {
          kind: 'approval',
          id: e.payload.approvalId,
          href: withQuery(href.approvals(), { focus: e.payload.approvalId }),
        },
      ];
    case 'alert.raised':
      return [
        {
          kind: 'alert',
          id: e.payload.alert.id,
          href: withQuery(href.alerts(), { focus: e.payload.alert.id }),
        },
      ];
    case 'alert.acknowledged':
    case 'alert.resolved':
      return [
        {
          kind: 'alert',
          id: e.payload.alertId,
          href: withQuery(href.alerts(), { focus: e.payload.alertId }),
        },
      ];
    case 'artifact.produced': {
      const missionId = e.payload.artifact.missionId || e.missionId;
      return missionId
        ? [
            {
              kind: 'artifact',
              id: e.payload.artifact.id,
              href: withQuery(href.mission(missionId), { focus: e.payload.artifact.id }),
            },
          ]
        : [];
    }
    default:
      return [];
  }
}
