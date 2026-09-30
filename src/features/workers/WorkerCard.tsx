import { href } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import { ProgressBar, StatusBadge } from '@/components/ui';
import { describeEvent } from '@/domain/describe';
import { findMission } from '@/domain/selectors';
import { REVIEW_STATUS_META, WORKER_STATE_META } from '@/domain/status';
import { formatClock, formatRelative, toMs } from '@/domain/time';
import type { Worker } from '@/domain/types';
import { useConfig, useNow, useSnapshot } from '@/store/hooks';

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
  const now = useNow(1000);
  const meta = WORKER_STATE_META[worker.state];
  const mission = findMission(snapshot, worker.currentMissionId);
  const task = mission?.tasks.find((t) => t.id === worker.currentTaskId);
  const lastEvent = worker.lastEventId
    ? snapshot.events.find((e) => e.id === worker.lastEventId)
    : [...snapshot.events].reverse().find((e) => e.workerId === worker.id);
  const since = toMs(worker.stateSince);
  const crew = crews.find((c) => c.id === worker.crewId);

  return (
    <article
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
              {meta.label}
            </StatusBadge>
            <span className="mono small" title="Time in current state">
              {since === null ? '--:--:--' : formatClock(now - since)}
            </span>
          </div>
        </div>
        <a
          className="icon-btn worker-card__expand"
          href={href.worker(worker.id)}
          aria-label={`Open ${worker.name} focus view`}
          title="Focus view"
        >
          <Icon name="expand" size={16} />
        </a>
      </header>

      <div className="worker-card__body">
        <div className="worker-card__row">
          <span className="worker-card__k">Mission</span>
          <span>
            {mission ? (
              <a href={href.mission(mission.id)}>
                <span className="mono">{mission.id}</span> {mission.title}
              </a>
            ) : (
              <span className="muted">none</span>
            )}
          </span>
        </div>
        <div className="worker-card__row">
          <span className="worker-card__k">Task</span>
          <span>{task?.title ?? worker.currentActivity ?? <span className="muted">—</span>}</span>
        </div>
        {variant === 'full' && worker.currentActivity && task && (
          <div className="worker-card__row">
            <span className="worker-card__k">Doing</span>
            <span>{worker.currentActivity}</span>
          </div>
        )}
        <ProgressBar value={worker.progress} tone={meta.tone} label={`${worker.name} progress`} />

        {worker.blockers.length > 0 && (
          <ul className="worker-card__blockers">
            {worker.blockers.map((b) => (
              <li key={b.id}>
                <Icon name="alert" size={13} /> {b.description}
                {b.dependsOn?.kind === 'approval' && (
                  <a href={href.approvals()} className="small">
                    {' '}
                    → gate
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
                <span className="worker-card__k">Review</span>
                <span>{REVIEW_STATUS_META[mission.review.status].label}</span>
              </div>
            )}
            <div className="worker-card__row">
              <span className="worker-card__k">Latest</span>
              <span className="small">
                {lastEvent ? (
                  <>
                    {describeEvent(lastEvent, snapshot).title}{' '}
                    <span className="muted">· {formatRelative(lastEvent.at, now)}</span>
                  </>
                ) : (
                  <span className="muted">no events</span>
                )}
              </span>
            </div>
            <div className="worker-card__powers">
              <div>
                <div className="worker-card__k">Capabilities</div>
                <div className="chips">
                  {worker.capabilities.length === 0 ? (
                    <span className="muted small">none</span>
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
                <div className="worker-card__k">Authority</div>
                <div className="chips">
                  {worker.authority.length === 0 ? (
                    <span className="chip chip--noauth">
                      <Icon name="lock" size={11} /> None granted
                    </span>
                  ) : (
                    worker.authority.map((a) => (
                      <span
                        key={a.id}
                        className="chip chip--auth"
                        title={`Granted by ${a.grantedBy}`}
                      >
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
