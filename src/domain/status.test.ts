import { describe, expect, it } from 'vitest';
import { mapWorkerState } from './status';
import { formatClock, formatDuration, missionTiming } from './time';
import { selectOverview, redAlertActive } from './selectors';
import { buildSeedSnapshot } from '@/adapters/demo/seed';

describe('mapWorkerState', () => {
  it('accepts canonical states in any case', () => {
    expect(mapWorkerState('working')).toBe('WORKING');
    expect(mapWorkerState('CERTIFYING')).toBe('CERTIFYING');
  });
  it('maps common backend vocabulary', () => {
    expect(mapWorkerState('in-progress')).toBe('WORKING');
    expect(mapWorkerState('Succeeded')).toBe('COMPLETE');
    expect(mapWorkerState('canceled')).toBe('STOPPED');
  });
  it('falls back instead of throwing on unknown states', () => {
    expect(mapWorkerState('teleporting')).toBe('UNKNOWN');
    expect(mapWorkerState('teleporting', {}, 'IDLE')).toBe('IDLE');
  });
  it('supports custom mappings', () => {
    expect(mapWorkerState('forging', { forging: 'WORKING' })).toBe('WORKING');
    // Prototype keys are not treated as mappings.
    expect(mapWorkerState('constructor')).toBe('UNKNOWN');
    expect(mapWorkerState('toString')).toBe('UNKNOWN');
  });
});

describe('time', () => {
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(50_646_000)).toBe('14:04:06');
    expect(formatClock(-5)).toBe('00:00:00');
  });
  it('formats durations', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(12 * 60_000)).toBe('12m');
    expect(formatDuration(3 * 3_600_000 + 4 * 60_000)).toBe('3h 04m');
  });
  it('never invents remaining time without an estimate', () => {
    const t = missionTiming(
      { startedAt: '2026-01-01T00:00:00Z' },
      Date.parse('2026-01-01T01:00:00Z'),
    );
    expect(t.elapsedMs).toBe(3_600_000);
    expect(t.remainingMs).toBeNull();
  });
  it('computes remaining and overrun from an estimate', () => {
    const start = '2026-01-01T00:00:00Z';
    const ok = missionTiming(
      { startedAt: start, estimate: { durationMs: 7_200_000 } },
      Date.parse('2026-01-01T01:00:00Z'),
    );
    expect(ok.remainingMs).toBe(3_600_000);
    const over = missionTiming(
      { startedAt: start, estimate: { durationMs: 1_000 } },
      Date.parse('2026-01-01T01:00:00Z'),
    );
    expect(over.overrun).toBe(true);
    expect(over.remainingMs).toBe(0);
  });
  it('freezes elapsed time at completion', () => {
    const t = missionTiming(
      { startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:30:00Z' },
      Date.parse('2026-01-02T00:00:00Z'),
    );
    expect(t.elapsedMs).toBe(1_800_000);
  });
});

describe('selectors', () => {
  it('summarises the seed scenario', () => {
    const s = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));
    const o = selectOverview(s);
    expect(o.workersTotal).toBe(10);
    expect(o.approvalsPending).toBe(1);
    expect(o.completedMissions).toBe(1);
    expect(o.failedMissions).toBe(1);
    expect(o.queuedMissions).toBe(2);
    expect(redAlertActive(s)).toBe(false);
  });
});
