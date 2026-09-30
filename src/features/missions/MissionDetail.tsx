import { href } from '@/app/router';
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
import { formatRelative } from '@/domain/time';
import type { TaskStatus } from '@/domain/types';
import { ActivityStream } from '@/features/activity/ActivityStream';
import { ApprovalGateCard } from '@/features/approvals/ApprovalGateCard';
import { useNow, useSnapshot } from '@/store/hooks';
import { MissionInstrument } from './MissionInstrument';
import { MissionResultPanel } from './MissionResultPanel';

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
  const mission = findMission(snapshot, missionId);

  if (!mission) {
    return (
      <div className="page">
        <a className="back-link" href={href.missions()}>
          <Icon name="back" size={14} /> Missions
        </a>
        <EmptyState title={`Mission ${missionId} not found`} />
      </div>
    );
  }

  const meta = MISSION_STATUS_META[mission.status];
  const workers = mission.assignedWorkerIds
    .map((id) => snapshot.workers.find((w) => w.id === id))
    .filter((w) => w !== undefined);
  const approvals = snapshot.approvals.filter((a) => mission.approvalIds.includes(a.id));
  const deps = mission.dependsOn.map((id) => ({ id, mission: findMission(snapshot, id) }));

  return (
    <div className="page">
      <a className="back-link" href={href.missions()}>
        <Icon name="back" size={14} /> Missions
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
        <Panel title="Instrumentation" className="span-2" tone={meta.tone}>
          <MissionInstrument mission={mission} size="xl" />
          <ProgressBar value={mission.progress} tone={meta.tone} label="Mission progress" />
        </Panel>

        <Panel title="Mission record">
          <KeyValue
            items={[
              ['Status', <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>],
              ['Priority', mission.priority],
              ['Created', formatRelative(mission.createdAt, now)],
              [
                'Started',
                mission.startedAt ? formatRelative(mission.startedAt, now) : 'not started',
              ],
              ['Completed', mission.completedAt ? formatRelative(mission.completedAt, now) : '—'],
              [
                'Review',
                <StatusBadge tone={REVIEW_STATUS_META[mission.review.status].tone} size="sm">
                  {REVIEW_STATUS_META[mission.review.status].label}
                </StatusBadge>,
              ],
              [
                'Certification',
                <StatusBadge tone={CERT_TONE[mission.certification]} size="sm">
                  {mission.certification.replace('_', ' ')}
                </StatusBadge>,
              ],
            ]}
          />
        </Panel>

        <Panel title="Assigned crew">
          {workers.length === 0 ? (
            <EmptyState title="Unassigned" />
          ) : (
            <ul className="crew-list">
              {workers.map((w) => (
                <li key={w.id}>
                  <a href={href.worker(w.id)} className="crew-list__item">
                    <CharacterAvatar characterId={w.characterId} state={w.state} size={36} />
                    <span>
                      <strong>{w.name}</strong>
                      <span className="muted small">{w.role}</span>
                    </span>
                    <StatusBadge tone={WORKER_STATE_META[w.state].tone} size="sm">
                      {WORKER_STATE_META[w.state].label}
                    </StatusBadge>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Tasks" className="span-2">
          {mission.tasks.length === 0 ? (
            <EmptyState title="No tasks reported" />
          ) : (
            <ol className="task-list">
              {mission.tasks.map((t) => (
                <li key={t.id} className="task" data-status={t.status}>
                  <span className="mono muted small">{t.id}</span>
                  <span className="task__title">{t.title}</span>
                  <StatusBadge tone={TASK_TONE[t.status]} size="sm">
                    {t.status.replace('_', ' ')}
                  </StatusBadge>
                  <ProgressBar
                    value={t.progress}
                    tone={TASK_TONE[t.status]}
                    label={`${t.title} progress`}
                  />
                  {t.dependsOn.length > 0 && (
                    <span className="small muted">depends on {t.dependsOn.join(', ')}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Dependencies">
          {deps.length === 0 ? (
            <EmptyState title="No dependencies" />
          ) : (
            <ul className="plain-list">
              {deps.map((d) => (
                <li key={d.id}>
                  <a className="mono" href={href.mission(d.id)}>
                    {d.id}
                  </a>{' '}
                  {d.mission ? (
                    <StatusBadge tone={MISSION_STATUS_META[d.mission.status].tone} size="sm">
                      {MISSION_STATUS_META[d.mission.status].label}
                    </StatusBadge>
                  ) : (
                    <span className="muted">unknown</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Artifacts (${mission.artifacts.length})`} className="span-2">
          {mission.artifacts.length === 0 ? (
            <EmptyState title="No artifacts yet" />
          ) : (
            <ul className="artifact-list">
              {mission.artifacts.map((a) => (
                <li key={a.id} className="artifact">
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
                  </div>
                  <span className="chip">{a.kind}</span>
                  <span className="small muted">{formatRelative(a.createdAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Review">
          <KeyValue
            items={[
              ['Status', REVIEW_STATUS_META[mission.review.status].label],
              [
                'Reviewer',
                snapshot.workers.find((w) => w.id === mission.review.reviewerId)?.name ??
                  mission.review.reviewerId ??
                  '—',
              ],
              ['Summary', mission.review.summary ?? '—'],
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
          <Panel title="Approval gates" className="span-3">
            <div className="gate-list">
              {approvals.map((a) => (
                <ApprovalGateCard key={a.id} request={a} />
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Mission timeline" className="span-3">
          <ActivityStream
            filter={{ missionId: mission.id, includeLowSignal: true }}
            showLinks={false}
          />
        </Panel>
      </div>
    </div>
  );
}
