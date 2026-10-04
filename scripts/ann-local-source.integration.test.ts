/**
 * Real-host integration: temporary snapshot fixture → the PRESERVED
 * ann-snapshot-host (unchanged) → real 127.0.0.1 HTTP → LocalSnapshotSource →
 * normalizeAnnFeed → AnnAdapter.
 *
 * Fixture files are written by this harness only, in a private temp
 * directory; neither the host nor the browser source writes anything.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AnnAdapter } from '../src/adapters/ann/AnnAdapter.ts';
import {
  AnnLocalSourceError,
  LocalSnapshotSource,
  type AnnLocalFetch,
} from '../src/adapters/ann/localSnapshotSource.ts';
import { annMockFeed } from '../src/adapters/ann/mockFeed.ts';
import { createAnnSnapshotHost } from './ann-snapshot-host.ts';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const AUTH = 'Founder #0007';
const DASHBOARD_ORIGIN = 'http://localhost:4178';

type R = Record<string, unknown>;
type Feed = R & { missions: R[]; approvals: R[]; health?: R };
const simFeed = (): Feed => structuredClone(annMockFeed('normal', NOW, AUTH)) as unknown as Feed;
const liveFeed = (): Feed => ({
  ...simFeed(),
  sourceMode: 'LIVE',
  source: { id: 'ann-runtime-01', name: 'ANN runtime', kind: 'ann-runtime' },
});

let dir: string;
const running: { close(): Promise<void> }[] = [];
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

function fixture(name: string, body: string | Buffer): string {
  const p = join(dir, name);
  writeFileSync(p, body); // test harness only
  return p;
}
async function host(snapshotPath: string, maxBytes?: number): Promise<string> {
  const h = createAnnSnapshotHost({
    snapshotPath,
    port: 0,
    allowedOrigins: [DASHBOARD_ORIGIN],
    ...(maxBytes ? { maxBytes } : {}),
  });
  running.push(h);
  const port = await h.listen();
  return `http://127.0.0.1:${port}/ann/snapshot`;
}
const adapterFor = (endpoint: string, fetchImpl?: AnnLocalFetch) =>
  new AnnAdapter(new LocalSnapshotSource(endpoint, fetchImpl ? { fetch: fetchImpl } : {}), {
    humanAuthority: AUTH,
    now: () => NOW,
  });
/** As a browser on another origin would send it (Node's fetch sends no Origin itself). */
const withOrigin =
  (origin: string): AnnLocalFetch =>
  (url, init) =>
    fetch(url, { ...init, headers: { origin } });
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return e instanceof AnnLocalSourceError ? e.code : String((e as Error).message);
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ann-local-int-'));
});
afterEach(async () => {
  await Promise.all(running.splice(0).map((h) => h.close()));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true }); // harness cleanup only
});

describe('real host → LocalSnapshotSource → normalizeAnnFeed → AnnAdapter', () => {
  it('a valid feed reaches the normalized dashboard domain; the fixture is never mutated', async () => {
    const p = fixture('valid.json', JSON.stringify(simFeed()));
    const before = sha(p);
    const a = adapterFor(await host(p));
    const s = await a.connect();
    expect(s.missions.map((m) => m.id)).toContain('ann-msn-7f3a');
    expect(s.missions.find((m) => m.id === 'ann-msn-7f3a')!.ordinal).toBe(142);
    expect(a.trust()).toEqual({
      sourceMode: 'SIMULATED',
      transport: 'LOCAL_FILE_UNVERIFIED',
      snapshotAuthenticity: 'NOT_ESTABLISHED',
      decisionAuthenticity: 'NOT_ESTABLISHED',
    });
    expect(sha(p)).toBe(before);
  });

  it('the allowed dashboard Origin is served (CORS echo exact)', async () => {
    const p = fixture('origin-ok.json', JSON.stringify(simFeed()));
    const a = adapterFor(await host(p), withOrigin(DASHBOARD_ORIGIN));
    await expect(a.connect()).resolves.toBeTruthy();
  });

  it('an Origin mismatch (host 403) is a bounded source failure, never data', async () => {
    const p = fixture('origin-bad.json', JSON.stringify(simFeed()));
    const ep = await host(p);
    expect(
      await code(
        new LocalSnapshotSource(ep, { fetch: withOrigin('http://attacker.example') }).load(),
      ),
    ).toBe('LOCAL_SOURCE_HTTP_ERROR');
    const a = adapterFor(ep, withOrigin('http://attacker.example'));
    await expect(a.connect()).rejects.toThrow(/SOURCE_UNAVAILABLE.*LOCAL_SOURCE_HTTP_ERROR/);
    expect(a.provenance()).toMatchObject({ mode: 'disconnected', verifiedBackend: false });
  });

  it('malformed JSON (host serves it byte-exact, 200) fails in the browser source', async () => {
    const p = fixture('malformed.json', '{"contract": "assembly-nexus.dashboard-feed.v1",');
    expect(await code(new LocalSnapshotSource(await host(p)).load())).toBe(
      'LOCAL_SOURCE_PARSE_FAILED',
    );
  });

  it('non-UTF-8 and BOM-prefixed files fail closed', async () => {
    const bad = fixture('latin1.json', Buffer.from([0x22, 0xe9, 0x22]));
    expect(await code(new LocalSnapshotSource(await host(bad)).load())).toBe(
      'LOCAL_SOURCE_DECODE_FAILED',
    );
    const bom = fixture(
      'bom.json',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')]),
    );
    expect(await code(new LocalSnapshotSource(await host(bom)).load())).toBe(
      'LOCAL_SOURCE_DECODE_FAILED',
    );
  });

  it('oversize: refused by the host (503) and by the browser bound independently', async () => {
    const p = fixture('big.json', `"${'a'.repeat(2048)}"`);
    expect(await code(new LocalSnapshotSource(await host(p, 1024)).load())).toBe(
      'LOCAL_SOURCE_HTTP_ERROR',
    );
    // Host allows it; the browser's own (lower, test-only) bound still refuses it.
    const ep = await host(p);
    expect(await code(new LocalSnapshotSource(ep, { maxBytes: 1024 }).load())).toBe(
      'LOCAL_SOURCE_TOO_LARGE',
    );
  });

  it('host unavailable (stopped) is an error, never an empty healthy dashboard', async () => {
    const p = fixture('gone.json', JSON.stringify(simFeed()));
    const ep = await host(p);
    await running.pop()!.close();
    const a = adapterFor(ep);
    await expect(a.connect()).rejects.toThrow(/SOURCE_UNAVAILABLE.*LOCAL_SOURCE_UNAVAILABLE/);
    expect(a.provenance()).toMatchObject({ mode: 'disconnected', verifiedBackend: false });
  });

  it('missing snapshot file (host 503) is an error, not empty', async () => {
    const a = adapterFor(await host(join(dir, 'never-written.json')));
    await expect(a.connect()).rejects.toThrow(/LOCAL_SOURCE_HTTP_ERROR/);
  });

  it('LIVE over the real transport remains unverified; the Founder decision source-asserted', async () => {
    const a = adapterFor(await host(fixture('live.json', JSON.stringify(liveFeed()))));
    const s = await a.connect();
    expect(a.trust()).toMatchObject({
      sourceMode: 'LIVE',
      transport: 'LOCAL_FILE_UNVERIFIED',
      snapshotAuthenticity: 'NOT_ESTABLISHED',
      decisionAuthenticity: 'NOT_ESTABLISHED',
    });
    expect(s.provenance).toMatchObject({ mode: 'live', verifiedBackend: false });
    const d = s.approvals.find((x) => x.id === 'ann-apr-030')!.decision!;
    expect(d).toMatchObject({ decidedBy: AUTH, assurance: 'source-asserted' });
  });

  it('health stays evidence-backed: missing health is UNKNOWN despite HTTP 200', async () => {
    const f = liveFeed();
    delete f.health;
    const s = await adapterFor(await host(fixture('nohealth.json', JSON.stringify(f)))).connect();
    expect(s.health.status).toBe('UNKNOWN');
  });

  it('certification stays independent: completion over the real transport is not certified', async () => {
    const s = await adapterFor(
      await host(fixture('cert.json', JSON.stringify(liveFeed()))),
    ).connect();
    const m = s.missions.find((x) => x.id === 'ann-msn-2b88')!;
    expect(m.status).toMatch(/COMPLETE/);
    expect(m.certification).not.toBe('CERTIFIED');
  });

  it('a refresh re-reads the file once (atomic producer replace is picked up); no polling', async () => {
    const p = fixture('refresh.json', JSON.stringify(simFeed()));
    const a = adapterFor(await host(p));
    await a.connect();
    const next = simFeed();
    next.missions = next.missions.slice(0, 1);
    writeFileSync(join(dir, 'refresh.tmp'), JSON.stringify(next));
    rmSync(p);
    writeFileSync(p, readFileSync(join(dir, 'refresh.tmp')));
    const s = await a.refresh();
    expect(s!.missions).toHaveLength(1);
  });
});
