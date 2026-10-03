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
import { useI18n } from '@/i18n/useI18n';

const FLAGS: WorkerFlag[] = ['all', 'founder', 'blocked', 'active', 'idle', 'failed'];

/**
 * Floor state lives in the URL (?worker=, ?room=, ?show=, ?mission=) so search
 * results and cross-links can open the floor focused on something specific.
 */
export function ForgeFloorPage() {
  const snapshot = useSnapshot();
  const { crews, floor } = useConfig();
  const query = useHashQuery();
  const { m } = useI18n();
  const t = m.floor;
  const selected = query.worker ?? null;
  const roomId = query.room ?? null;
  // Unknown ?show= values fall back to "all" (URL state is never trusted blindly).
  const flag = (FLAGS.some((f) => f === query.show) ? query.show : 'all') as WorkerFlag;
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
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
          {forge?.motto && <p className="page__lede crew-motto">{forge.motto}</p>}
          <a className="vf-entry" href={href.visual()}>
            <Icon name="floor" size={14} />
            {m.visual.enterShort}
          </a>
        </div>
        <details className="legend-box">
          <summary>{t.legend}</summary>
          <ul className="legend" aria-label={t.legendAria}>
            {WORKER_STATES.map((s) => (
              <li key={s}>
                <span className="legend__glyph" aria-hidden="true">
                  <Icon name={STATE_GLYPH[s]} size={12} />
                </span>
                <StatusBadge tone={WORKER_STATE_META[s].tone} size="sm">
                  {m.status.worker[s]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </details>
      </header>

      <div className="filterbar floor-filter" role="search" aria-label={t.highlightAria}>
        <div className="filterbar__row">
          <div className="segmented" role="radiogroup" aria-label={t.highlight}>
            {FLAGS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={flag === f}
                className="segmented__item"
                onClick={() => setQuery({ show: f === 'all' ? undefined : f })}
              >
                {t.flag[f]}
                <span className="segmented__count">
                  {snapshot.workers.filter((w) => workerMatchesFlag(w, f, snapshot)).length}
                </span>
              </button>
            ))}
          </div>
          <SelectFilter
            label={t.mission}
            value={missionId}
            onChange={(id) => setQuery({ mission: id === 'all' ? undefined : id })}
            options={[
              { value: 'all', label: t.anyMission },
              ...missionsOnFloor.map((id) => ({ value: id, label: id })),
            ]}
          />
          <span className="filterbar__count" role="status" aria-live="polite">
            {filtering
              ? t.highlighted(matches, snapshot.workers.length)
              : t.workerCount(snapshot.workers.length)}
          </span>
          {filtering && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setQuery({ show: undefined, mission: undefined })}
            >
              <Icon name="reset" size={13} /> {t.resetHighlight}
            </button>
          )}
        </div>
        {filtering && matches === 0 && snapshot.workers.length > 0 && (
          <p className="small muted" role="note">
            {t.noHighlightMatch}
          </p>
        )}
      </div>

      <div className="floor-layout">
        <Panel family="floor" className="floor-panel">
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
          aria-label={room ? t.roomAria(room.label) : t.selectedWorker}
        >
          {room ? (
            <RoomPanel roomId={room.id} onClose={() => setQuery({ room: undefined })} />
          ) : worker ? (
            <>
              <WorkerCard worker={worker} />
              {worker.currentMissionId && (
                <p className="small floor-aside__hint">
                  {t.sharedMission}{' '}
                  <a href={href.mission(worker.currentMissionId)}>{worker.currentMissionId}</a>.
                </p>
              )}
            </>
          ) : (
            <Panel family="floor" title={t.selectTitle}>
              <p className="muted">{t.selectBody}</p>
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
  const { m } = useI18n();
  const t = m.floor;

  return (
    <Panel
      family="floor"
      eyebrow={crew ? `${crew.label}${crew.status === 'reserved' ? t.reservedSuffix : ''}` : t.room}
      title={room.label}
      actions={
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t.closeRoom}>
          <Icon name="x" size={14} />
        </button>
      }
    >
      <p className="muted small">{room.description}</p>
      <h3 className="subhead">{t.present(people.length)}</h3>
      {people.length === 0 ? (
        <EmptyState title={t.nobody} />
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
                    {w.currentMissionId ?? t.noMission}
                    {isWaitingForFounder(w, snapshot) ? t.awaitingFounderSuffix : ''}
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
      {gates.length > 0 && (
        <>
          <h3 className="subhead">{t.waitingDecision}</h3>
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
      <h3 className="subhead">{t.equipment}</h3>
      <p className="small muted">{room.equipment.join(', ') || m.common.none}</p>
    </Panel>
  );
}
