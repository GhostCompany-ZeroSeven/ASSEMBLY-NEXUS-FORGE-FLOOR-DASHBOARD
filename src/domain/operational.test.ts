import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import type { AdapterCapabilities } from '@/adapters/types';
import type { Freshness } from './freshness';
import {
  classifyOperation,
  classifySource,
  LADDER_STEPS,
  missionLifecycle,
  selectConnectionClaim,
  selectHealthReport,
  type LadderStep,
} from './operational';
import type { DashboardSnapshot } from './snapshot';
import type { Mission } from './types';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const seed = () => buildSeedSnapshot(NOW);
const ALL: AdapterCapabilities = {
  realtime: true,
  approvals: true,
  alertAcknowledgement: true,
  messaging: true,
  simulationControls: true,
};
const NONE: AdapterCapabilities = {
  realtime: false,
  approvals: false,
  alertAcknowledgement: false,
  messaging: false,
  simulationControls: false,
};
const rung = (m: Mission, s: DashboardSnapshot, step: LadderStep) =>
  missionLifecycle(m, s).find((r) => r.step === step)!;

describe('action safety classification', () => {
  it('demo mode turns every operation into a simulation, keeping the Founder gate visible', () => {
    expect(classifyOperation('approval-decision', { mode: 'demo', capabilities: ALL })).toEqual({
      cls: 'DEMO_SIMULATION',
      founderGated: true,
    });
    expect(classifyOperation('worker-message', { mode: 'demo', capabilities: ALL }).cls).toBe(
      'DEMO_SIMULATION',
    );
  });

  it('a live approval is a Founder-gated operation, never a plain action', () => {
    expect(classifyOperation('approval-decision', { mode: 'live', capabilities: ALL })).toEqual({
      cls: 'FOUNDER_GATED_OPERATION',
      founderGated: true,
    });
  });

  it('missing adapter capability is UNAVAILABLE, never silently executable', () => {
    for (const op of ['approval-decision', 'alert-acknowledge', 'worker-message'] as const)
      for (const mode of ['demo', 'live', 'disconnected', 'replay'] as const)
        expect(classifyOperation(op, { mode, capabilities: NONE }).cls).toBe('UNAVAILABLE');
  });

  it('disconnected or replay views never offer a real operation', () => {
    for (const mode of ['disconnected', 'replay'] as const)
      expect(classifyOperation('approval-decision', { mode, capabilities: ALL }).cls).toBe(
        'UNAVAILABLE',
      );
  });
});

describe('connection claim', () => {
  const f = (over: Partial<Freshness>): Freshness => ({
    source: 'LIVE',
    qualifiers: [],
    unknownResources: [],
    complete: true,
    ...over,
  });
  it('demo is always DEMO_SIMULATED, never CONNECTED', () => {
    expect(selectConnectionClaim(f({ source: 'SIMULATED', complete: false })).claim).toBe(
      'DEMO_SIMULATED',
    );
  });
  it('CONNECTED needs live AND complete data', () => {
    expect(selectConnectionClaim(f({})).claim).toBe('CONNECTED');
    expect(
      selectConnectionClaim(f({ complete: false, qualifiers: ['PARTIAL', 'UNKNOWN'] })),
    ).toEqual({ claim: 'PARTIALLY_CONNECTED', reasons: ['PARTIAL', 'UNKNOWN'] });
    expect(selectConnectionClaim(f({ complete: false, qualifiers: ['STALE'] })).claim).toBe(
      'PARTIALLY_CONNECTED',
    );
  });
  it('disconnected and replay stay as such', () => {
    expect(selectConnectionClaim(f({ source: 'DISCONNECTED', complete: false })).claim).toBe(
      'DISCONNECTED',
    );
    expect(selectConnectionClaim(f({ source: 'REPLAY', complete: false })).claim).toBe('REPLAY');
  });
});

describe('mission lifecycle ladder (false-green guard)', () => {
  it('always reports the six rungs in order', () => {
    const s = seed();
    for (const m of s.missions)
      expect(missionLifecycle(m, s).map((r) => r.step)).toEqual([...LADDER_STEPS]);
  });

  it('COMPLETED does not imply tested, certified, Founder approved or deployed', () => {
    const s = seed();
    const m: Mission = {
      ...s.missions[0]!,
      status: 'COMPLETE',
      artifacts: [],
      certification: 'PENDING',
      approvalIds: [],
      review: { ...s.missions[0]!.review, status: 'NOT_REQUESTED' },
    };
    expect(rung(m, s, 'work').state).toBe('DONE');
    expect(rung(m, s, 'tests').state).toBe('NOT_REPORTED');
    expect(rung(m, s, 'review').state).toBe('NOT_REQUESTED');
    expect(rung(m, s, 'certification').state).toBe('PENDING');
    expect(rung(m, s, 'deployment').state).toBe('NOT_TRACKED');
  });

  it('CERTIFIED does not imply Founder approval; approval does not imply deployment', () => {
    const s = seed();
    const gated = s.missions.find((x) =>
      x.approvalIds.some((id) => s.approvals.find((a) => a.id === id)?.status === 'PENDING'),
    )!;
    const m: Mission = { ...gated, certification: 'CERTIFIED' };
    expect(rung(m, s, 'certification').state).toBe('DONE');
    expect(rung(m, s, 'founder').state).not.toBe('DONE');
    const approved: DashboardSnapshot = {
      ...s,
      approvals: s.approvals.map((a) =>
        m.approvalIds.includes(a.id) ? { ...a, status: 'APPROVED' as const } : a,
      ),
    };
    expect(rung(m, approved, 'founder').state).toBe('DONE');
    expect(rung(m, approved, 'deployment').state).toBe('NOT_TRACKED');
  });

  it('test results are evidence, never a pass', () => {
    const s = seed();
    const m: Mission = {
      ...s.missions[0]!,
      artifacts: [
        {
          id: 'ART-T',
          missionId: s.missions[0]!.id,
          kind: 'test-result',
          title: 'suite',
          createdAt: new Date(NOW).toISOString(),
        },
      ],
    };
    expect(rung(m, s, 'tests')).toEqual({
      step: 'tests',
      state: 'EVIDENCE_REPORTED',
      evidence: ['ART-T'],
    });
  });

  it('UNKNOWN mission status stays UNKNOWN; unavailable approvals make the Founder rung UNKNOWN', () => {
    const s = seed();
    const gated = s.missions.find((x) => x.approvalIds.length)!;
    expect(rung({ ...gated, status: 'UNKNOWN' }, s, 'work').state).toBe('UNKNOWN');
    const down: DashboardSnapshot = {
      ...s,
      quality: {
        partial: true,
        issues: [{ id: 'x', severity: 'error', source: 'approvals', message: 'down', at: '' }],
      },
    };
    expect(rung(gated, down, 'founder').state).toBe('UNKNOWN');
    const missing: DashboardSnapshot = { ...s, approvals: [] };
    expect(rung(gated, missing, 'founder').state).toBe('UNKNOWN');
  });

  it('a simulated (demo) decision is flagged as simulated on the Founder rung', () => {
    const s = seed();
    const gated = s.missions.find((x) => x.approvalIds.length)!;
    const decided: DashboardSnapshot = {
      ...s,
      approvals: s.approvals.map((a) =>
        gated.approvalIds.includes(a.id)
          ? {
              ...a,
              status: 'APPROVED' as const,
              decision: {
                decision: 'APPROVE' as const,
                decidedBy: 'Founder #0007',
                decidedAt: new Date(NOW).toISOString(),
                delivery: 'simulated' as const,
              },
            }
          : a,
      ),
    };
    expect(rung(gated, decided, 'founder')).toMatchObject({ state: 'DONE', simulated: true });
  });

  it('produces no percentage or score anywhere', () => {
    const s = seed();
    for (const m of s.missions)
      expect(JSON.stringify(missionLifecycle(m, s))).not.toMatch(/%|score|ready/i);
  });
});

describe('health report', () => {
  it('attributes demo health to the simulation and lists the reasons', () => {
    const r = selectHealthReport(seed());
    expect(r.simulated).toBe(true);
    if (r.status !== 'NOMINAL') expect(r.reasons.length > 0 || r.unexplained).toBe(true);
    expect(r.notCovered).toEqual(['frontend', 'associates', 'deployment']);
  });

  it('flags a non-nominal status that no component explains', () => {
    const s = seed();
    const r = selectHealthReport({
      ...s,
      health: { status: 'DEGRADED', checkedAt: s.health.checkedAt, components: [] },
    });
    expect(r).toMatchObject({ unexplained: true, reasons: [] });
  });

  it('UNKNOWN health with no components reports no check time', () => {
    const s = seed();
    const r = selectHealthReport({
      ...s,
      health: { status: 'UNKNOWN', checkedAt: s.health.checkedAt, components: [] },
    });
    expect(r.checkedAt).toBeUndefined();
    expect(r.unexplained).toBe(false);
  });
});

describe('data source classification', () => {
  it('classifies by adapter kind, never by the data', () => {
    expect(classifySource({ adapterId: 'demo', mode: 'demo' })).toBe('DEMO');
    expect(classifySource({ adapterId: 'rest', mode: 'demo' })).toBe('DEMO');
    expect(classifySource({ adapterId: 'rest', mode: 'live' })).toBe('REMOTE');
    expect(classifySource({ adapterId: 'my-backend', mode: 'live' })).toBe('UNKNOWN');
    expect(classifySource({ adapterId: 'demo', mode: 'live' })).toBe('DEMO');
  });
});
