import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { layoutFloor, roomForWorker } from './layout';

const floor = assemblyNexusConfig.floor;
const snap = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));
const worker = (id: string) => snap.workers.find((w) => w.id === id)!;

describe('roomForWorker', () => {
  it('sends workers waiting on approval to the Founder Gate', () => {
    expect(roomForWorker(worker('w-cyrus'), floor)).toBe('founder-gate');
  });
  it('routes by state', () => {
    expect(roomForWorker(worker('w-bramwell'), floor)).toBe('planning');
    expect(roomForWorker(worker('w-ada'), floor)).toBe('build');
    expect(roomForWorker(worker('w-pim'), floor)).toBe('review');
    expect(roomForWorker(worker('w-hedda'), floor)).toBe('certification');
    expect(roomForWorker(worker('w-rook'), floor)).toBe('break');
  });
  it('keeps idle reserved-crew workers in their crew room', () => {
    expect(roomForWorker(worker('w-kestrel'), floor)).toBe('snow-wolf-den');
  });
  it('falls back to the home room for unknown routes', () => {
    const w = { ...worker('w-ada'), state: 'IDLE' as const };
    expect(
      roomForWorker(w, { ...floor, stateRoutes: { ...floor.stateRoutes, IDLE: 'nowhere' } }),
    ).toBe('build');
  });
});

describe('layoutFloor', () => {
  it('places every worker inside its room bounds', () => {
    const placements = layoutFloor(snap.workers, floor);
    expect(placements.size).toBe(snap.workers.length);
    for (const [, p] of placements) {
      const r = floor.rooms.find((x) => x.id === p.roomId)!.area;
      expect(p.x).toBeGreaterThanOrEqual(r.x);
      expect(p.x).toBeLessThanOrEqual(r.x + r.w);
      expect(p.y).toBeGreaterThanOrEqual(r.y);
      expect(p.y).toBeLessThanOrEqual(r.y + r.h);
    }
  });
});
