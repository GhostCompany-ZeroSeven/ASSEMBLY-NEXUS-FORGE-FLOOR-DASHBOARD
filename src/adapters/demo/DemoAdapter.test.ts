import { describe, expect, it, vi } from 'vitest';
import { testAdapter } from '@/test/fixtures';
import { DemoAdapter } from './DemoAdapter';
import { OPENING_SCRIPT } from './script';

describe('DemoAdapter', () => {
  it('is honest about provenance', async () => {
    const a = testAdapter();
    const snap = await a.connect();
    expect(snap.provenance.mode).toBe('demo');
    expect(snap.provenance.verifiedBackend).toBe(false);
  });

  it('is deterministic for a given seed', async () => {
    const run = async () => {
      const a = testAdapter();
      await a.connect();
      for (let i = 0; i < OPENING_SCRIPT.length + 20; i++) a.step();
      const s = a.getSnapshot();
      return s.events.map((e) => `${e.kind}:${e.missionId ?? ''}:${e.workerId ?? ''}`);
    };
    expect(await run()).toEqual(await run());
  });

  it('never decides approvals on its own', async () => {
    const a = testAdapter();
    await a.connect();
    for (let i = 0; i < 80; i++) a.step();
    const s = a.getSnapshot();
    for (const id of ['APR-031', 'APR-032']) {
      expect(s.approvals.find((x) => x.id === id)?.status).toBe('PENDING');
    }
    expect(
      s.events.filter((e) => e.kind === 'approval.decided').every((e) => e.id.startsWith('seed-')),
    ).toBe(true);
  });

  it('records human decisions as simulated and reacts to them', async () => {
    const a = testAdapter();
    await a.connect();
    const record = await a.submitApprovalDecision({
      approvalId: 'APR-031',
      decision: 'APPROVE',
      decidedBy: 'Founder #0007',
    });
    expect(record.delivery).toBe('simulated');
    a.step();
    const cyrus = a.getSnapshot().workers.find((w) => w.id === 'w-cyrus')!;
    expect(cyrus.state).toBe('WORKING');
    expect(cyrus.blockers).toHaveLength(0);
  });

  it('rejects decisions from anyone but the required authority', async () => {
    const a = testAdapter();
    await a.connect();
    await expect(
      a.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: 'w-cyrus',
      }),
    ).rejects.toThrow(/Workers cannot decide/);
  });

  it('rejects deciding an already-decided request', async () => {
    const a = testAdapter();
    await a.connect();
    await expect(
      a.submitApprovalDecision({
        approvalId: 'APR-030',
        decision: 'DENY',
        decidedBy: 'Founder #0007',
      }),
    ).rejects.toThrow(/already APPROVED/);
  });

  it('raises and later resolves the scripted critical alert', async () => {
    const a = testAdapter();
    await a.connect();
    let sawCritical = false;
    for (let i = 0; i < OPENING_SCRIPT.length; i++) {
      a.step();
      if (a.getSnapshot().alerts.some((x) => x.severity === 'CRITICAL' && !x.resolvedAt))
        sawCritical = true;
    }
    expect(sawCritical).toBe(true);
    expect(a.getSnapshot().alerts.find((x) => x.id === 'ALR-009')?.resolvedAt).toBeDefined();
  });

  it('marks outgoing messages as simulated and generates no reply', async () => {
    const a = testAdapter();
    await a.connect();
    const before = a.getSnapshot().messages.length;
    const msg = await a.sendWorkerMessage('w-ada', 'status?', 'Founder #0007');
    expect(msg.delivery).toBe('simulated');
    expect(a.getSnapshot().messages).toHaveLength(before + 1);
  });

  it('acknowledges alerts', async () => {
    const a = testAdapter();
    await a.connect();
    await a.acknowledgeAlert('ALR-007', 'Founder #0007');
    expect(a.getSnapshot().alerts.find((x) => x.id === 'ALR-007')?.acknowledgedAt).toBeDefined();
  });

  it('notifies subscribers and stops timers on disconnect', async () => {
    const set = vi.fn(() => 42);
    const clear = vi.fn();
    const a = new DemoAdapter({ tickMs: 1000, setInterval: set, clearInterval: clear });
    const listener = vi.fn();
    a.subscribe(listener);
    await a.connect();
    expect(set).toHaveBeenCalledWith(expect.any(Function), 1000);
    a.step();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));
    a.disconnect();
    expect(clear).toHaveBeenCalledWith(42);
  });

  it('keeps generating routine missions after the opening script', async () => {
    const a = testAdapter();
    await a.connect();
    const initial = a.getSnapshot().missions.length;
    for (let i = 0; i < OPENING_SCRIPT.length + 30; i++) a.step();
    expect(a.getSnapshot().missions.length).toBeGreaterThan(initial + 1);
  });
});
