import { useEffect } from 'react';
import { href, withQuery } from '@/app/router';
import { AlertCard } from '@/features/alerts/AlertCard';
import { useWorkerRoom } from '@/hooks/useWorkerRoom';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import {
  EmptyState,
  KeyValue,
  MoreLink,
  Panel,
  ProgressBar,
  SegmentClock,
  StatusBadge,
} from '@/components/ui';
import { eventsForWorker, findMission, findWorker } from '@/domain/selectors';
import { WORKER_STATE_META } from '@/domain/status';
import { toMs } from '@/domain/time';
import { useI18n } from '@/i18n/useI18n';
import { isTypingTarget } from '@/features/command/commands';
import { ActivityStream } from '@/features/activity/ActivityStream';
import { ApprovalGateCard } from '@/features/approvals/ApprovalGateCard';
import { MissionInstrument } from '@/features/missions/MissionInstrument';
import { useConfig, useNow, useSnapshot } from '@/store/hooks';
import { ConversationPanel } from './ConversationPanel';
import { WorkerCard } from './WorkerCard';
import { useMissionLabel } from '@/hooks/useMissionLabel';

/**
 * Full-screen worker inspection/interaction view. Escape returns to the
 * worker roster.
 */
export function WorkerFocus({ workerId }: { workerId: string }) {
  const snapshot = useSnapshot();
  const missionRef = useMissionLabel();
  const { crews, floor } = useConfig();
  const now = useNow(1000);
  const { m, rel } = useI18n();
  const t = m.focus;
  const worker = findWorker(snapshot, workerId);
  const roomOf = useWorkerRoom();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Dialogs handle their own Escape first; never leave the view underneath them.
      if (
        e.key !== 'Escape' ||
        e.defaultPrevented ||
        document.querySelector('[aria-modal="true"]')
      ) {
        return;
      }
      if (!isTypingTarget(e.target)) {
        window.location.hash = href.workers();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!worker) {
    return (
      <div className="page">
        <a className="back-link" href={href.workers()}>
          <Icon name="back" size={14} /> {t.back}
        </a>
        <EmptyState title={t.notFound(workerId)} />
      </div>
    );
  }

  const meta = WORKER_STATE_META[worker.state];
  const mission = findMission(snapshot, worker.currentMissionId);
  const crew = crews.find((c) => c.id === worker.crewId);
  const events = eventsForWorker(snapshot, worker.id);
  // Latest by EVENT time (the log is in arrival order; a late event is not "last").
  const lastEventAt = events.reduce<string | undefined>(
    (max, e) => (max === undefined || e.at > max ? e.at : max),
    undefined,
  );
  const artifacts = snapshot.missions
    .flatMap((m) => m.artifacts)
    .filter((a) => a.producedBy === worker.id);
  const approvals = snapshot.approvals.filter((a) => a.requestedBy === worker.id);
  // Only alerts that explicitly list this worker as affected.
  const alerts = snapshot.alerts.filter((al) =>
    al.affected.some((x) => x.kind === 'worker' && x.id === worker.id),
  );
  const since = toMs(worker.stateSince);
  const home = floor.rooms.find((r) => r.id === worker.homeRoomId);
  const current = roomOf(worker.id);

  return (
    <div className="focus" data-tone={meta.tone}>
      <div className="focus__bar">
        <a className="back-link" href={href.workers()}>
          <Icon name="back" size={14} /> {t.back} <span className="muted small">(Esc)</span>
        </a>
        <a className="back-link" href={href.floor()}>
          <Icon name="floor" size={14} /> {m.nav.floor}
        </a>
      </div>

      <header className="focus__hero">
        <div className="focus__portrait" data-state={worker.state}>
          <CharacterAvatar
            characterId={worker.characterId}
            state={worker.state}
            size={140}
            label={t.portrait(worker.name)}
          />
        </div>
        <div className="focus__identity">
          <div className="page__eyebrow">{crew?.label ?? worker.crewId}</div>
          <h1 className="focus__name">{worker.name}</h1>
          <div className="focus__role">
            {worker.role}
            {home && <span className="muted"> · {t.station(home.label)}</span>}
            {current && (
              <>
                {' · '}
                <a href={withQuery(href.floor(), { worker: worker.id })}>
                  {t.nowAt(current.label)}
                </a>
              </>
            )}
          </div>
          <div className="focus__state">
            <StatusBadge tone={meta.tone} size="lg" pulse={worker.state === 'WORKING'}>
              {m.status.worker[worker.state]}
            </StatusBadge>
            <span className="muted">{m.status.workerDescription[worker.state]}</span>
          </div>
          {worker.currentActivity && <p className="focus__activity">“{worker.currentActivity}”</p>}
        </div>
        <div className="focus__telemetry">
          <SegmentClock
            label={t.inState}
            ms={since === null ? null : now - since}
            tone={meta.tone}
            size="lg"
          />
          <KeyValue
            items={[
              [t.events, events.length],
              [t.artifacts, artifacts.length],
              [t.lastEvent, lastEventAt ? rel(lastEventAt, now) : '—'],
              [t.workerId, <span className="mono">{worker.id}</span>],
              // The data model carries no runtime/model identity: never invented.
              [m.ops.worker.runtime, <span className="muted">{m.ops.worker.notReported}</span>],
            ]}
          />
        </div>
      </header>

      <div className="grid grid--focus">
        <Panel family="ops" title={t.currentJob} className="span-2">
          {mission ? (
            <>
              <a href={href.mission(mission.id)} className="focus__mission-link">
                <span className="mono">{missionRef(mission)}</span> {mission.title}
              </a>
              <p className="muted">{mission.objective}</p>
              <MissionInstrument mission={mission} size="md" />
              <ProgressBar value={worker.progress} tone={meta.tone} label={t.progress} />
              <h3 className="subhead">{t.tasks}</h3>
              <ul className="plain-list">
                {mission.tasks.map((task) => (
                  <li key={task.id} data-current={task.id === worker.currentTaskId || undefined}>
                    <span className="mono small muted">{task.id}</span> {task.title} ·{' '}
                    <span className="small">{m.status.task[task.status]}</span>
                    {task.assigneeId === worker.id && <span className="chip">{t.assigned}</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState title={t.noMission}>{t.available}</EmptyState>
          )}
        </Panel>

        <Panel family="floor" title={t.statusCard}>
          <WorkerCard worker={worker} />
        </Panel>

        <Panel family="signal" title={t.conversation} className="span-2">
          <ConversationPanel worker={worker} />
        </Panel>

        <Panel family="signal" title={t.blockers}>
          {worker.blockers.length === 0 && (!mission || mission.dependsOn.length === 0) ? (
            <EmptyState title={t.nothingBlocking} />
          ) : (
            <ul className="plain-list">
              {worker.blockers.map((b) => (
                <li key={b.id} className="text-danger">
                  <Icon name="alert" size={13} /> {b.description}{' '}
                  <span className="muted small">{t.since(rel(b.since, now))}</span>
                </li>
              ))}
              {mission?.dependsOn.map((d) => (
                <li key={d}>
                  {t.missionDependsOn}{' '}
                  <a href={href.mission(d)} className="mono">
                    {d}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          family="signal"
          title={t.timeline}
          className="span-2"
          actions={
            <MoreLink href={withQuery(href.activity(), { worker: worker.id })}>
              {m.activity.openTimeline}
            </MoreLink>
          }
        >
          <ActivityStream filter={{ workerId: worker.id, includeLowSignal: true }} limit={80} />
        </Panel>

        <Panel family="ops" title={t.artifactsTitle(artifacts.length)}>
          {artifacts.length === 0 ? (
            <EmptyState title={t.noArtifacts} />
          ) : (
            <ul className="plain-list">
              {artifacts.map((a) => (
                <li key={a.id}>
                  <Icon name="artifact" size={13} />{' '}
                  <a href={withQuery(href.mission(a.missionId), { focus: a.id })}>{a.title}</a>{' '}
                  <span className="chip">{m.status.artifact[a.kind]}</span>{' '}
                  <span className="small muted mono">{missionRef(a.missionId)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {alerts.length > 0 && (
          <Panel
            family="signal"
            title={t.alerts(worker.name.split(' ')[0]!, alerts.length)}
            className="span-3"
          >
            <div className="stack">
              {alerts.map((al) => (
                <AlertCard key={al.id} alert={al} compact={!!al.resolvedAt} />
              ))}
            </div>
          </Panel>
        )}

        {approvals.length > 0 && (
          <Panel family="founder" title={t.approvals} className="span-3">
            <div className="gate-list">
              {approvals.map((a) => (
                <ApprovalGateCard key={a.id} request={a} />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
