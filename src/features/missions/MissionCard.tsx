import { href } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { ProgressBar, StatusBadge } from '@/components/ui';
import { MISSION_STATUS_META, REVIEW_STATUS_META } from '@/domain/status';
import { formatClock, missionTiming } from '@/domain/time';
import type { Mission } from '@/domain/types';
import { useNow, useSnapshot } from '@/store/hooks';

export function MissionCard({ mission }: { mission: Mission }) {
  const snapshot = useSnapshot();
  const now = useNow(1000);
  const meta = MISSION_STATUS_META[mission.status];
  const t = missionTiming(mission, now);
  const workers = mission.assignedWorkerIds
    .map((id) => snapshot.workers.find((w) => w.id === id))
    .filter((w) => w !== undefined);

  return (
    <a
      className="mission-card"
      href={href.mission(mission.id)}
      data-tone={meta.tone}
      data-status={mission.status}
    >
      <div className="mission-card__rail" aria-hidden="true" />
      <div className="mission-card__main">
        <div className="mission-card__top">
          <span className="mono mission-card__id">{mission.id}</span>
          <StatusBadge tone={meta.tone} size="sm" pulse={mission.status === 'ACTIVE'}>
            {meta.label}
          </StatusBadge>
          {mission.priority === 'high' || mission.priority === 'critical' ? (
            <span className="chip chip--hot">{mission.priority}</span>
          ) : null}
        </div>
        <div className="mission-card__title">{mission.title}</div>
        <ProgressBar value={mission.progress} tone={meta.tone} label={`${mission.id} progress`} />
      </div>
      <div className="mission-card__side">
        <div className="mission-card__clock mono" title="Elapsed">
          {t.elapsedMs === null ? '--:--:--' : formatClock(t.elapsedMs)}
        </div>
        <div className="mission-card__sub">
          {t.remainingMs !== null
            ? `${formatClock(t.remainingMs)} left (est.)`
            : mission.status === 'COMPLETE' || mission.status === 'FAILED'
              ? 'final'
              : 'no estimate'}
        </div>
        <div className="mission-card__crew">
          {workers.map((w) => (
            <CharacterAvatar key={w.id} characterId={w.characterId} state={w.state} size={22} />
          ))}
        </div>
        {mission.review.status !== 'NOT_REQUESTED' && (
          <div className="mission-card__sub">{REVIEW_STATUS_META[mission.review.status].label}</div>
        )}
      </div>
    </a>
  );
}
