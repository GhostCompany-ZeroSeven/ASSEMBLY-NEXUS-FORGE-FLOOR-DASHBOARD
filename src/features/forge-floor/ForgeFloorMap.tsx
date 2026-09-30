import { useMemo } from 'react';
import { href } from '@/app/router';
import { Icon } from '@/components/Icon';
import type { RoomDefinition } from '@/config/types';
import { pendingApprovals } from '@/domain/selectors';
import type { Worker } from '@/domain/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useConfig, useSnapshot } from '@/store/hooks';
import { Equipment } from './Equipment';
import { layoutFloor } from './layout';
import { WorkerToken } from './WorkerToken';

const BUSY = new Set<Worker['state']>(['PLANNING', 'WORKING', 'REVIEWING', 'CERTIFYING']);

/**
 * The visual Forge Floor. Rooms come from config; workers are placed by
 * state routing (see layout.ts) and glide between rooms on state changes.
 * Below 900px the plan collapses into stacked rooms for readability.
 */
export function ForgeFloorMap({
  selectedId,
  onSelect,
  compact = false,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const { floor, crews } = useConfig();
  const snapshot = useSnapshot();
  const stacked = useMediaQuery('(max-width: 900px)');
  const placements = useMemo(() => layoutFloor(snapshot.workers, floor), [snapshot.workers, floor]);
  const gatesWaiting = pendingApprovals(snapshot).length;
  const hasCritical = snapshot.alerts.some((a) => a.severity === 'CRITICAL' && !a.resolvedAt);

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
    return { people, crew, alerting, active: people.some((p) => BUSY.has(p.state)) };
  };

  if (stacked) {
    return (
      <div className="floor floor--stacked" data-critical={hasCritical || undefined}>
        {snapshot.workers.length === 0 && (
          <p className="empty" role="status">
            No workers reported by the data source.
          </p>
        )}
        {floor.rooms.map((room) => {
          const { people, crew, alerting, active } = roomProps(room);
          return (
            <section
              key={room.id}
              className="room room--stacked"
              data-kind={room.kind}
              data-active={active}
              data-alert={alerting || undefined}
            >
              <RoomHeader
                room={room}
                count={people.length}
                gatesWaiting={gatesWaiting}
                reserved={crew?.status === 'reserved'}
              />
              <div className="room__stack-people">
                {people.length === 0 ? (
                  <span className="muted small">Empty</span>
                ) : (
                  people.map((w) => (
                    <WorkerToken
                      key={w.id}
                      worker={w}
                      selected={selectedId === w.id}
                      onSelect={onSelect}
                      size={44}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`floor${compact ? ' floor--compact' : ''}`}
      data-critical={hasCritical || undefined}
      role="group"
      aria-label="Forge Floor plan"
    >
      <div className="floor__grid" aria-hidden="true" />
      {snapshot.workers.length === 0 && (
        <p className="floor__empty" role="status">
          No workers reported by the data source.
        </p>
      )}
      {floor.rooms.map((room) => {
        const { people, crew, alerting, active } = roomProps(room);
        return (
          <section
            key={room.id}
            className="room"
            data-kind={room.kind}
            data-active={active}
            data-alert={alerting || undefined}
            data-gate-waiting={room.kind === 'founder-gate' && gatesWaiting > 0 ? true : undefined}
            style={{
              left: `${room.area.x}%`,
              top: `${room.area.y}%`,
              width: `${room.area.w}%`,
              height: `${room.area.h}%`,
            }}
            aria-label={`${room.label}: ${people.length} worker${people.length === 1 ? '' : 's'}`}
          >
            <RoomHeader
              room={room}
              count={people.length}
              gatesWaiting={gatesWaiting}
              reserved={crew?.status === 'reserved'}
            />
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
                <Icon name="wolf" size={14} /> Reserved for {crew.label}
              </div>
            )}
          </section>
        );
      })}
      {snapshot.workers.map((w) => {
        const p = placements.get(w.id);
        if (!p) return null;
        return (
          <WorkerToken
            key={w.id}
            worker={w}
            selected={selectedId === w.id}
            onSelect={onSelect}
            size={compact ? 34 : 50}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          />
        );
      })}
    </div>
  );
}

function RoomHeader({
  room,
  count,
  gatesWaiting,
  reserved,
}: {
  room: RoomDefinition;
  count: number;
  gatesWaiting: number;
  reserved: boolean;
}) {
  return (
    <header className="room__header">
      <span className="room__label">{room.label}</span>
      <span className="room__count" title="Workers present">
        {count}
      </span>
      {room.kind === 'founder-gate' && gatesWaiting > 0 && (
        <a className="room__gate-flag" href={href.approvals()}>
          {gatesWaiting} awaiting decision
        </a>
      )}
      {reserved && <span className="room__tag">reserved</span>}
    </header>
  );
}
