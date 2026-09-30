import { useMemo } from 'react';
import { href, replaceHashQuery, useHashQuery, withQuery } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { Icon } from '@/components/Icon';
import { EmptyState, Panel, StatusBadge } from '@/components/ui';
import { findWorker, pendingApprovals } from '@/domain/selectors';
import { WORKER_STATE_META } from '@/domain/status';
import { WORKER_STATES, type Worker } from '@/domain/types';
import { SelectFilter } from '@/features/filters/FilterBar';
import {
  isWaitingForFounder,
  workerMatchesFlag,
  type WorkerFlag,
} from '@/features/filters/filters';
import { WorkerCard } from '@/features/workers/WorkerCard';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { useConfig, useSnapshot } from '@/store/hooks';
import { ForgeFloorMap } from './ForgeFloorMap';
import { layoutFloor } from './layout';
import { STATE_GLYPH } from './stateGlyph';

const FLAGS: { value: WorkerFlag; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'founder', label: 'Waiting for Founder' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'active', label: 'Active' },
  { value: 'idle', label: 'Idle / done' },
  { value: 'failed', label: 'Failed / stopped' },
];

/**
 * Floor state lives in the URL (?worker=, ?room=, ?show=, ?mission=) so search
 * results and cross-links can open the floor focused on something specific.
 */
export function ForgeFloorPage() {
  const snapshot = useSnapshot();
  const { crews, floor } = useConfig();
  const query = useHashQuery();
  const selected = query.worker ?? null;
  const roomId = query.room ?? null;
  const flag = (FLAGS.some((f) => f.value === query.show) ? query.show : 'all') as WorkerFlag;
  const missionId = query.mission ?? 'all';
  const worker = findWorker(snapshot, selected ?? undefined);
  const room = floor.rooms.find((r) => r.id === roomId);
  const forge = crews.find((c) => c.id === 'forge');
  useFocusTarget();

  const setQuery = (patch: Record<string, string | undefined>) =>
    replaceHashQuery({
      worker: selected ?? undefined,
      room: roomId ?? undefined,
      show: flag === 'all' ? undefined : flag,
      mission: missionId === 'all' ? undefined : missionId,
      ...patch,
    });

  const filtering = flag !== 'all' || missionId !== 'all';
  const highlight = filtering
    ? (w: Worker) =>
        workerMatchesFlag(w, flag, snapshot) &&
        (missionId === 'all' || w.currentMissionId === missionId)
    : undefined;
  const matches = highlight ? snapshot.workers.filter(highlight).length : snapshot.workers.length;
  const missionsOnFloor = [
    ...new Set(snapshot.workers.map((w) => w.currentMissionId).filter(Boolean)),
  ] as string[];

  return (
    <div className="page page--wide">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Visual operations</div>
          <h1 className="page__title">Forge Floor</h1>
          {forge?.motto && <p className="page__lede crew-motto">{forge.motto}</p>}
        </div>
        <details className="legend-box">
          <summary>State legend</summary>
          <ul className="legend" aria-label="Worker state legend">
            {WORKER_STATES.map((s) => (
              <li key={s}>
                <span className="legend__glyph" aria-hidden="true">
                  <Icon name={STATE_GLYPH[s]} size={12} />
                </span>
                <StatusBadge tone={WORKER_STATE_META[s].tone} size="sm">
                  {WORKER_STATE_META[s].label}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </details>
      </header>

      <div
        className="filterbar floor-filter"
        role="search"
        aria-label="Highlight workers on the floor"
      >
        <div className="filterbar__row">
          <div className="segmented" role="radiogroup" aria-label="Highlight">
            {FLAGS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={flag === f.value}
                className="segmented__item"
                onClick={() => setQuery({ show: f.value === 'all' ? undefined : f.value })}
              >
                {f.label}
                <span className="segmented__count">
                  {snapshot.workers.filter((w) => workerMatchesFlag(w, f.value, snapshot)).length}
                </span>
              </button>
            ))}
          </div>
          <SelectFilter
            label="Mission"
            value={missionId}
            onChange={(m) => setQuery({ mission: m === 'all' ? undefined : m })}
            options={[
              { value: 'all', label: 'Any mission' },
              ...missionsOnFloor.map((m) => ({ value: m, label: m })),
            ]}
          />
          <span className="filterbar__count" role="status" aria-live="polite">
            {filtering
              ? `${matches} of ${snapshot.workers.length} workers highlighted`
              : `${snapshot.workers.length} workers`}
          </span>
          {filtering && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setQuery({ show: undefined, mission: undefined })}
            >
              <Icon name="reset" size={13} /> Reset highlight
            </button>
          )}
        </div>
        {filtering && matches === 0 && snapshot.workers.length > 0 && (
          <p className="small muted" role="note">
            No workers match this highlight. Everyone is shown dimmed. Reset to clear it.
          </p>
        )}
      </div>

      <div className="floor-layout">
        <Panel className="floor-panel">
          <ForgeFloorMap
            selectedId={selected}
            onSelect={(id) =>
              setQuery({ worker: selected === id ? undefined : id, room: undefined })
            }
            highlight={highlight}
            selectedRoomId={roomId}
            onSelectRoom={(id) =>
              setQuery({ room: roomId === id ? undefined : id, worker: undefined })
            }
          />
        </Panel>
        <aside
          className="floor-aside"
          aria-label={room ? `Room: ${room.label}` : 'Selected worker'}
        >
          {room ? (
            <RoomPanel roomId={room.id} onClose={() => setQuery({ room: undefined })} />
          ) : worker ? (
            <>
              <WorkerCard worker={worker} />
              {worker.currentMissionId && (
                <p className="small floor-aside__hint">
                  Workers ringed on the floor share mission{' '}
                  <a href={href.mission(worker.currentMissionId)}>{worker.currentMissionId}</a>.
                </p>
              )}
            </>
          ) : (
            <Panel title="Select a worker or room">
              <p className="muted">
                Select any crew member, or a room name, to inspect it. Workers walk between rooms as
                their state changes; those waiting on a human decision gather at the Founder Gate.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function RoomPanel({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const snapshot = useSnapshot();
  const { floor, crews } = useConfig();
  const room = floor.rooms.find((r) => r.id === roomId)!;
  const placements = useMemo(() => layoutFloor(snapshot.workers, floor), [snapshot.workers, floor]);
  const people = snapshot.workers.filter((w) => placements.get(w.id)?.roomId === roomId);
  const crew = crews.find((c) => c.id === room.crewId);
  const gates = room.id === floor.approvalRoomId ? pendingApprovals(snapshot) : [];

  return (
    <Panel
      eyebrow={crew ? `${crew.label}${crew.status === 'reserved' ? ' · reserved' : ''}` : 'Room'}
      title={room.label}
      actions={
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close room details"
        >
          <Icon name="x" size={14} />
        </button>
      }
    >
      <p className="muted small">{room.description}</p>
      <h3 className="subhead">Present ({people.length})</h3>
      {people.length === 0 ? (
        <EmptyState title="Nobody here right now" />
      ) : (
        <ul className="crew-list">
          {people.map((w) => (
            <li key={w.id}>
              <a href={href.worker(w.id)} className="crew-list__item">
                <CharacterAvatar
                  characterId={w.characterId}
                  state={w.state}
                  size={32}
                  roomId={room.id}
                />
                <span>
                  <strong>{w.name}</strong>
                  <span className="muted small">
                    {w.currentMissionId ?? 'no mission'}
                    {isWaitingForFounder(w, snapshot) ? ' · awaiting Founder' : ''}
                  </span>
                </span>
                <StatusBadge tone={WORKER_STATE_META[w.state].tone} size="sm">
                  {WORKER_STATE_META[w.state].label}
                </StatusBadge>
              </a>
            </li>
          ))}
        </ul>
      )}
      {gates.length > 0 && (
        <>
          <h3 className="subhead">Waiting for a decision</h3>
          <ul className="plain-list">
            {gates.map((g) => (
              <li key={g.id}>
                <a href={withQuery(href.approvals(), { focus: g.id })}>
                  <span className="mono">{g.id}</span> {g.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="subhead">Equipment</h3>
      <p className="small muted">{room.equipment.join(', ') || 'none'}</p>
    </Panel>
  );
}
