import { useEffect, useMemo, useRef, useState } from 'react';
import { href } from '@/app/router';
import { Icon } from '@/components/Icon';
import type { RoomDefinition } from '@/config/types';
import { pendingApprovals, resourceUnavailable } from '@/domain/selectors';
import type { Worker } from '@/domain/types';
import { isWaitingForFounder } from '@/features/filters/filters';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/useI18n';
import { useConfig, useSnapshot } from '@/store/hooks';
import { Equipment } from './Equipment';
import { layoutFloor, type Placement } from './layout';
import { WorkerToken } from './WorkerToken';

const BUSY = new Set<Worker['state']>(['PLANNING', 'WORKING', 'REVIEWING', 'CERTIFYING']);

/**
 * The visual Forge Floor. Rooms come from config; workers are placed by
 * state routing (see layout.ts) and walk between rooms on state changes.
 * Below 900px the plan collapses into stacked rooms for readability.
 *
 * Accessibility: tokens are buttons with full spoken status; room changes are
 * announced in a polite live region and shown as text ("Latest movement"), so
 * reduced-motion and screen-reader users get the same information as the walk.
 */
export function ForgeFloorMap({
  selectedId,
  onSelect,
  compact = false,
  highlight,
  selectedRoomId,
  onSelectRoom,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
  /** Floor filter: workers that do not match are de-emphasised (never hidden). */
  highlight?: (w: Worker) => boolean;
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string) => void;
}) {
  const { floor, crews } = useConfig();
  const snapshot = useSnapshot();
  const { m } = useI18n();
  const t = m.floor;
  const stacked = useMediaQuery('(max-width: 900px)');
  const placements = useMemo(() => layoutFloor(snapshot.workers, floor), [snapshot.workers, floor]);
  const gatesWaiting = pendingApprovals(snapshot).length;
  const hasCritical = snapshot.alerts.some((a) => a.severity === 'CRITICAL' && !a.resolvedAt);
  const selected = snapshot.workers.find((w) => w.id === selectedId);
  const lastMove = useMovementLog(snapshot.workers, placements, floor.rooms);

  const occupants = (roomId: string) =>
    snapshot.workers.filter((w) => placements.get(w.id)?.roomId === roomId);

  const roomProps = (room: RoomDefinition) => {
    const people = occupants(room.id);
    const crew = room.crewId ? crews.find((c) => c.id === room.crewId) : undefined;
    const alerting = snapshot.alerts.some(
      (a) =>
        a.severity === 'CRITICAL' &&
        !a.resolvedAt &&
        a.affected.some((x) => people.some((p) => p.id === x.id)),
    );
    const overflow = people.filter((p) => placements.get(p.id)?.hidden).length;
    return { people, crew, alerting, overflow, active: people.some((p) => BUSY.has(p.state)) };
  };

  const tokenProps = (w: Worker) => {
    const roomId = placements.get(w.id)?.roomId;
    return {
      worker: w,
      roomId,
      roomLabel: floor.rooms.find((r) => r.id === roomId)?.label,
      selected: selectedId === w.id,
      onSelect,
      compact,
      waitingForFounder: isWaitingForFounder(w, snapshot),
      dimmed: highlight ? !highlight(w) : false,
      related:
        !!selected &&
        selected.id !== w.id &&
        !!selected.currentMissionId &&
        selected.currentMissionId === w.currentMissionId,
    };
  };

  const emptyNotice = snapshot.workers.length === 0 && (
    <p className={stacked ? 'empty' : 'floor__empty'} role="status">
      {resourceUnavailable(snapshot, 'workers') ? t.workersUnavailable : t.noWorkers}
    </p>
  );

  const header = (room: RoomDefinition, count: number, reserved: boolean) => (
    <RoomHeader
      room={room}
      count={count}
      gatesWaiting={gatesWaiting}
      reserved={reserved}
      selected={selectedRoomId === room.id}
      onSelect={onSelectRoom}
    />
  );

  const movement = !compact && (
    <p className="floor__movement" aria-live="polite">
      {lastMove ? (
        <>
          <span className="floor__movement-label">{t.latestMovement}</span> {lastMove}
        </>
      ) : (
        <span className="visually-hidden">{t.noMovement}</span>
      )}
    </p>
  );

  if (stacked) {
    return (
      <>
        <div className="floor floor--stacked" data-critical={hasCritical || undefined}>
          {emptyNotice}
          {floor.rooms.map((room) => {
            const { people, crew, alerting, active } = roomProps(room);
            return (
              <section
                key={room.id}
                className="room room--stacked"
                data-kind={room.kind}
                data-active={active}
                data-alert={alerting || undefined}
                data-selected={selectedRoomId === room.id || undefined}
                data-focus-id={`room:${room.id}`}
                aria-label={t.roomPeople(room.label, people.length)}
              >
                {header(room, people.length, crew?.status === 'reserved')}
                <div className="room__stack-people">
                  {people.length === 0 ? (
                    <span className="muted small">{t.empty}</span>
                  ) : (
                    people.map((w) => <WorkerToken key={w.id} {...tokenProps(w)} size={44} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
        {movement}
      </>
    );
  }

  return (
    <>
      <div
        className={`floor${compact ? ' floor--compact' : ''}`}
        data-critical={hasCritical || undefined}
        data-filtering={highlight ? true : undefined}
        role="group"
        aria-label={t.plan}
      >
        <div className="floor__grid" aria-hidden="true" />
        {emptyNotice}
        {floor.rooms.map((room) => {
          const { people, crew, alerting, active, overflow } = roomProps(room);
          return (
            <section
              key={room.id}
              className="room"
              data-kind={room.kind}
              data-active={active}
              data-alert={alerting || undefined}
              data-selected={selectedRoomId === room.id || undefined}
              data-gate-waiting={
                room.kind === 'founder-gate' && gatesWaiting > 0 ? true : undefined
              }
              data-focus-id={`room:${room.id}`}
              style={{
                left: `${room.area.x}%`,
                top: `${room.area.y}%`,
                width: `${room.area.w}%`,
                height: `${room.area.h}%`,
              }}
              aria-label={t.roomPeople(room.label, people.length)}
            >
              {header(room, people.length, crew?.status === 'reserved')}
              <div className="room__equipment">
                {room.equipment.map((e, i) => (
                  <Equipment
                    key={`${e}-${i}`}
                    kind={e}
                    active={active || (room.kind === 'founder-gate' && gatesWaiting > 0)}
                  />
                ))}
              </div>
              {crew?.status === 'reserved' && !compact && (
                <div className="room__reserved">
                  <Icon name="wolf" size={14} /> {t.reservedFor(crew.label)}
                </div>
              )}
              {overflow > 0 && (
                <button
                  type="button"
                  className="room__overflow"
                  onClick={() => onSelectRoom?.(room.id)}
                  aria-label={t.overflowAria(overflow, room.label)}
                >
                  {m.common.more(overflow)}
                </button>
              )}
            </section>
          );
        })}
        {snapshot.workers.map((w) => {
          const p = placements.get(w.id);
          if (!p || p.hidden) return null;
          return (
            <WorkerToken
              key={w.id}
              {...tokenProps(w)}
              size={compact ? 34 : 50}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          );
        })}
      </div>
      {movement}
    </>
  );
}

function RoomHeader({
  room,
  count,
  gatesWaiting,
  reserved,
  selected,
  onSelect,
}: {
  room: RoomDefinition;
  count: number;
  gatesWaiting: number;
  reserved: boolean;
  selected: boolean;
  onSelect?: (roomId: string) => void;
}) {
  const t = useI18n().m.floor;
  return (
    <header className="room__header">
      {onSelect ? (
        <button
          type="button"
          className="room__label room__label--button"
          onClick={() => onSelect(room.id)}
          aria-pressed={selected}
          aria-label={t.roomButton(room.label, count)}
          title={room.label}
        >
          {room.label}
        </button>
      ) : (
        <span className="room__label" title={room.label}>
          {room.label}
        </span>
      )}
      <span className="room__count" title={t.workersPresent} aria-hidden="true">
        {count}
      </span>
      {room.kind === 'founder-gate' && gatesWaiting > 0 && (
        <a className="room__gate-flag" href={href.approvals()}>
          {t.awaitingDecision(gatesWaiting)}
        </a>
      )}
      {reserved && <span className="room__tag">{t.reservedTag}</span>}
    </header>
  );
}

/**
 * Text description of the most recent room change, e.g.
 * "Pim Calloway moved to Review Chamber (Reviewing)".
 */
function useMovementLog(
  workers: readonly Worker[],
  placements: Map<string, Placement>,
  rooms: readonly RoomDefinition[],
): string | null {
  const { m } = useI18n();
  const prev = useRef<Map<string, string> | null>(null);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    const now = new Map([...placements].map(([id, p]) => [id, p.roomId]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const moved = workers.filter((w) => before.has(w.id) && before.get(w.id) !== now.get(w.id));
    if (moved.length === 0) return;
    const text = moved
      .slice(0, 3)
      .map((w) =>
        m.floor.movedTo(
          w.name,
          rooms.find((r) => r.id === now.get(w.id))?.label ?? m.floor.unknownRoom,
          m.status.worker[w.state],
        ),
      )
      .join('; ');
    const t = setTimeout(
      () => setLast(moved.length > 3 ? `${text}; ${m.common.more(moved.length - 3)}` : text),
      0,
    );
    return () => clearTimeout(t);
  }, [workers, placements, rooms, m]);
  return last;
}
