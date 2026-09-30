/**
 * Governance regression suite. Each block maps to a numbered requirement
 * from the Founder's hardening brief. Do not weaken these tests to get green.
 */
import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { OPENING_SCRIPT } from '@/adapters/demo/script';
import { testAdapter } from '@/test/fixtures';
import { restTestAdapter } from '@/test/adapters';
import { checkDecision, GovernanceError, assertHumanDecisionAllowed } from './governance';
import { displayMode } from './provenance';
import { applyEvent } from './reducer';
import type { ApprovalRequest } from './types';

const FOUNDER = 'Founder #0007';
const NOW = Date.parse('2026-09-30T12:00:00Z');
const seed = () => buildSeedSnapshot(NOW);
const pending = (): ApprovalRequest => seed().approvals.find((a) => a.id === 'APR-031')!;

describe('1. A worker capability never becomes Founder authority', () => {
  it('a worker whose capability is labelled with the authority still cannot decide', () => {
    const s = seed();
    const cyrus = s.workers.find((w) => w.id === 'w-cyrus')!;
    cyrus.capabilities.push(
      { id: 'approve', label: FOUNDER },
      { id: FOUNDER, label: 'approve all' },
    );
    expect(checkDecision(pending(), cyrus.id, s.workers).ok).toBe(false);
    expect(checkDecision(pending(), cyrus.name, s.workers).ok).toBe(false);
    expect(cyrus.authority).toHaveLength(0);
  });

  it('a worker NAMED like the human authority blocks decisions instead of passing', () => {
    const s = seed();
    s.workers[0] = { ...s.workers[0]!, name: FOUNDER };
    const r = checkDecision(pending(), FOUNDER, s.workers);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('worker-cannot-decide');
  });

  it('running the demo never grants any worker authority', async () => {
    const a = testAdapter();
    await a.connect();
    for (let i = 0; i < 120; i++) a.step();
    expect(a.getSnapshot().workers.every((w) => w.authority.length === 0)).toBe(true);
  });
});

describe('2. A worker cannot approve its own approval request', () => {
  it('the requester is refused by id and by name', () => {
    const s = seed();
    const req = pending();
    expect(checkDecision(req, req.requestedBy, s.workers).code).toBe('worker-cannot-decide');
    expect(checkDecision(req, 'Cyrus Anvil', s.workers).code).toBe('worker-cannot-decide');
    expect(checkDecision(req, '  cyrus anvil ', s.workers).code).toBe('worker-cannot-decide');
  });

  it('even when a malformed request names the requester as the authority', () => {
    const s = seed();
    const req = { ...pending(), requiredAuthority: 'w-cyrus' };
    expect(checkDecision(req, 'w-cyrus', s.workers).ok).toBe(false);
    const req2 = { ...pending(), requiredAuthority: 'Cyrus Anvil' };
    expect(checkDecision(req2, 'Cyrus Anvil', s.workers).ok).toBe(false);
  });
});

describe('3. Demo automation cannot silently grant Founder approval', () => {
  it('no approval is decided by the script, however long it runs', async () => {
    const a = testAdapter();
    await a.connect();
    for (let i = 0; i < OPENING_SCRIPT.length + 150; i++) a.step();
    const s = a.getSnapshot();
    const decidedBySim = s.events.filter(
      (e) => e.kind === 'approval.decided' && !e.id.startsWith('seed-'),
    );
    expect(decidedBySim).toHaveLength(0);
    expect(s.approvals.filter((x) => x.status === 'PENDING').map((x) => x.id)).toEqual(
      expect.arrayContaining(['APR-031', 'APR-032']),
    );
  });
});

describe('4. Unknown/malformed authority data fails safe', () => {
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['non-string', 42 as unknown as string],
    ['undefined', undefined as unknown as string],
  ])('%s requiredAuthority blocks decisions', (_, requiredAuthority) => {
    const r = checkDecision({ ...pending(), requiredAuthority }, FOUNDER, seed().workers);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing-authority');
  });

  it('unknown status and invalid decisions are refused', () => {
    expect(checkDecision({ ...pending(), status: 'UNKNOWN' }, FOUNDER, []).code).toBe('not-open');
    expect(checkDecision(pending(), FOUNDER, [], 'MAYBE').code).toBe('invalid-decision');
  });

  it('assertHumanDecisionAllowed throws a typed GovernanceError', () => {
    expect(() =>
      assertHumanDecisionAllowed(seed(), {
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: '',
      }),
    ).toThrow(GovernanceError);
  });

  it('matching is exact apart from case and outer whitespace', () => {
    expect(checkDecision(pending(), 'founder #0007', []).ok).toBe(true);
    expect(checkDecision(pending(), 'Founder #007', []).ok).toBe(false);
    expect(checkDecision(pending(), '007', []).ok).toBe(false);
  });
});

describe('5. UI display state cannot itself grant backend authority', () => {
  it('a REST decision only counts when the backend confirms it; local state is untouched otherwise', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    backend.decisionResponse = () => ({ record: { decision: 'APPROVE', decidedBy: FOUNDER } }); // missing decidedAt
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: FOUNDER,
      }),
    ).rejects.toThrow(/not confirmed/);
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });

  it('an APPROVED status sent by a backend without a decision record is not trusted', async () => {
    const { adapter, backend } = restTestAdapter();
    const approvals = (backend.data.approvals as { approvals: Record<string, unknown>[] })
      .approvals;
    approvals.find((a) => a.id === 'APR-031')!.status = 'APPROVED';
    const s = await adapter.connect();
    expect(s.approvals.find((a) => a.id === 'APR-031')!.status).toBe('UNKNOWN');
  });
});

describe('6. HOLD does not equal APPROVE', () => {
  it('HOLD leaves the request open, the mission gated and the worker blocked', async () => {
    const a = testAdapter();
    await a.connect();
    await a.submitApprovalDecision({ approvalId: 'APR-031', decision: 'HOLD', decidedBy: FOUNDER });
    for (let i = 0; i < 3; i++) a.step();
    const s = a.getSnapshot();
    expect(s.approvals.find((x) => x.id === 'APR-031')!.status).toBe('HELD');
    expect(s.missions.find((m) => m.id === 'AN-0144')!.status).toBe('WAITING_APPROVAL');
    const cyrus = s.workers.find((w) => w.id === 'w-cyrus')!;
    expect(cyrus.state).not.toBe('WORKING');
    expect(cyrus.blockers.some((b) => b.dependsOn?.id === 'APR-031')).toBe(true);
    // Still decidable afterwards.
    expect(
      checkDecision(
        s.approvals.find((x) => x.id === 'APR-031'),
        FOUNDER,
        s.workers,
      ).ok,
    ).toBe(true);
  });
});

describe('7. DENY remains distinct from HOLD', () => {
  it('DENY closes the request and blocks the mission; it cannot be re-decided', async () => {
    const a = testAdapter();
    await a.connect();
    await a.submitApprovalDecision({
      approvalId: 'APR-031',
      decision: 'DENY',
      decidedBy: FOUNDER,
      note: 'no',
    });
    const s = a.getSnapshot();
    const req = s.approvals.find((x) => x.id === 'APR-031')!;
    expect(req.status).toBe('DENIED');
    expect(s.missions.find((m) => m.id === 'AN-0144')!.status).toBe('BLOCKED');
    expect(checkDecision(req, FOUNDER, s.workers).code).toBe('not-open');
    await expect(
      a.submitApprovalDecision({ approvalId: 'APR-031', decision: 'APPROVE', decidedBy: FOUNDER }),
    ).rejects.toThrow(/already DENIED/);
  });

  it('reducer maps each decision to a distinct status', () => {
    const at = new Date(NOW).toISOString();
    const statuses = (['APPROVE', 'DENY', 'HOLD'] as const).map(
      (decision) =>
        applyEvent(seed(), {
          id: `d-${decision}`,
          kind: 'approval.decided',
          at,
          payload: {
            approvalId: 'APR-031',
            record: { decision, decidedBy: FOUNDER, decidedAt: at, delivery: 'simulated' },
          },
        }).approvals.find((x) => x.id === 'APR-031')!.status,
    );
    expect(statuses).toEqual(['APPROVED', 'DENIED', 'HELD']);
  });
});

describe('8. Simulated messages/results remain marked simulated', () => {
  it('every demo decision and outgoing message is marked simulated', async () => {
    const a = testAdapter();
    await a.connect();
    const rec = await a.submitApprovalDecision({
      approvalId: 'APR-031',
      decision: 'APPROVE',
      decidedBy: FOUNDER,
    });
    const msg = await a.sendWorkerMessage('w-ada', 'hi', FOUNDER);
    expect(rec.delivery).toBe('simulated');
    expect(msg.delivery).toBe('simulated');
    expect(
      a.getSnapshot().approvals.every((x) => !x.decision || x.decision.delivery === 'simulated'),
    ).toBe(true);
    expect(a.getSnapshot().messages.every((m) => m.delivery === 'simulated')).toBe(true);
  });
});

describe('9. LIVE cannot be displayed merely because demo data is moving', () => {
  it('demo provenance always displays as DEMO, even if it claims live', () => {
    const base = { adapterId: 'demo', adapterLabel: 'x', verifiedBackend: true } as const;
    expect(displayMode({ ...base, mode: 'live' }, 'connected')).toBe('demo');
    expect(displayMode({ ...base, mode: 'demo' }, 'connected')).toBe('demo');
  });

  it('live requires verification AND a connected transport', () => {
    const p = { adapterId: 'rest', adapterLabel: 'x', mode: 'live' } as const;
    expect(displayMode({ ...p, verifiedBackend: false }, 'connected')).toBe('disconnected');
    expect(displayMode({ ...p, verifiedBackend: true }, 'reconnecting')).toBe('disconnected');
    expect(displayMode({ ...p, verifiedBackend: true }, 'connected')).toBe('live');
  });

  it('a stepping demo adapter never reports a verified backend', async () => {
    const a = testAdapter();
    await a.connect();
    for (let i = 0; i < 40; i++) {
      a.step();
      expect(a.getSnapshot().provenance.verifiedBackend).toBe(false);
      expect(a.provenance().mode).toBe('demo');
    }
  });
});

describe('10. Critical alerts do not automatically authorize corrective actions', () => {
  it('raising, acknowledging and resolving a critical alert changes no approval or authority', async () => {
    const a = testAdapter();
    await a.connect();
    const before = a.getSnapshot().approvals.map((x) => [x.id, x.status]);
    for (let i = 0; i < OPENING_SCRIPT.length; i++) {
      a.step();
      const crit = a
        .getSnapshot()
        .alerts.find((x) => x.severity === 'CRITICAL' && !x.acknowledgedAt && !x.resolvedAt);
      if (crit) await a.acknowledgeAlert(crit.id, FOUNDER);
    }
    const s = a.getSnapshot();
    expect(s.alerts.some((x) => x.severity === 'CRITICAL')).toBe(true);
    const after = new Map(s.approvals.map((x) => [x.id, x.status]));
    for (const [id, status] of before) expect(after.get(id as string)).toBe(status);
    expect(s.workers.every((w) => w.authority.length === 0)).toBe(true);
  });
});
