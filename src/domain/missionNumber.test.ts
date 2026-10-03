import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { newMission, routineMissionBeats } from '@/adapters/demo/script';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import {
  DEFAULT_MISSION_NUMBERING,
  formatOrdinal,
  isOrdinal,
  missionLabel,
  missionNumber,
  resolveNumbering,
} from './missionNumber';
import { applyEvent } from './reducer';

describe('lifetime mission ordinal: display format', () => {
  it.each([
    [0, '0000'],
    [1, '0001'],
    [9, '0009'],
    [10, '0010'],
    [139, '0139'],
    [9999, '9999'],
    [10000, '10000'],
    [123456, '123456'],
  ])('%i → %s (minimum width, no rollover)', (n, shown) => {
    expect(formatOrdinal(n)).toBe(shown);
  });

  it('the first mission of a fresh store is 0000 and the second 0001', () => {
    expect(missionNumber({ ordinal: 0 })).toBe('0000');
    expect(missionNumber({ ordinal: 1 })).toBe('0001');
  });

  it('never wraps or resets past 9999', () => {
    expect(formatOrdinal(10000)).not.toBe('0000');
    expect(Number(formatOrdinal(10000))).toBe(10000);
  });

  it('rejects anything that is not a non-negative safe integer', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, '7', null, undefined, 2 ** 60])
      expect(isOrdinal(bad)).toBe(false);
    expect(() => formatOrdinal(-1)).toThrow(RangeError);
  });
});

describe('prefix / ecosystem namespace', () => {
  it('the public default has no prefix and a 4-digit minimum', () => {
    expect(DEFAULT_MISSION_NUMBERING).toEqual({ prefix: '', minDigits: 4 });
    expect(missionNumber({ ordinal: 7 }, resolveNumbering(undefined))).toBe('0007');
  });

  it('Assembly Nexus displays the same ordinal in its AN- namespace', () => {
    const an = resolveNumbering(assemblyNexusConfig.missionNumbering);
    expect(missionNumber({ ordinal: 0 }, an)).toBe('AN-0000');
    expect(missionNumber({ ordinal: 139 }, an)).toBe('AN-0139');
  });

  it('any deployment can choose its own prefix and width', () => {
    expect(missionNumber({ ordinal: 42 }, resolveNumbering({ prefix: 'OPS-', minDigits: 6 }))).toBe(
      'OPS-000042',
    );
  });
});

describe('unknown ordinals are never fabricated', () => {
  it('a mission without an ordinal has no number and keeps its source identifier', () => {
    const m = { id: 'mission-7f3a', ordinal: null };
    expect(missionNumber(m)).toBeNull();
    expect(missionLabel(m)).toBe('mission-7f3a');
    expect(missionLabel({ id: 'mission-7f3a' })).toBe('mission-7f3a');
  });

  it('a status change never changes the number (completed, failed, cancelled…)', () => {
    const seed = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));
    const before = seed.missions.find((m) => m.id === 'AN-0141')!.ordinal;
    const failed = applyEvent(seed, {
      id: 'ev-fail',
      kind: 'mission.failed',
      at: '2026-09-30T12:00:00Z',
      missionId: 'AN-0141',
      payload: { result: { outcome: 'FAILURE', summary: 'x' } },
    });
    const after = failed.missions.find((m) => m.id === 'AN-0141')!;
    expect(after.status).toBe('FAILED');
    expect(after.ordinal).toBe(before);
  });
});

describe('no ordinal reuse in the reducer', () => {
  const seed = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));
  const created = (id: string, ordinal: number) => ({
    id: `ev-${id}`,
    kind: 'mission.created' as const,
    at: '2026-09-30T12:00:00Z',
    missionId: id,
    payload: { mission: newMission(id, ordinal, 'x', '', '2026-09-30T12:00:00Z') },
  });

  it('keeps a fresh ordinal', () => {
    const next = applyEvent(seed, created('AN-0150', 150));
    expect(next.missions.find((m) => m.id === 'AN-0150')!.ordinal).toBe(150);
  });

  it('a new mission claiming a number already held is shown with an unknown number', () => {
    const next = applyEvent(seed, created('AN-dup', 141));
    expect(next.missions.find((m) => m.id === 'AN-dup')!.ordinal).toBeNull();
    expect(next.missions.find((m) => m.id === 'AN-0141')!.ordinal).toBe(141);
  });
});

describe('demo sequence (simulated store)', () => {
  const seed = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));

  it('every demo mission has a unique ordinal that follows creation order', () => {
    const byCreated = [...seed.missions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const ordinals = seed.missions.map((m) => m.ordinal);
    expect(new Set(ordinals).size).toBe(seed.missions.length);
    expect(ordinals.every(isOrdinal)).toBe(true);
    for (let i = 1; i < byCreated.length; i++)
      expect(byCreated[i]!.ordinal!).toBeGreaterThan(byCreated[i - 1]!.ordinal!);
  });

  it('a routine mission takes the number the simulated store hands it', () => {
    const ctx = {
      snapshot: seed,
      at: '2026-09-30T12:00:00Z',
      rng: () => 0.1,
      nextId: (p: string) => `${p}-1`,
    };
    const events = routineMissionBeats(ctx, 150)[0]!(ctx);
    const ev = events.find((e) => e.kind === 'mission.created')!;
    expect((ev.payload as { mission: { ordinal: number } }).mission.ordinal).toBe(150);
  });
});
