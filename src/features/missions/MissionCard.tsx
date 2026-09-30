import { href } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import { ProgressBar, StatusBadge } from '@/components/ui';
import type { MissionMarkers } from '@/domain/missionMarkers';
import { MISSION_STATUS_META } from '@/domain/status';
import { formatClock, missionTiming } from '@/domain/time';
import type { Mission } from '@/domain/types';
import { useI18n } from '@/i18n/useI18n';
import { useNow, useSnapshot } from '@/store/hooks';

export function MissionCard({
  mission,
  markers,
}: {
  mission: Mission;
  /** Orientation markers (see domain/missionMarkers.ts). Never authority. */
  markers?: MissionMarkers;
}) {
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
        {markers && (markers.founder || markers.new || markers.changed) && (
          <ul className="markers" aria-label={m.marker.label}>
            {markers.founder && (
              <li className="marker" data-marker="founder" title={m.marker.founderTitle}>
                <Icon name="gate" size={12} />
                {m.marker.founder}
                <span className="visually-hidden">: {m.marker.founderTitle}</span>
              </li>
            )}
            {markers.new && (
              <li className="marker" data-marker="new" title={m.marker.newTitle}>
                {m.marker.new}
                <span className="visually-hidden">: {m.marker.newTitle}</span>
              </li>
            )}
            {markers.changed && (
              <li className="marker" data-marker="changed" title={m.marker.changedTitle}>
                {m.marker.changed}
                <span className="visually-hidden">: {m.marker.changedTitle}</span>
              </li>
            )}
          </ul>
        )}
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
