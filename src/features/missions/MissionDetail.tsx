import { href, withQuery } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import { EmptyState, KeyValue, MoreLink, Panel, ProgressBar, StatusBadge } from '@/components/ui';
import { useMemo } from 'react';
import { FreshnessLine } from '@/components/FreshnessLine';
import { selectAttentionQueue } from '@/domain/attention';
import { selectFreshness } from '@/domain/freshness';
import { computeMissionDigest } from '@/domain/missionView';
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
import { useConfig, useDashboard, useNow, useSnapshot } from '@/store/hooks';
import { AttentionList } from '@/features/brief/AttentionList';
import { useMissionBaseline } from '@/hooks/useMissionBaseline';
import { MissionChangesPanel } from './MissionChangesPanel';
import { MissionEvidencePanel } from './MissionEvidencePanel';
import { MissionInstrument } from './MissionInstrument';
import { MissionLifecyclePanel } from './MissionLifecyclePanel';
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

/** Keyed by mission id so each mission gets its own "last viewed" baseline. */
export function MissionDetail({ missionId }: { missionId: string }) {
  return <MissionCommand key={missionId} missionId={missionId} />;
}

/**
 * Founder-oriented mission surface. Information hierarchy: identity and source,
 * current state, Founder attention, changes since this mission was last viewed,
 * gates (the only place a decision can be made, behind checkDecision), recent
 * timeline, participants and evidence, then supporting detail.
 */
function MissionCommand({ missionId }: { missionId: string }) {
  const snapshot = useSnapshot();
  const { status } = useDashboard();
  const { governance } = useConfig();
  const now = useNow(5000);
  const { m, rel } = useI18n();
  const t = m.mission;
  const mission = findMission(snapshot, missionId);
  useFocusTarget(true);
  const roomOf = useWorkerRoom();
  const view = useMissionBaseline(missionId);
  const freshness = selectFreshness(snapshot, status, now);
  const freshKey = [freshness.source, ...freshness.qualifiers].join('+');
  const digest = useMemo(
    () => computeMissionDigest(snapshot, missionId, view.baseline, freshness),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, missionId, view.baseline, freshKey],
  );
  const queue = selectAttentionQueue(snapshot, governance.humanAuthority, freshness);
  const related = queue.items.filter((i) =>
    i.related.some((r) => r.kind === 'mission' && r.id === missionId),
  );
  const attentionItems =
    related.length > 0 || !queue.complete
      ? [...queue.items.filter((i) => i.source === 'data'), ...related]
      : related;

  const changesPanel = (
    <MissionChangesPanel
      missionId={missionId}
      digest={digest}
      storage={view.storage}
      rejected={view.rejected}
      onMarkSeen={view.markSeen}
      onForget={view.forget}
      now={now}
    />
  );

  if (!mission) {
    return (
      <div className="page">
        <a className="back-link" href={href.missions()}>
          <Icon name="back" size={14} /> {t.back}
        </a>
        <EmptyState title={t.notFound(missionId)} />
        {changesPanel}
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
        <div className="mission-head__state">
          <StatusBadge tone={meta.tone}>{m.status.mission[mission.status]}</StatusBadge>
          <FreshnessLine freshness={freshness} />
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

        <MissionLifecyclePanel mission={mission} />

        <Panel
          id="mission-attention"
          focusId="attention"
          title={m.missionView.attentionTitle}
          tone={related.length ? 'warning' : undefined}
        >
          {!queue.complete && (
            <p className="brief__warning" role="note">
              {m.brief.attention.incomplete(
                (['approvals', 'alerts'] as const)
                  .filter((r) => queue.items.some((i) => i.source === 'data' && i.id === r))
                  .map((r) => m.brief.resource[r])
                  .join(m.brief.and),
              )}
            </p>
          )}
          {attentionItems.length === 0 ? (
            <EmptyState title={m.missionView.attentionEmpty} />
          ) : (
            <AttentionList items={attentionItems} freshness={freshness} now={now} />
          )}
        </Panel>

        <div className="span-2 mission-changes-slot">{changesPanel}</div>

        {approvals.length > 0 && (
          <Panel title={t.gates} className="span-3">
            <div className="gate-list">
              {approvals.map((a) => (
                <ApprovalGateCard key={a.id} request={a} />
              ))}
            </div>
          </Panel>
        )}

        <Panel
          title={t.timeline}
          className="span-3"
          actions={
            <MoreLink href={withQuery(href.activity(), { mission: mission.id })}>
              {m.activity.openTimeline}
            </MoreLink>
          }
        >
          <ActivityStream
            filter={{ missionId: mission.id, includeLowSignal: true }}
            showLinks={false}
            newIds={digest.baseline === 'ok' ? digest.events.newIds : undefined}
            boundary
          />
        </Panel>

        {alerts.length > 0 && (
          <Panel title={t.alerts(alerts.length)} className="span-3">
            <div className="stack">
              {alerts.map((al) => (
                <AlertCard key={al.id} alert={al} compact={!!al.resolvedAt} />
              ))}
            </div>
          </Panel>
        )}

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

        <MissionEvidencePanel
          mission={mission}
          newIds={new Set(digest.changes.filter((c) => c.kind === 'artifactNew').map((c) => c.id!))}
          now={now}
        />

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
      </div>
    </div>
  );
}
