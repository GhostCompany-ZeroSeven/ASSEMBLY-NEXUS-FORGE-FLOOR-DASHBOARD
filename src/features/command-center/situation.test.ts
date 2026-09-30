import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { selectSituation } from './situation';

const NOW = Date.parse('2026-09-30T12:00:00Z');

function failed(sources: string[]): DashboardSnapshot {
  const s = buildSeedSnapshot(NOW);
  return {
    ...s,
    missions: sources.includes('missions') ? [] : s.missions,
    workers: sources.includes('workers') ? [] : s.workers,
    quality: {
      partial: true,
      issues: sources.map((source, i) => ({
        id: `${source}#${i}`,
        severity: 'error' as const,
        source,
        message: 'Backend returned HTTP 500',
        at: new Date(NOW).toISOString(),
      })),
    },
  };
}

describe('selectSituation', () => {
  it('marks a resource unavailable only when its fetch failed (not per-record warnings)', () => {
    const s = failed(['missions']);
    s.quality.issues.push({
      id: 'w',
      severity: 'warning',
      source: 'workers[2]',
      message: 'Unrecognised state',
      at: s.generatedAt,
    });
    const u = selectSituation(s, 'connected', NOW).unavailable;
    expect(u).toEqual({ missions: true, workers: false, approvals: false, alerts: false });
  });

  it('healthy data has nothing unavailable', () => {
    const u = selectSituation(buildSeedSnapshot(NOW), 'connected', NOW).unavailable;
    expect(Object.values(u).some(Boolean)).toBe(false);
  });

  it('an empty list from a failed fetch is still reported as zero counts, flagged unavailable', () => {
    const sit = selectSituation(failed(['missions', 'workers']), 'connected', NOW);
    expect(sit.failed.missions).toBe(0);
    expect(sit.unavailable.missions).toBe(true);
    expect(sit.unavailable.workers).toBe(true);
  });
});
