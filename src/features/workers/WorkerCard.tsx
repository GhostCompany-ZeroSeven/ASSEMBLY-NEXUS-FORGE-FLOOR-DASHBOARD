import { href, withQuery } from '@/app/router';
import { useWorkerRoom } from '@/hooks/useWorkerRoom';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import { ProgressBar, StatusBadge } from '@/components/ui';
import { describeEvent } from '@/domain/describe';
import { findMission } from '@/domain/selectors';
import { WORKER_STATE_META } from '@/domain/status';
import { formatClock, toMs } from '@/domain/time';
import { useI18n } from '@/i18n/useI18n';
import type { Worker } from '@/domain/types';
import { useConfig, useNow, useSnapshot } from '@/store/hooks';
import { useMissionLabel } from '@/hooks/useMissionLabel';

/**
 * Worker card: identity, state, mission, task, progress, blockers, latest
 * activity, review state — and capabilities kept visibly separate from
 * authority grants.
 */
export function WorkerCard({
  worker,
  variant = 'full',
}: {
  worker: Worker;
  variant?: 'full' | 'compact';
}) {
  const snapshot = useSnapshot();
  const { crews } = useConfig();
  const missionRef = useMissionLabel();
  const now = useNow(1000);
  const { m, rel } = useI18n();
  const t = m.workerCard;
  const meta = WORKER_STATE_META[worker.state];
  const mission = findMission(snapshot, worker.currentMissionId);
  const task = mission?.tasks.find((t) => t.id === worker.currentTaskId);
  const lastEvent = worker.lastEventId
    ? snapshot.events.find((e) => e.id === worker.lastEventId)
    : [...snapshot.events].reverse().find((e) => e.workerId === worker.id);
  const since = toMs(worker.stateSince);
  const crew = crews.find((c) => c.id === worker.crewId);
  const room = useWorkerRoom()(worker.id);

  return (
    <article
      data-focus-id={`worker:${worker.id}`}
      className="worker-card"
      data-tone={meta.tone}
      data-state={worker.state}
      data-variant={variant}
    >
      <header className="worker-card__head">
        <div className="worker-card__avatar">
          <CharacterAvatar
            characterId={worker.characterId}
            state={worker.state}
            size={variant === 'compact' ? 44 : 60}
          />
        </div>
        <div className="worker-card__id">
          <h3 className="worker-card__name">{worker.name}</h3>
          <div className="worker-card__role">
            {worker.role}
            {crew && <span className="muted"> · {crew.label}</span>}
          </div>
          <div className="worker-card__state">
            <StatusBadge
              tone={meta.tone}
              pulse={worker.state === 'WORKING' || worker.state === 'BLOCKED'}
            >
              {m.status.worker[worker.state]}
            </StatusBadge>
            <span className="mono small" title={t.timeInState}>
              {since === null ? '--:--:--' : formatClock(now - since)}
            </span>
          </div>
        </div>
        <a
          className="icon-btn worker-card__expand"
          href={href.worker(worker.id)}
          aria-label={t.open(worker.name)}
          title={t.focusView}
        >
          <Icon name="expand" size={16} />
        </a>
      </header>

      <div className="worker-card__body">
        <div className="worker-card__row">
          <span className="worker-card__k">{t.mission}</span>
          <span>
            {mission ? (
              <a href={href.mission(mission.id)}>
                <span className="mono">{missionRef(mission)}</span> {mission.title}
              </a>
            ) : (
              <span className="muted">{m.common.none}</span>
            )}
          </span>
        </div>
        {room && (
          <div className="worker-card__row">
            <span className="worker-card__k">{t.room}</span>
            <span>
              <a href={withQuery(href.floor(), { worker: worker.id })}>{room.label}</a>
            </span>
          </div>
        )}
        <div className="worker-card__row">
          <span className="worker-card__k">{t.task}</span>
          <span>{task?.title ?? worker.currentActivity ?? <span className="muted">—</span>}</span>
        </div>
        {variant === 'full' && worker.currentActivity && task && (
          <div className="worker-card__row">
            <span className="worker-card__k">{t.doing}</span>
            <span>{worker.currentActivity}</span>
          </div>
        )}
        <ProgressBar
          value={worker.progress}
          tone={meta.tone}
          label={m.common.progressLabel(worker.name)}
        />

        {worker.blockers.length > 0 && (
          <ul className="worker-card__blockers">
            {worker.blockers.map((b) => (
              <li key={b.id}>
                <Icon name="alert" size={13} /> {b.description}
                {b.dependsOn?.kind === 'approval' && (
                  <a href={href.approvals()} className="small gate-link">
                    <Icon name="arrow-right" size={11} />
                    {t.gate}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {variant === 'full' && (
          <>
            {mission && mission.review.status !== 'NOT_REQUESTED' && (
              <div className="worker-card__row">
                <span className="worker-card__k">{t.review}</span>
                <span>{m.status.review[mission.review.status]}</span>
              </div>
            )}
            <div className="worker-card__row">
              <span className="worker-card__k">{t.latest}</span>
              <span className="small">
                {lastEvent ? (
                  <>
                    {describeEvent(lastEvent, snapshot, m).title}{' '}
                    <span className="muted">· {rel(lastEvent.at, now)}</span>
                  </>
                ) : (
                  <span className="muted">{t.noEvents}</span>
                )}
              </span>
            </div>
            <div className="worker-card__powers">
              <div>
                <div className="worker-card__k">{t.capabilities}</div>
                <div className="chips">
                  {worker.capabilities.length === 0 ? (
                    <span className="muted small">{m.common.none}</span>
                  ) : (
                    worker.capabilities.map((c) => (
                      <span key={c.id} className="chip chip--cap">
                        {c.label}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="worker-card__k">{t.authority}</div>
                <div className="chips">
                  {worker.authority.length === 0 ? (
                    <span className="chip chip--noauth">
                      <Icon name="lock" size={11} /> {t.noneGranted}
                    </span>
                  ) : (
                    worker.authority.map((a) => (
                      <span key={a.id} className="chip chip--auth" title={t.grantedBy(a.grantedBy)}>
                        {a.label}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
