import { describe, expect, it } from 'vitest';
import type { DashboardAdapter } from '@/adapters/types';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { WORKER_STATES } from '@/domain/types';

export interface ConformanceSubject {
  adapter: DashboardAdapter;
  /** Delivery value this adapter must report for decisions. */
  expectedDelivery: 'simulated' | 'delivered';
  /** Id of an approval that is PENDING in the subject's initial data. */
  pendingApprovalId: string;
  /** Id of an approval that is already decided. */
  decidedApprovalId: string;
  humanAuthority: string;
  /** Re-read state from the adapter after an action (for adapters that need a refresh). */
  settle?: () => Promise<void>;
}

/** Structural invariants every snapshot must satisfy, whatever the adapter. */
export function assertSnapshotInvariants(s: DashboardSnapshot): void {
  const unique = (xs: { id: string }[], what: string) =>
    expect(new Set(xs.map((x) => x.id)).size, `${what} ids unique`).toBe(xs.length);
  unique(s.workers, 'worker');
  unique(s.missions, 'mission');
  unique(s.approvals, 'approval');
  unique(s.alerts, 'alert');
  unique(s.events, 'event');
  for (const w of s.workers) {
    expect(WORKER_STATES).toContain(w.state);
    if (typeof w.progress === 'number') expect(w.progress >= 0 && w.progress <= 1).toBe(true);
    // Every authority grant carries provenance.
    for (const g of w.authority) {
      expect(g.grantedBy.trim()).not.toBe('');
      expect(Number.isNaN(Date.parse(g.grantedAt))).toBe(false);
    }
  }
  for (const a of s.approvals) {
    if (a.status === 'APPROVED' || a.status === 'DENIED') expect(a.decision).toBeDefined();
  }
  // Provenance truthfulness.
  if (s.provenance.mode === 'demo') expect(s.provenance.verifiedBackend).toBe(false);
  if (s.provenance.verifiedBackend) expect(s.provenance.mode).toBe('live');
  expect(Array.isArray(s.quality.issues)).toBe(true);
}

/**
 * Shared behavioural contract. Register every adapter here, including third-party
 * ones, by calling `describeAdapterConformance(name, makeSubject)` in a test file.
 */
export function describeAdapterConformance(
  name: string,
  make: () => ConformanceSubject | Promise<ConformanceSubject>,
): void {
  describe(`adapter conformance: ${name}`, () => {
    it('connect() resolves a snapshot that satisfies the invariants', async () => {
      const { adapter } = await make();
      const s = await adapter.connect();
      assertSnapshotInvariants(s);
      adapter.disconnect();
    });

    it('provenance() agrees with the snapshot and never claims an unverified LIVE', async () => {
      const { adapter } = await make();
      const s = await adapter.connect();
      const p = adapter.provenance();
      expect(p.adapterId).toBe(adapter.id);
      expect(p.verifiedBackend).toBe(s.provenance.verifiedBackend);
      if (p.mode !== 'live') expect(p.verifiedBackend).toBe(false);
      adapter.disconnect();
    });

    it('capability flags match the implemented surface', async () => {
      const { adapter } = await make();
      expect(typeof adapter.sendWorkerMessage === 'function').toBe(adapter.capabilities.messaging);
    });

    it('unsubscribe stops delivery, and disconnect is idempotent', async () => {
      const { adapter } = await make();
      let calls = 0;
      const off = adapter.subscribe(() => calls++);
      await adapter.connect();
      off();
      const before = calls;
      if ('step' in adapter && typeof adapter.step === 'function') (adapter.step as () => void)();
      if ('refresh' in adapter && typeof adapter.refresh === 'function')
        await (adapter.refresh as () => Promise<unknown>)();
      expect(calls).toBe(before);
      adapter.disconnect();
      expect(() => adapter.disconnect()).not.toThrow();
    });

    describe('governance', () => {
      it('rejects unknown approvals', async () => {
        const s = await make();
        await s.adapter.connect();
        await expect(
          s.adapter.submitApprovalDecision({
            approvalId: 'NOPE-404',
            decision: 'APPROVE',
            decidedBy: s.humanAuthority,
          }),
        ).rejects.toThrow();
      });

      it('rejects the wrong authority, workers, and the requester itself', async () => {
        const s = await make();
        const snap = await s.adapter.connect();
        const req = snap.approvals.find((a) => a.id === s.pendingApprovalId)!;
        const requester = snap.workers.find((w) => w.id === req.requestedBy)!;
        for (const decidedBy of [
          'Someone Else',
          '',
          requester.id,
          requester.name,
          snap.workers[0]!.id,
        ]) {
          await expect(
            s.adapter.submitApprovalDecision({
              approvalId: req.id,
              decision: 'APPROVE',
              decidedBy,
            }),
          ).rejects.toThrow();
        }
        await s.settle?.();
      });

      it('rejects re-deciding a closed request and invalid decisions', async () => {
        const s = await make();
        await s.adapter.connect();
        await expect(
          s.adapter.submitApprovalDecision({
            approvalId: s.decidedApprovalId,
            decision: 'DENY',
            decidedBy: s.humanAuthority,
          }),
        ).rejects.toThrow();
        await expect(
          s.adapter.submitApprovalDecision({
            approvalId: s.pendingApprovalId,
            decision: 'YOLO' as 'APPROVE',
            decidedBy: s.humanAuthority,
          }),
        ).rejects.toThrow();
      });

      it('records a valid human decision with honest delivery', async () => {
        const s = await make();
        await s.adapter.connect();
        const rec = await s.adapter.submitApprovalDecision({
          approvalId: s.pendingApprovalId,
          decision: 'HOLD',
          decidedBy: s.humanAuthority,
        });
        expect(rec.decision).toBe('HOLD');
        expect(rec.decidedBy).toBe(s.humanAuthority);
        expect(rec.delivery).toBe(s.expectedDelivery);
      });
    });
  });
}
