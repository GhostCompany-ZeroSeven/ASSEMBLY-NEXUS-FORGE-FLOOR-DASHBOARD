import { useMemo } from 'react';
import { selectAttentionQueue } from '@/domain/attention';
import { selectFreshness } from '@/domain/freshness';
import { lastActivityByMission, selectMissionMarkers } from '@/domain/missionMarkers';
import {
  useConfig,
  useDashboard,
  useLastView,
  useMissionViews,
  useNow,
  useSnapshot,
} from '@/store/hooks';

/** Markers and last-activity times for every mission, recomputed only when inputs change. */
export function useMissionMarkers() {
  const snapshot = useSnapshot();
  const { status } = useDashboard();
  const { governance } = useConfig();
  const { baseline } = useLastView();
  const views = useMissionViews();
  const now = useNow(30_000);
  const freshness = selectFreshness(snapshot, status, now);
  const freshKey = [freshness.source, ...freshness.qualifiers].join('+');
  return useMemo(() => {
    const queue = selectAttentionQueue(snapshot, governance.humanAuthority, freshness);
    return {
      markers: selectMissionMarkers(snapshot, baseline, views.get, queue, freshness),
      lastActivity: lastActivityByMission(snapshot),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, baseline, views, governance.humanAuthority, freshKey]);
}
