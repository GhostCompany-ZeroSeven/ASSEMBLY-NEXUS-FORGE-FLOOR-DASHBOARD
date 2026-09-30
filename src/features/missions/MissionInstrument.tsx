import { SegmentClock, StatusBadge } from '@/components/ui';
import { MISSION_STATUS_META } from '@/domain/status';
import { formatDuration, missionTiming } from '@/domain/time';
import type { Mission } from '@/domain/types';
import { useNow } from '@/store/hooks';

/**
 * Circuit-board instrument cluster for a mission: status annunciator,
 * elapsed clock and (only when the backend estimates it) time remaining.
 */
export function MissionInstrument({
  mission,
  size = 'lg',
}: {
  mission: Mission;
  size?: 'md' | 'lg' | 'xl';
}) {
  const now = useNow(1000);
  const meta = MISSION_STATUS_META[mission.status];
  const t = missionTiming(mission, now);
  const finished =
    mission.status === 'COMPLETE' || mission.status === 'FAILED' || mission.status === 'CANCELLED';

  return (
    <div className="instrument" data-tone={meta.tone} data-status={mission.status}>
      <div className="instrument__annunciator" aria-live="polite">
        <span className="instrument__lamp" aria-hidden="true" />
        {meta.label.toUpperCase()}
      </div>
      <div className="instrument__clocks">
        <SegmentClock
          label={finished ? 'Duration' : 'Elapsed'}
          ms={t.elapsedMs}
          tone={meta.tone}
          size={size}
          caption={t.elapsedMs === null ? 'Not started' : undefined}
        />
        {!finished && (
          <SegmentClock
            label={t.overrun ? 'Over estimate' : 'Time remaining'}
            ms={
              t.remainingMs === null
                ? null
                : t.overrun
                  ? (t.elapsedMs ?? 0) - (mission.estimate?.durationMs ?? 0)
                  : t.remainingMs
            }
            tone={t.overrun ? 'danger' : 'warning'}
            size={size}
            caption={
              mission.estimate ? (
                <>
                  EST. {formatDuration(mission.estimate.durationMs)} · {mission.estimate.source}
                  {mission.estimate.confidence && ` · ${mission.estimate.confidence} confidence`}
                </>
              ) : (
                'NO ESTIMATE PROVIDED'
              )
            }
          />
        )}
      </div>
      {mission.status === 'WAITING_APPROVAL' && (
        <StatusBadge tone="warning" pulse>
          Held at Founder Gate
        </StatusBadge>
      )}
    </div>
  );
}
