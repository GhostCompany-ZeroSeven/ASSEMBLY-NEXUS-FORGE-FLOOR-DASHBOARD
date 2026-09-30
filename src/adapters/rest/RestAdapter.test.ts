import { describe, expect, it } from 'vitest';
import { restTestAdapter } from '@/test/adapters';
import { BASE, createFakeBackend } from '@/test/fakeBackend';
import { isStale } from '@/domain/selectors';
import type { DashboardAdapter } from '../types';
import { RestAdapter } from './RestAdapter';

describe('RestAdapter — healthy backend', () => {
  it('loads and normalizes every resource and verifies LIVE', async () => {
    const { adapter } = restTestAdapter();
    const s = await adapter.connect();
    expect(s.workers).toHaveLength(10);
    expect(s.missions.length).toBeGreaterThan(5);
    expect(s.approvals.find((a) => a.id === 'APR-031')?.status).toBe('PENDING');
    expect(s.events.length).toBeGreaterThan(0);
    expect(s.provenance).toMatchObject({
      mode: 'live',
      verifiedBackend: true,
      adapterId: 'rest',
      environment: 'test',
    });
    expect(s.quality.partial).toBe(false);
    expect(s.quality.lastSuccessfulSyncAt).toBeDefined();
  });

  it('sends no credentials and no auth headers', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    for (const r of backend.requests) {
      expect(r.credentials).toBe('omit');
      expect(JSON.stringify(r.headers ?? {})).not.toMatch(/authorization|cookie|token/i);
    }
  });

  it('prefixes the configured base URL', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    expect(backend.requests.every((r) => r.url.startsWith(BASE + '/'))).toBe(true);
  });
});

describe('RestAdapter — failure states', () => {
  it('backend unavailable: DISCONNECTED, error status, no fake data', async () => {
    const backend = createFakeBackend();
    for (const k of ['health', 'workers', 'missions', 'approvals', 'alerts', 'events'] as const)
      backend.failures[k] = 'down';
    const { adapter } = restTestAdapter(backend);
    const statuses: string[] = [];
    adapter.subscribe((u) => u.type === 'connection' && statuses.push(u.status));
    const s = await adapter.connect();
    expect(s.provenance.mode).toBe('disconnected');
    expect(s.provenance.verifiedBackend).toBe(false);
    expect(s.workers).toHaveLength(0);
    expect(s.health.status).toBe('UNKNOWN');
    expect(s.quality.partial).toBe(true);
    expect(s.quality.issues.some((i) => /unavailable/i.test(i.message))).toBe(true);
    expect(statuses).toContain('error');
  });

  it('request timeout is reported as a timeout', async () => {
    const backend = createFakeBackend();
    backend.failures.health = 'timeout';
    const { adapter } = restTestAdapter(backend);
    const s = await adapter.connect();
    expect(s.quality.issues.find((i) => i.source === 'health')?.message).toMatch(/timed out/i);
    expect(s.provenance.verifiedBackend).toBe(false);
  });

  it('malformed payloads are reported, not treated as empty-and-healthy', async () => {
    const backend = createFakeBackend();
    backend.failures.workers = { payload: { unexpected: true } };
    backend.failures.missions = 'not-json';
    const { adapter } = restTestAdapter(backend);
    const s = await adapter.connect();
    expect(s.quality.partial).toBe(true);
    expect(
      s.quality.issues.some((i) => i.source === 'workers' && /Malformed/.test(i.message)),
    ).toBe(true);
    expect(
      s.quality.issues.some((i) => i.source === 'missions' && /not valid JSON/.test(i.message)),
    ).toBe(true);
    expect(s.quality.lastSuccessfulSyncAt).toBeUndefined();
  });

  it('partial data keeps last-good resources and marks the snapshot partial', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    backend.failures.missions = 'http500';
    await adapter.refresh();
    const s = adapter.getSnapshot();
    expect(s.missions.length).toBeGreaterThan(5); // last good kept
    expect(s.quality.partial).toBe(true);
    expect(
      s.quality.issues.some((i) => i.source === 'missions' && /HTTP 500/.test(i.message)),
    ).toBe(true);
    expect(s.provenance.verifiedBackend).toBe(true); // health still fine
  });

  it('stale data is detectable when syncs stop succeeding', async () => {
    const { adapter, backend, clock } = restTestAdapter();
    await adapter.connect();
    expect(isStale(adapter.getSnapshot(), clock.now)).toBe(false);
    backend.failures.workers = 'down';
    clock.now += 60_000;
    await adapter.refresh();
    const s = adapter.getSnapshot();
    expect(isStale(s, clock.now)).toBe(true);
  });

  it('reconnecting: loses LIVE when health fails after a good sync, then recovers', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    const statuses: string[] = [];
    adapter.subscribe((u) => u.type === 'connection' && statuses.push(u.status));
    for (const k of ['health', 'workers', 'missions', 'approvals'] as const)
      backend.failures[k] = 'down';
    await adapter.refresh();
    expect(adapter.getSnapshot().provenance.verifiedBackend).toBe(false);
    expect(adapter.getSnapshot().health.status).toBe('UNKNOWN');
    expect(statuses).toContain('reconnecting');
    backend.failures = {};
    await adapter.refresh();
    expect(adapter.getSnapshot().provenance.verifiedBackend).toBe(true);
    expect(statuses.at(-1)).toBe('connected');
  });

  it('empty mission queue and zero workers are valid, not errors', async () => {
    const backend = createFakeBackend();
    backend.data.workers = { workers: [] };
    backend.data.missions = { missions: [] };
    const { adapter } = restTestAdapter(backend);
    const s = await adapter.connect();
    expect(s.workers).toEqual([]);
    expect(s.missions).toEqual([]);
    expect(s.quality.partial).toBe(false);
  });

  it('duplicate ids are dropped and reported', async () => {
    const backend = createFakeBackend();
    const w = (backend.data.workers as { workers: unknown[] }).workers;
    w.push(w[0]);
    const { adapter } = restTestAdapter(backend);
    const s = await adapter.connect();
    expect(s.workers).toHaveLength(10);
    expect(s.quality.issues.some((i) => /duplicate/.test(i.message))).toBe(true);
  });

  it('constructor rejects invalid configuration', () => {
    expect(() => new RestAdapter({ baseUrl: 'javascript:alert(1)' })).toThrow();
  });
});

describe('RestAdapter — unsupported capabilities', () => {
  it('without decide/acknowledge endpoints, capabilities are off and calls refuse', async () => {
    const backend = createFakeBackend();
    const adapter = new RestAdapter(
      { baseUrl: BASE },
      { fetch: backend.fetch, createTransport: () => ({ start() {}, stop() {} }) },
    );
    await adapter.connect();
    expect(adapter.capabilities.approvals).toBe(false);
    expect(adapter.capabilities.alertAcknowledgement).toBe(false);
    expect(adapter.capabilities.messaging).toBe(false);
    expect((adapter as DashboardAdapter).sendWorkerMessage).toBeUndefined();
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: 'Founder #0007',
      }),
    ).rejects.toThrow(/does not accept/);
    await expect(adapter.acknowledgeAlert('ALR-007', 'Founder #0007')).rejects.toThrow(
      /does not support/,
    );
  });
});

describe('RestAdapter — decisions', () => {
  it('delivers a human decision and reports it as delivered only after backend confirmation', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    const rec = await adapter.submitApprovalDecision({
      approvalId: 'APR-031',
      decision: 'HOLD',
      decidedBy: 'Founder #0007',
      note: 'later',
    });
    expect(rec).toMatchObject({ decision: 'HOLD', delivery: 'delivered' });
    expect(backend.decisions[0]).toMatchObject({
      id: 'APR-031',
      body: { decision: 'HOLD', note: 'later' },
    });
  });

  it('does not change local state when the backend fails or does not confirm', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    backend.failures.decide = 'http500';
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: 'Founder #0007',
      }),
    ).rejects.toThrow(/not delivered/);
    backend.failures = {};
    backend.decisionResponse = () => ({ ok: true });
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: 'Founder #0007',
      }),
    ).rejects.toThrow(/not confirmed/);
    backend.decisionResponse = (b) => ({
      record: { ...b, decision: 'DENY', decidedAt: '2026-09-30T12:05:00Z' },
    });
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: 'Founder #0007',
      }),
    ).rejects.toThrow(/not confirmed/);
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')?.status).toBe('PENDING');
  });

  it('refuses before sending when governance rules fail', async () => {
    const { adapter, backend } = restTestAdapter();
    await adapter.connect();
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: 'Cyrus Anvil',
      }),
    ).rejects.toThrow(/Workers cannot decide/);
    expect(backend.decisions).toHaveLength(0);
  });
});

describe('RestAdapter — lifecycle', () => {
  it('stops notifying after disconnect', async () => {
    const { adapter } = restTestAdapter();
    let n = 0;
    adapter.subscribe(() => n++);
    await adapter.connect();
    const before = n;
    adapter.disconnect();
    await adapter.refresh();
    expect(n).toBe(before);
  });
});
