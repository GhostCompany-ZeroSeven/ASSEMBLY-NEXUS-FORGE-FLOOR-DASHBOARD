import { href } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { ProgressBar, StatusBadge } from '@/components/ui';
import { MISSION_STATUS_META } from '@/domain/status';
import { formatClock, missionTiming } from '@/domain/time';
import type { Mission } from '@/domain/types';
import { useI18n } from '@/i18n/useI18n';
import { useNow, useSnapshot } from '@/store/hooks';

export function MissionCard({ mission }: { mission: Mission }) {
  const snapshot = useSnapshot();
  const now = useNow(1000);
  const { m } = useI18n();
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
            {m.status.mission[mission.status]}
          </StatusBadge>
          {mission.priority === 'high' || mission.priority === 'critical' ? (
            <span className="chip chip--hot">{m.status.priority[mission.priority]}</span>
          ) : null}
        </div>
        <div className="mission-card__title">{mission.title}</div>
        <ProgressBar
          value={mission.progress}
          tone={meta.tone}
          label={m.common.progressLabel(mission.id)}
        />
      </div>
      <div className="mission-card__side">
        <div className="mission-card__clock mono" title={m.missions.elapsedTitle}>
          {t.elapsedMs === null ? '--:--:--' : formatClock(t.elapsedMs)}
        </div>
        <div className="mission-card__sub">
          {t.remainingMs !== null
            ? m.missions.left(formatClock(t.remainingMs))
            : mission.status === 'COMPLETE' || mission.status === 'FAILED'
              ? m.missions.final
              : m.missions.noEstimate}
        </div>
        <div className="mission-card__crew">
          {workers.map((w) => (
            <CharacterAvatar key={w.id} characterId={w.characterId} state={w.state} size={22} />
          ))}
        </div>
        {mission.review.status !== 'NOT_REQUESTED' && (
          <div className="mission-card__sub">{m.status.review[mission.review.status]}</div>
        )}
      </div>
    </a>
  );
}
