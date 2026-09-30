import { href, withQuery } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import { EmptyState, KeyValue, Panel, ProgressBar, StatusBadge } from '@/components/ui';
import { findMission } from '@/domain/selectors';
import {
  CERT_TONE,
  MISSION_STATUS_META,
  REVIEW_STATUS_META,
  WORKER_STATE_META,
  type Tone,
} from '@/domain/status';
import type { TaskStatus } from '@/domain/types';
import { ActivityStream } from '@/features/activity/ActivityStream';
import { ApprovalGateCard } from '@/features/approvals/ApprovalGateCard';
import { useNow, useSnapshot } from '@/store/hooks';
import { MissionInstrument } from './MissionInstrument';
import { MissionResultPanel } from './MissionResultPanel';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { useWorkerRoom } from '@/hooks/useWorkerRoom';
import { AlertCard } from '@/features/alerts/AlertCard';
import { useI18n } from '@/i18n/useI18n';

const TASK_TONE: Record<TaskStatus, Tone> = {
  PENDING: 'muted',
  IN_PROGRESS: 'active',
  DONE: 'success',
  BLOCKED: 'danger',
  FAILED: 'danger',
  SKIPPED: 'neutral',
};

export function MissionDetail({ missionId }: { missionId: string }) {
  const snapshot = useSnapshot();
  const now = useNow(5000);
  const { m, rel } = useI18n();
  const t = m.mission;
  const mission = findMission(snapshot, missionId);
  useFocusTarget(mission !== undefined);
  const roomOf = useWorkerRoom();

  if (!mission) {
    return (
      <div className="page">
        <a className="back-link" href={href.missions()}>
          <Icon name="back" size={14} /> {t.back}
        </a>
        <EmptyState title={t.notFound(missionId)} />
      </div>
    );
  }

  const meta = MISSION_STATUS_META[mission.status];
  const workers = mission.assignedWorkerIds
    .map((id) => snapshot.workers.find((w) => w.id === id))
    .filter((w) => w !== undefined);
  const approvals = snapshot.approvals.filter((a) => mission.approvalIds.includes(a.id));
  // Only alerts that explicitly list this mission as affected.
  const alerts = snapshot.alerts.filter((al) =>
    al.affected.some((x) => x.kind === 'mission' && x.id === mission.id),
  );
  const deps = mission.dependsOn.map((id) => ({ id, mission: findMission(snapshot, id) }));

  return (
    <div className="page">
      <a className="back-link" href={href.missions()}>
        <Icon name="back" size={14} /> {t.back}
      </a>
      <header className="page__header">
        <div>
          <div className="page__eyebrow mono">{mission.id}</div>
          <h1 className="page__title">{mission.title}</h1>
          <p className="page__lede">{mission.objective}</p>
        </div>
      </header>

      <MissionResultPanel mission={mission} />

      <div className="grid grid--mission">
        <Panel title={t.instrumentation} className="span-2" tone={meta.tone}>
          <MissionInstrument mission={mission} size="xl" />
          <ProgressBar value={mission.progress} tone={meta.tone} label={t.progress} />
        </Panel>

        <Panel title={t.record}>
          <KeyValue
            items={[
              [
                t.status,
                <StatusBadge tone={meta.tone}>{m.status.mission[mission.status]}</StatusBadge>,
              ],
              [t.priority, m.status.priority[mission.priority]],
              [t.created, rel(mission.createdAt, now)],
              [t.started, mission.startedAt ? rel(mission.startedAt, now) : t.notStarted],
              [t.completed, mission.completedAt ? rel(mission.completedAt, now) : '—'],
              [
                t.review,
                <StatusBadge tone={REVIEW_STATUS_META[mission.review.status].tone} size="sm">
                  {m.status.review[mission.review.status]}
                </StatusBadge>,
              ],
              [
                t.certification,
                <StatusBadge tone={CERT_TONE[mission.certification]} size="sm">
                  {m.status.certification[mission.certification]}
                </StatusBadge>,
              ],
            ]}
          />
        </Panel>

        <Panel title={t.crew}>
          {workers.length === 0 ? (
            <EmptyState title={t.unassigned} />
          ) : (
            <ul className="crew-list">
              {workers.map((w) => (
                <li key={w.id}>
                  <a href={href.worker(w.id)} className="crew-list__item">
                    <CharacterAvatar characterId={w.characterId} state={w.state} size={36} />
                    <span>
                      <strong>{w.name}</strong>
                      <span className="muted small">
                        {w.role}
                        {roomOf(w.id) && t.atRoom(roomOf(w.id)!.label)}
                      </span>
                    </span>
                    <StatusBadge tone={WORKER_STATE_META[w.state].tone} size="sm">
                      {m.status.worker[w.state]}
                    </StatusBadge>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {workers.length > 0 && (
            <p className="small">
              <a className="target" href={withQuery(href.floor(), { mission: mission.id })}>
                {t.showCrew}
              </a>
            </p>
          )}
        </Panel>

        <Panel title={t.tasks} className="span-2">
          {mission.tasks.length === 0 ? (
            <EmptyState title={t.noTasks} />
          ) : (
            <ol className="task-list">
              {mission.tasks.map((task) => (
                <li key={task.id} className="task" data-status={task.status}>
                  <span className="mono muted small">{task.id}</span>
                  <span className="task__title">{task.title}</span>
                  <StatusBadge tone={TASK_TONE[task.status]} size="sm">
                    {m.status.task[task.status]}
                  </StatusBadge>
                  <ProgressBar
                    value={task.progress}
                    tone={TASK_TONE[task.status]}
                    label={m.common.progressLabel(task.title)}
                  />
                  {task.dependsOn.length > 0 && (
                    <span className="small muted">{t.dependsOn(task.dependsOn.join(', '))}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={t.dependencies}>
          {deps.length === 0 ? (
            <EmptyState title={t.noDependencies} />
          ) : (
            <ul className="plain-list">
              {deps.map((d) => (
                <li key={d.id}>
                  <a className="mono" href={href.mission(d.id)}>
                    {d.id}
                  </a>{' '}
                  {d.mission ? (
                    <StatusBadge tone={MISSION_STATUS_META[d.mission.status].tone} size="sm">
                      {m.status.mission[d.mission.status]}
                    </StatusBadge>
                  ) : (
                    <span className="muted">{m.common.unknown}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t.artifacts(mission.artifacts.length)} className="span-2">
          {mission.artifacts.length === 0 ? (
            <EmptyState title={t.noArtifacts} />
          ) : (
            <ul className="artifact-list">
              {mission.artifacts.map((a) => (
                <li key={a.id} className="artifact" data-focus-id={a.id}>
                  <Icon name={a.uri ? 'link' : 'artifact'} size={16} />
                  <div>
                    <div className="artifact__title">
                      {a.uri ? (
                        <a href={a.uri} target="_blank" rel="noreferrer noopener">
                          {a.title}
                        </a>
                      ) : (
                        a.title
                      )}
                    </div>
                    {a.summary && <div className="small muted">{a.summary}</div>}
                    {a.producedBy && (
                      <div className="small muted">
                        {m.common.by('')}
                        <a href={href.worker(a.producedBy)}>
                          {snapshot.workers.find((w) => w.id === a.producedBy)?.name ??
                            a.producedBy}
                        </a>
                      </div>
                    )}
                  </div>
                  <span className="chip">{m.status.artifact[a.kind]}</span>
                  <span className="small muted">{rel(a.createdAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t.review}>
          <KeyValue
            items={[
              [t.status, m.status.review[mission.review.status]],
              [
                t.reviewer,
                snapshot.workers.find((w) => w.id === mission.review.reviewerId)?.name ??
                  mission.review.reviewerId ??
                  '—',
              ],
              [t.summary, mission.review.summary ?? '—'],
            ]}
          />
          {mission.review.findings && mission.review.findings.length > 0 && (
            <ul className="plain-list">
              {mission.review.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </Panel>

        {approvals.length > 0 && (
          <Panel title={t.gates} className="span-3">
            <div className="gate-list">
              {approvals.map((a) => (
                <ApprovalGateCard key={a.id} request={a} />
              ))}
            </div>
          </Panel>
        )}

        {alerts.length > 0 && (
          <Panel title={t.alerts(alerts.length)} className="span-3">
            <div className="stack">
              {alerts.map((al) => (
                <AlertCard key={al.id} alert={al} compact={!!al.resolvedAt} />
              ))}
            </div>
          </Panel>
        )}

        <Panel title={t.timeline} className="span-3">
          <ActivityStream
            filter={{ missionId: mission.id, includeLowSignal: true }}
            showLinks={false}
          />
        </Panel>
      </div>
    </div>
  );
}
