import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAdapter } from '../createAdapter';
import { AnnAdapter } from './AnnAdapter';
import { AnnAdapterError, type AnnFeedSource } from './contract';
import { annMockFeed, MockAnnFeedSource } from './mockFeed';

/** ANN v1 adapter interface: read-only, transport-neutral, bounded errors. */

const NOW = Date.parse('2026-09-30T12:00:00Z');
const AUTH = 'Founder #0007';
const adapter = (source: AnnFeedSource) =>
  new AnnAdapter(source, { humanAuthority: AUTH, now: () => NOW });
const fixed = (raw: unknown): AnnFeedSource => ({ load: () => Promise.resolve(raw) });

describe('AnnAdapter', () => {
  it('connect() returns the normalized snapshot and notifies subscribers', async () => {
    const a = adapter(new MockAnnFeedSource('normal', AUTH, () => NOW));
    const seen: string[] = [];
    a.subscribe((u) => seen.push(u.type));
    const s = await a.connect();
    expect(s.missions.length).toBe(5);
    expect(seen).toEqual(['snapshot']);
    expect(a.provenance()).toEqual(s.provenance);
  });

  it('before connecting it claims nothing (disconnected, unverified)', () => {
    expect(adapter(fixed({})).provenance()).toMatchObject({
      mode: 'disconnected',
      verifiedBackend: false,
    });
  });

  it('an unavailable source rejects with a bounded error, never an empty dashboard', async () => {
    const a = adapter({
      load: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.7:9999 secret')),
    });
    const err = await a.connect().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnnAdapterError);
    expect((err as AnnAdapterError).code).toBe('SOURCE_UNAVAILABLE');
    // The transport's own error text (addresses, secrets) never reaches the UI.
    expect((err as Error).message).not.toMatch(/10\.0\.0\.7|secret/);
  });

  it('an invalid feed rejects with its contract error code', async () => {
    const bad = { ...annMockFeed('normal', NOW, AUTH), contract: 'v0' };
    await expect(adapter(fixed(bad)).connect()).rejects.toMatchObject({
      code: 'UNSUPPORTED_CONTRACT',
    });
  });

  it('refresh() failure is reported as a connection error, keeping no fake state', async () => {
    let fail = false;
    const a = adapter({
      load: () =>
        fail ? Promise.reject(new Error('x')) : Promise.resolve(annMockFeed('normal', NOW, AUTH)),
    });
    await a.connect();
    const updates: unknown[] = [];
    a.subscribe((u) => updates.push(u));
    fail = true;
    expect(await a.refresh()).toBeNull();
    expect(updates).toEqual([expect.objectContaining({ type: 'connection', status: 'error' })]);
  });

  it('is read-only: no decisions, acknowledgements or messages', async () => {
    const a = adapter(new MockAnnFeedSource('normal', AUTH, () => NOW));
    await a.connect();
    expect(a.capabilities).toEqual({
      realtime: false,
      approvals: false,
      alertAcknowledgement: false,
      messaging: false,
      simulationControls: false,
    });
    await expect(
      a.submitApprovalDecision({ approvalId: 'ann-apr-031', decision: 'APPROVE', decidedBy: AUTH }),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });
    await expect(a.acknowledgeAlert('ann-alr-007', AUTH)).rejects.toMatchObject({
      code: 'READ_ONLY',
    });
    expect('sendWorkerMessage' in a).toBe(false);
  });

  it('the build config selects it with the deployment authority', async () => {
    const a = createAdapter({ kind: 'ann-mock', humanAuthority: AUTH });
    expect(a.id).toBe('ann');
    expect((await a.connect()).provenance.mode).toBe('demo');
  });

  it('is transport-neutral and passive: no network, timers or browser APIs in the module', () => {
    const dir = 'src/adapters/ann';
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      const code = readFileSync(`${dir}/${f}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(
        /\bfetch\(|WebSocket|EventSource|XMLHttpRequest|setInterval|setTimeout|localStorage|window\.|document\.|navigator\./,
      );
      expect(code, f).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
    }
  });
});
