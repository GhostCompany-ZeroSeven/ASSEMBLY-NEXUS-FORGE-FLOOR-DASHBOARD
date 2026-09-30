import { useEffect } from 'react';
import { href } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import {
  EmptyState,
  KeyValue,
  Panel,
  ProgressBar,
  SegmentClock,
  StatusBadge,
} from '@/components/ui';
import { eventsForWorker, findMission, findWorker } from '@/domain/selectors';
import { WORKER_STATE_META } from '@/domain/status';
import { formatRelative, toMs } from '@/domain/time';
import { ActivityStream } from '@/features/activity/ActivityStream';
import { ApprovalGateCard } from '@/features/approvals/ApprovalGateCard';
import { MissionInstrument } from '@/features/missions/MissionInstrument';
import { useConfig, useNow, useSnapshot } from '@/store/hooks';
import { ConversationPanel } from './ConversationPanel';
import { WorkerCard } from './WorkerCard';

/**
 * Full-screen worker inspection/interaction view. Escape returns to the
 * worker roster.
 */
export function WorkerFocus({ workerId }: { workerId: string }) {
  const snapshot = useSnapshot();
  const { crews, floor } = useConfig();
  const now = useNow(1000);
  const worker = findWorker(snapshot, workerId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
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
          <Icon name="back" size={14} /> Workers
        </a>
        <EmptyState title={`Worker ${workerId} not found`} />
      </div>
    );
  }

  const meta = WORKER_STATE_META[worker.state];
  const mission = findMission(snapshot, worker.currentMissionId);
  const crew = crews.find((c) => c.id === worker.crewId);
  const events = eventsForWorker(snapshot, worker.id);
  const artifacts = snapshot.missions
    .flatMap((m) => m.artifacts)
    .filter((a) => a.producedBy === worker.id);
  const approvals = snapshot.approvals.filter((a) => a.requestedBy === worker.id);
  const since = toMs(worker.stateSince);
  const home = floor.rooms.find((r) => r.id === worker.homeRoomId);

  return (
    <div className="focus" data-tone={meta.tone}>
      <div className="focus__bar">
        <a className="back-link" href={href.workers()}>
          <Icon name="back" size={14} /> Workers <span className="muted small">(Esc)</span>
        </a>
        <a className="back-link" href={href.floor()}>
          <Icon name="floor" size={14} /> Forge Floor
        </a>
      </div>

      <header className="focus__hero">
        <div className="focus__portrait" data-state={worker.state}>
          <CharacterAvatar
            characterId={worker.characterId}
            state={worker.state}
            size={140}
            label={`${worker.name} portrait`}
          />
        </div>
        <div className="focus__identity">
          <div className="page__eyebrow">{crew?.label ?? worker.crewId}</div>
          <h1 className="focus__name">{worker.name}</h1>
          <div className="focus__role">
            {worker.role}
            {home && <span className="muted"> · Station: {home.label}</span>}
          </div>
          <div className="focus__state">
            <StatusBadge tone={meta.tone} size="lg" pulse={worker.state === 'WORKING'}>
              {meta.label}
            </StatusBadge>
            <span className="muted">{meta.description}</span>
          </div>
          {worker.currentActivity && <p className="focus__activity">“{worker.currentActivity}”</p>}
        </div>
        <div className="focus__telemetry">
          <SegmentClock
            label="In state"
            ms={since === null ? null : now - since}
            tone={meta.tone}
            size="lg"
          />
          <KeyValue
            items={[
              ['Events', events.length],
              ['Artifacts', artifacts.length],
              [
                'Last event',
                events.length ? formatRelative(events[events.length - 1]!.at, now) : '—',
              ],
              ['Worker id', <span className="mono">{worker.id}</span>],
            ]}
          />
        </div>
      </header>

      <div className="grid grid--focus">
        <Panel title="Current job" className="span-2">
          {mission ? (
            <>
              <a href={href.mission(mission.id)} className="focus__mission-link">
                <span className="mono">{mission.id}</span> {mission.title}
              </a>
              <p className="muted">{mission.objective}</p>
              <MissionInstrument mission={mission} size="md" />
              <ProgressBar value={worker.progress} tone={meta.tone} label="Worker progress" />
              <h3 className="subhead">Tasks</h3>
              <ul className="plain-list">
                {mission.tasks.map((t) => (
                  <li key={t.id} data-current={t.id === worker.currentTaskId || undefined}>
                    <span className="mono small muted">{t.id}</span> {t.title} ·{' '}
                    <span className="small">{t.status.replace('_', ' ')}</span>
                    {t.assigneeId === worker.id && <span className="chip">assigned</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState title="No current mission">This worker is available.</EmptyState>
          )}
        </Panel>

        <Panel title="Status card">
          <WorkerCard worker={worker} />
        </Panel>

        <Panel title="Conversation" className="span-2">
          <ConversationPanel worker={worker} />
        </Panel>

        <Panel title="Dependencies & blockers">
          {worker.blockers.length === 0 && (!mission || mission.dependsOn.length === 0) ? (
            <EmptyState title="Nothing blocking" />
          ) : (
            <ul className="plain-list">
              {worker.blockers.map((b) => (
                <li key={b.id} className="text-danger">
                  <Icon name="alert" size={13} /> {b.description}{' '}
                  <span className="muted small">since {formatRelative(b.since, now)}</span>
                </li>
              ))}
              {mission?.dependsOn.map((d) => (
                <li key={d}>
                  Mission depends on{' '}
                  <a href={href.mission(d)} className="mono">
                    {d}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Timeline" className="span-2">
          <ActivityStream filter={{ workerId: worker.id, includeLowSignal: true }} limit={80} />
        </Panel>

        <Panel title={`Artifacts (${artifacts.length})`}>
          {artifacts.length === 0 ? (
            <EmptyState title="No artifacts" />
          ) : (
            <ul className="plain-list">
              {artifacts.map((a) => (
                <li key={a.id}>
                  <Icon name="artifact" size={13} /> {a.title}{' '}
                  <span className="chip">{a.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {approvals.length > 0 && (
          <Panel title="Approvals requested" className="span-3">
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
