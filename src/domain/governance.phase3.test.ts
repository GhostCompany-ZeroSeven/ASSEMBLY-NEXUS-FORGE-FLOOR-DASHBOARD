/**
 * Governance regression suite, phase 3. Each block is one Founder requirement.
 * Founder #0007 remains the only configured human approval authority; there is
 * no alternate or implicit approval path. Do not weaken these tests.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { buildStressSnapshot } from '@/adapters/demo/stress';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { resolvePose } from '@/characters/pose';
import { missionMatchesGroup, isWaitingForFounder } from '@/features/filters/filters';
import { roomForWorker } from '@/features/forge-floor/layout';
import { selectSituation } from '@/features/command-center/situation';
import { restTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { testAdapter } from '@/test/fixtures';
import { checkDecision, verifyBackendAuthorityClaims } from './governance';
import { displayMode } from './provenance';
import { isMissionInFlight, pendingApprovals } from './selectors';
import { mapWorkerState } from './status';

const FOUNDER = 'Founder #0007';
const NOW = Date.parse('2026-09-30T12:00:00Z');
const seed = () => buildSeedSnapshot(NOW);
const apr031 = () => seed().approvals.find((a) => a.id === 'APR-031')!;

describe('WORKER ≠ FOUNDER', () => {
  it('no worker, by id or name, can decide any open approval', () => {
    const s = seed();
    for (const w of s.workers) {
      expect(checkDecision(apr031(), w.id, s.workers).ok, w.id).toBe(false);
      expect(checkDecision(apr031(), w.name, s.workers).ok, w.name).toBe(false);
    }
    expect(checkDecision(apr031(), FOUNDER, s.workers).ok).toBe(true);
  });
});

describe('CAPABILITY ≠ AUTHORITY', () => {
  it('capabilities never appear as authority, even when labelled like authority', () => {
    const s = seed();
    const w = {
      ...s.workers[0]!,
      capabilities: [{ id: 'approve-all', label: `Acts as ${FOUNDER}` }],
    };
    expect(w.authority).toHaveLength(0);
    expect(checkDecision(apr031(), w.name, [w]).ok).toBe(false);
  });
});

describe('MISSION OWNERSHIP ≠ APPROVAL AUTHORITY', () => {
  it('workers assigned to the gated mission cannot decide it', () => {
    const s = seed();
    const mission = s.missions.find((m) => m.id === 'AN-0144')!;
    const owners = [...mission.assignedWorkerIds, 'w-ada'];
    mission.assignedWorkerIds = owners;
    for (const id of owners) expect(checkDecision(apr031(), id, s.workers).ok).toBe(false);
  });
});

describe('ROOM LOCATION ≠ AUTHORITY', () => {
  it('standing at the Founder Gate grants nothing', () => {
    const s = seed();
    const cyrus = s.workers.find((w) => w.id === 'w-cyrus')!;
    expect(roomForWorker(cyrus, assemblyNexusConfig.floor)).toBe('founder-gate');
    expect(checkDecision(apr031(), cyrus.id, s.workers).ok).toBe(false);
    // Even a worker whose HOME is the Founder Gate.
    const gatekeeper = { ...s.workers[1]!, homeRoomId: 'founder-gate' };
    expect(checkDecision(apr031(), gatekeeper.id, [...s.workers, gatekeeper]).ok).toBe(false);
  });

  it('character art and poses carry no authority', () => {
    const s = seed();
    const w = { ...s.workers[0]!, characterId: FOUNDER };
    expect(resolvePose(w.state, { waitingForFounder: true })).toBe('waiting-founder');
    expect(checkDecision(apr031(), w.id, [w]).ok).toBe(false);
  });
});

describe('BACKEND CLAIM ≠ VERIFIED AUTHORITY', () => {
  it('a backend decision attributed to a worker or to another human is discarded', () => {
    const s = seed();
    const base = apr031();
    const byWorker = {
      ...base,
      status: 'APPROVED' as const,
      decision: {
        decision: 'APPROVE' as const,
        decidedBy: 'Cyrus Anvil',
        decidedAt: base.requestedAt,
        delivery: 'delivered' as const,
      },
    };
    const byOther = {
      ...byWorker,
      id: 'X',
      decision: { ...byWorker.decision, decidedBy: 'Someone Else' },
    };
    const ok = { ...byWorker, id: 'Y', decision: { ...byWorker.decision, decidedBy: FOUNDER } };
    const r = verifyBackendAuthorityClaims([byWorker, byOther, ok], s.workers);
    expect(r.approvals.map((a) => a.status)).toEqual(['UNKNOWN', 'UNKNOWN', 'APPROVED']);
    expect(r.approvals[0]!.decision).toBeUndefined();
    expect(r.problems).toHaveLength(2);
  });

  it('authority grants attributed to a worker are dropped', () => {
    const s = seed();
    const w = {
      ...s.workers[0]!,
      authority: [{ id: 'g', label: 'Deploy', grantedBy: 'w-ada', grantedAt: s.generatedAt }],
    };
    const r = verifyBackendAuthorityClaims([], [w, ...s.workers.slice(1)]);
    expect(r.workers[0]!.authority).toHaveLength(0);
  });

  it('end to end: a REST backend claiming a worker approved APR-031 is not believed', async () => {
    const backend = createFakeBackend();
    const list = (backend.data.approvals as { approvals: Record<string, unknown>[] }).approvals;
    const a = list.find((x) => x.id === 'APR-031')!;
    a.status = 'APPROVED';
    a.decision = { decision: 'APPROVE', decidedBy: 'w-cyrus', decidedAt: '2026-09-30T11:59:00Z' };
    const { adapter } = restTestAdapter(backend);
    const snap = await adapter.connect();
    const got = snap.approvals.find((x) => x.id === 'APR-031')!;
    expect(got.status).toBe('UNKNOWN');
    expect(snap.quality.issues.some((i) => /not by the required authority/.test(i.message))).toBe(
      true,
    );
  });
});

describe('MALFORMED AUTHORITY ≠ FOUNDER', () => {
  it.each([[''], ['   '], [null], [42], [{ name: FOUNDER }], [[FOUNDER]]])(
    'requiredAuthority %j blocks decisions',
    (bad) => {
      expect(
        checkDecision({ ...apr031(), requiredAuthority: bad as unknown as string }, FOUNDER, []).ok,
      ).toBe(false);
    },
  );
});

describe('UNKNOWN STATUS ≠ WAITING', () => {
  it('unknown worker states are UNKNOWN, not WAITING, and never "waiting for Founder"', () => {
    expect(mapWorkerState('paused-maybe')).toBe('UNKNOWN');
    const w = { ...seed().workers.find((x) => x.id === 'w-cyrus')!, state: 'UNKNOWN' as const };
    // Founder-waiting depends on an OPEN approval blocker, not on the state.
    expect(isWaitingForFounder(w, seed())).toBe(true);
    const noBlocker = { ...w, blockers: [] };
    expect(isWaitingForFounder(noBlocker, seed())).toBe(false);
  });

  it('UNKNOWN approvals are not pending and cannot be decided', () => {
    const s = seed();
    s.approvals = s.approvals.map((a) =>
      a.id === 'APR-031' ? { ...a, status: 'UNKNOWN' as const } : a,
    );
    expect(pendingApprovals(s).map((a) => a.id)).not.toContain('APR-031');
    expect(
      checkDecision(
        s.approvals.find((a) => a.id === 'APR-031'),
        FOUNDER,
        s.workers,
      ).ok,
    ).toBe(false);
  });

  it('UNKNOWN missions are neither in flight nor Founder-gated', () => {
    const s = seed();
    const m = { ...s.missions[0]!, status: 'UNKNOWN' as const, approvalIds: [] };
    expect(isMissionInFlight(m)).toBe(false);
    expect(missionMatchesGroup(m, 'founder', s)).toBe(false);
  });
});

describe('SIMULATION ≠ LIVE', () => {
  it('demo (including stress mode) is always shown as simulated', () => {
    const s = buildStressSnapshot(NOW);
    expect(displayMode(s.provenance, 'connected')).toBe('demo');
    expect(selectSituation(s, 'connected', NOW).data.display).toBe('demo');
  });
});

describe('UI BUTTON VISIBILITY ≠ SERVER AUTHORIZATION', () => {
  it('a server that refuses (403) wins even though the UI offered the button', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    backend.failures.decide = 'http403';
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: FOUNDER,
      }),
    ).rejects.toThrow(/not delivered.*403/);
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });
});

describe('CLIENT DECISION ≠ CONFIRMED DECISION', () => {
  it('demo decisions are simulated, never "delivered"', async () => {
    const a = testAdapter();
    await a.connect();
    const rec = await a.submitApprovalDecision({
      approvalId: 'APR-031',
      decision: 'APPROVE',
      decidedBy: FOUNDER,
    });
    expect(rec.delivery).toBe('simulated');
  });

  it('a REST backend echoing a different decision is not a confirmation', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    backend.decisionResponse = (b) => ({
      record: { ...b, decision: 'HOLD', decidedAt: '2026-09-30T12:01:00Z' },
    });
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: FOUNDER,
      }),
    ).rejects.toThrow(/not confirmed/);
  });
});

describe('NO ALTERNATE APPROVAL PATH (static guard)', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory()
        ? files(p)
        : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)
          ? [p]
          : [];
    });
  const src = files(join(process.cwd(), 'src')).filter(
    (f) => !f.includes(`${join('src', 'test')}`),
  );

  it("only the adapters' decision paths create approval.decided events", () => {
    const creators = src.filter((f) => /kind:\s*'approval\.decided'/.test(readFileSync(f, 'utf8')));
    // DemoAdapter: the human decision path. seed.ts: static seed HISTORY (APR-030, marked
    // simulated, decided by the Founder). The simulation script must never appear here.
    expect(creators.map((f) => f.split('/src/')[1]).sort()).toEqual([
      'adapters/demo/DemoAdapter.ts',
      'adapters/demo/seed.ts',
    ]);
  });

  it('decisions are submitted only through the dashboard provider', () => {
    const callers = src.filter((f) => /\.submitApprovalDecision\(/.test(readFileSync(f, 'utf8')));
    expect(callers.map((f) => f.split('/src/')[1]).sort()).toEqual(['store/DashboardProvider.tsx']);
  });

  it('no source file grants authority to a worker', () => {
    const granting = src.filter((f) => /authority:\s*\[\s*\{/.test(readFileSync(f, 'utf8')));
    expect(granting).toEqual([]);
  });
});
