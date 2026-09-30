import type { FloorConfig, RoomDefinition } from '@/config/types';
import type { Worker } from '@/domain/types';

/**
 * Resolve which room a worker currently occupies.
 * Priority: waiting/blocked on an approval → approval room;
 * otherwise the configured state route (`home` = worker's home room).
 * Unknown rooms fall back to the worker's home room, then the first room.
 */
export function roomForWorker(worker: Worker, floor: FloorConfig): string {
  const ids = new Set(floor.rooms.map((r) => r.id));
  const waitingOnApproval =
    (worker.state === 'WAITING' || worker.state === 'BLOCKED') &&
    worker.blockers.some((b) => b.dependsOn?.kind === 'approval');
  if (waitingOnApproval && floor.approvalRoomId && ids.has(floor.approvalRoomId)) {
    return floor.approvalRoomId;
  }
  const route = floor.stateRoutes[worker.state];
  // Reserved-crew workers stay in their crew room when idle.
  const target = route === 'home' ? worker.homeRoomId : route;
  if (target && ids.has(target)) {
    if (worker.state === 'IDLE' && worker.homeRoomId && crewRoom(floor, worker.homeRoomId)) {
      return worker.homeRoomId;
    }
    return target;
  }
  if (ids.has(worker.homeRoomId)) return worker.homeRoomId;
  return floor.rooms[0]?.id ?? '';
}

function crewRoom(floor: FloorConfig, roomId: string): boolean {
  return floor.rooms.some((r) => r.id === roomId && r.crewId !== undefined);
}

export interface Placement {
  roomId: string;
  /** Percent coordinates of the token's foot position on the floor. */
  x: number;
  y: number;
  /** Room is full: the worker is counted in "+N more" instead of drawn. */
  hidden?: boolean;
}

const COL_WIDTH = 7.5; // percent of floor width per token column
const ROW_HEIGHT = 13; // percent of floor height per token row

/** Maximum tokens a room can draw without overlap. */
export function roomCapacity(r: RoomDefinition): number {
  const perRow = Math.max(1, Math.floor(r.area.w / COL_WIDTH));
  const rows = Math.max(1, Math.floor((r.area.h - 22) / ROW_HEIGHT) + 1);
  return perRow * rows;
}

/** Deterministic slot layout: occupants spread across the room's floor strip. */
export function layoutFloor(
  workers: readonly Worker[],
  floor: FloorConfig,
): Map<string, Placement> {
  const byRoom = new Map<string, Worker[]>();
  for (const w of workers) {
    const room = roomForWorker(w, floor);
    const list = byRoom.get(room) ?? [];
    list.push(w);
    byRoom.set(room, list);
  }
  const out = new Map<string, Placement>();
  for (const room of floor.rooms) {
    const occupants = (byRoom.get(room.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    const cap = roomCapacity(room);
    // If the room overflows, keep the last slot free for the "+N more" marker.
    const drawn = occupants.length > cap ? cap - 1 : occupants.length;
    occupants.forEach((w, i) =>
      out.set(
        w.id,
        i < drawn
          ? { roomId: room.id, ...slot(room, i, drawn) }
          : { roomId: room.id, x: 0, y: 0, hidden: true },
      ),
    );
  }
  return out;
}

function slot(r: RoomDefinition, index: number, count: number): { x: number; y: number } {
  const room = r.area;
  const perRow = Math.max(1, Math.floor(room.w / COL_WIDTH));
  const cols = Math.min(perRow, count);
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  const colsInRow = row === Math.floor((count - 1) / perRow) ? count - row * perRow : cols;
  const x = room.x + ((col + 0.5) / colsInRow) * room.w;
  const y = room.y + room.h - 6 - row * ROW_HEIGHT;
  return {
    x: clamp(x, room.x + 3, room.x + room.w - 3),
    y: clamp(y, room.y + 16, room.y + room.h - 4),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
