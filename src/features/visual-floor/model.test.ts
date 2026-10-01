import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import type { Freshness } from '@/domain/freshness';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type { Mission } from '@/domain/types';
import {
  CRITICAL_MS,
  PREVIEW_PRESETS,
  ROSTER,
  bindStations,
  buildVisualState,
  featuredMission,
  formatClock,
  missionStages,
  missionTimer,
} from './model';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const SIM: Freshness = {
  source: 'SIMULATED',
  qualifiers: [],
  unknownResources: [],
  complete: false,
};
const seed = () => buildSeedSnapshot(NOW);
const iso = (off = 0) => new Date(NOW + off).toISOString();

function down(s: DashboardSnapshot, ...resources: string[]): DashboardSnapshot {
  return {
    ...s,
    quality: {
      ...s.quality,
      partial: true,
      issues: resources.map((r, i) => ({
        id: `i${i}`,
        severity: 'error' as const,
        source: r,
        message: `${r} failed`,
        at: iso(),
      })),
    },
  };
}
const mission = (s: DashboardSnapshot, id: string) => s.missions.find((m) => m.id === id)!;
const stage = (stages: ReturnType<typeof missionStages>, key: string) =>
  stages.find((x) => x.key === key)!.status;

describe('visual floor presentation model', () => {
  it('maps stages from mission facts and never guesses TEST', () => {
    const s = seed();
    for (const m of s.missions) expect(stage(missionStages(m, s), 'test')).toBe('unknown');
    const active = mission(s, 'AN-0142');
    const st = missionStages(active, s);
    expect(stage(st, 'plan')).toBe('done');
    expect(stage(st, 'build')).toBe('active');
  });

  it('FOUNDER DECISION follows linked approvals; unknown when approvals are unavailable', () => {
    const s = seed();
    const gated = s.missions.find((m) => m.approvalIds.length)!;
    expect(['active', 'done', 'blocked']).toContain(stage(missionStages(gated, s), 'founder'));
    expect(stage(missionStages(gated, down(s, 'approvals')), 'founder')).toBe('unknown');
    const ungated = s.missions.find((m) => !m.approvalIds.length)!;
    expect(stage(missionStages(ungated, s), 'founder')).toBe('not-required');
  });

  it('timer: time-left, critical, overdue, done, unknown', () => {
    const s = seed();
    const m = mission(s, 'AN-0142');
    const start = Date.parse(m.startedAt!);
    const dur = m.estimate!.durationMs;
    expect(missionTimer(m, start + dur - CRITICAL_MS - 1000)).toMatchObject({
      kind: 'time-left',
      critical: false,
    });
    expect(missionTimer(m, start + dur - 60_000)).toMatchObject({
      kind: 'time-left',
      critical: true,
    });
    expect(missionTimer(m, start + dur + 5000)).toEqual({ kind: 'overdue', ms: 5000 });
    expect(missionTimer({ ...m, status: 'COMPLETE' } as Mission, NOW)).toEqual({ kind: 'done' });
    expect(missionTimer({ ...m, estimate: undefined } as Mission, NOW)).toEqual({
      kind: 'unknown',
    });
    expect(missionTimer({ ...m, status: 'QUEUED' } as Mission, NOW)).toEqual({ kind: 'unknown' });
  });

  it('never claims an Assembly Nexus connection, memory or deployment', () => {
    for (const preset of [undefined, ...PREVIEW_PRESETS]) {
      const v = buildVisualState(seed(), SIM, 'connected', NOW, { preset });
      const row = (r: string) => v.systems.find((x) => x.row === r)!;
      expect(row('ann')).toEqual({ row: 'ann', state: 'UNKNOWN', basis: 'not-connected' });
      expect(row('memory').state).toBe('UNKNOWN');
      expect(row('deployment')).toMatchObject({ state: 'BLOCKED', basis: 'not-authorized' });
      expect(v.provenance).toBe('DEMO');
    }
  });

  it('presets are labelled presets and carry the designed board', () => {
    const cd = buildVisualState(seed(), SIM, 'idle', NOW, { preset: 'countdown' });
    expect(cd).toMatchObject({ source: 'preset', preset: 'countdown', mode: 'countdown' });
    expect(cd.board.missionId).toBeUndefined();
    expect(cd.board.timer).toMatchObject({ kind: 'time-left', critical: false });
    if (cd.board.timer.kind === 'time-left')
      expect(formatClock(cd.board.timer.ms)).toBe('02:43:17');

    const crit = buildVisualState(seed(), SIM, 'idle', NOW, { preset: 'countdown-critical' });
    expect(crit.board.timer).toMatchObject({ kind: 'time-left', critical: true });

    const acc = buildVisualState(seed(), SIM, 'idle', NOW, { preset: 'accomplished' });
    expect(acc.mode).toBe('accomplished');
    expect(acc.board.timer).toEqual({ kind: 'done' });
    expect(acc.board.stages.every((x) => x.status === 'done')).toBe(true);

    const red = buildVisualState(seed(), SIM, 'idle', NOW, { preset: 'red-alert' });
    expect(red.mode).toBe('red-alert');
    expect(red.board.stages.some((x) => x.status === 'blocked')).toBe(true);
  });

  it('preset countdown ticks down from elapsed time and turns critical', () => {
    const v = buildVisualState(seed(), SIM, 'idle', NOW, {
      preset: 'countdown',
      presetElapsedMs: (2 * 3600 + 43 * 60 + 17) * 1000 - 60_000,
    });
    expect(v.board.timer).toEqual({ kind: 'time-left', ms: 60_000, critical: true });
  });

  it('data mode features a timed active mission and states red alert only from critical alerts', () => {
    const s = seed();
    const v = buildVisualState(s, SIM, 'idle', NOW);
    expect(v.source).toBe('data');
    expect(v.board.missionId).toBe(featuredMission(s)!.id);
    const calm = { ...s, alerts: s.alerts.map((a) => ({ ...a, resolvedAt: iso() })) };
    expect(buildVisualState(calm, SIM, 'idle', NOW).mode).not.toBe('red-alert');
    const crit = {
      ...calm,
      alerts: [
        {
          ...calm.alerts[0]!,
          severity: 'CRITICAL' as const,
          resolvedAt: undefined,
          acknowledgedAt: undefined,
        },
      ],
    };
    expect(buildVisualState(crit, SIM, 'idle', NOW).mode).toBe('red-alert');
  });

  it('explicit mission id binds the board', () => {
    const v = buildVisualState(seed(), SIM, 'idle', NOW, { missionId: 'AN-0143' });
    expect(v.board.missionId).toBe('AN-0143');
  });

  it('unavailable missions give UNKNOWN counts and an unknown board, not zero', () => {
    const v = buildVisualState(down(seed(), 'missions'), SIM, 'idle', NOW);
    expect(v.alerts).toEqual({
      requiresReview: null,
      blocked: null,
      inProgress: null,
      queued: null,
    });
    expect(v.board.timer).toEqual({ kind: 'unknown' });
    expect(v.board.stages.every((x) => x.status === 'unknown')).toBe(true);
  });

  it('unavailable workers give UNKNOWN associates and crew counts', () => {
    const v = buildVisualState(down(seed(), 'workers'), SIM, 'idle', NOW);
    expect(v.systems.find((x) => x.row === 'associates')!.state).toBe('UNKNOWN');
    expect(v.crew).toEqual({ forge: null, snowWolf: null });
  });

  it('binds the Snow Wolf crew to bandit stations and others to scientists', () => {
    const s = seed();
    const b = bindStations(s);
    for (const st of b.filter((x) => x.worker)) {
      const w = s.workers.find((x) => x.id === st.worker!.id)!;
      expect(st.kind).toBe(w.crewId === 'snow-wolf' ? 'bandit' : 'scientist');
    }
    expect(b.filter((x) => x.kind === 'wisp').every((x) => !x.worker)).toBe(true);
    const ids = b.flatMap((x) => (x.worker ? [x.worker.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('roster names are names only', () => {
    expect([...ROSTER]).toEqual(['Charles', 'Cipher', 'Winter', 'ADA']);
  });

  it('formatClock', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(-5)).toBe('00:00:00');
    expect(formatClock((26 * 3600 + 5) * 1000)).toBe('26:00:05');
  });
});
