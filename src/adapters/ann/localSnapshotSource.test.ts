import { describe, expect, it } from 'vitest';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { withEnvOverrides } from '@/config/runtime';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { createAdapter } from '../createAdapter';
import { loadAdapter } from '../loadAdapter';
import { AnnAdapter } from './AnnAdapter';
import { annMockFeed } from './mockFeed';
import {
  ANN_LOCAL_MAX_BYTES,
  ANN_LOCAL_REQUEST,
  AnnLocalSourceError,
  LocalSnapshotSource,
  validateAnnLocalEndpoint,
  type AnnLocalFetch,
} from './localSnapshotSource';

/**
 * LocalSnapshotSource: the one ANN transport with network capability. Every
 * request here goes to an injected fake fetch (no network). The real host is
 * exercised in scripts/ann-local-source.integration.test.ts and the browser
 * suite e2e/annLocal.spec.ts.
 */

const NOW = Date.parse('2026-09-30T12:00:00Z');
const AUTH = 'Founder #0007';
const EP = 'http://127.0.0.1:4390/ann/snapshot';
const JSON_CT = 'application/json; charset=utf-8';

type R = Record<string, unknown>;
type Feed = R & { missions: R[]; workers: R[]; approvals: R[]; alerts: R[]; health?: R };
const simFeed = (): Feed => structuredClone(annMockFeed('normal', NOW, AUTH)) as unknown as Feed;
/** The same feed, declared LIVE by a (claimed) ANN runtime. A claim, not proof. */
const liveFeed = (): Feed => ({
  ...simFeed(),
  sourceMode: 'LIVE',
  source: { id: 'ann-runtime-01', name: 'ANN runtime', kind: 'ann-runtime' },
});

interface Call {
  url: string;
  init: RequestInit;
}
function fake(make: () => Response | Promise<Response>): { fetch: AnnLocalFetch; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(make());
    },
  };
}
const json = (body: BodyInit | null, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { 'content-type': JSON_CT, ...headers } });
const bytes = (s: string) => new TextEncoder().encode(s);

/** A body delivered in chunks, without Content-Length (chunked transfer). */
function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++]!);
      else c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': JSON_CT, ...headers } });
}

async function failCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    expect(e).toBeInstanceOf(AnnLocalSourceError);
    // Bounded: never the URL, the body or a platform message.
    expect((e as Error).message).not.toMatch(/127\.0\.0\.1|ann\/snapshot|stack|TypeError/);
    return (e as AnnLocalSourceError).code;
  }
}
const loadWith = (res: () => Response | Promise<Response>, maxBytes?: number) =>
  new LocalSnapshotSource(EP, { fetch: fake(res).fetch, maxBytes }).load();

/** Raw feed → real source (fake fetch) → AnnAdapter → normalized snapshot. */
async function through(raw: unknown): Promise<{ s: DashboardSnapshot; adapter: AnnAdapter }> {
  const src = new LocalSnapshotSource(EP, {
    fetch: fake(() => json(JSON.stringify(raw))).fetch,
  });
  const adapter = new AnnAdapter(src, { humanAuthority: AUTH, now: () => NOW });
  return { s: await adapter.connect(), adapter };
}

describe('URL validation (fail closed unless exactly http://127.0.0.1:<port>/ann/snapshot)', () => {
  it('1. a valid 127.0.0.1 endpoint is accepted unchanged', () => {
    expect(validateAnnLocalEndpoint(EP)).toBe(EP);
    expect(validateAnnLocalEndpoint('http://127.0.0.1:1024/ann/snapshot')).toBeTruthy();
    expect(validateAnnLocalEndpoint('http://127.0.0.1:65535/ann/snapshot')).toBeTruthy();
  });

  it.each<[string, string]>([
    ['2. localhost', 'http://localhost:4390/ann/snapshot'],
    ['3. ::1', 'http://[::1]:4390/ann/snapshot'],
    ['3b. ::1 unbracketed', 'http://::1:4390/ann/snapshot'],
    ['4. 0.0.0.0', 'http://0.0.0.0:4390/ann/snapshot'],
    ['5. 127.1', 'http://127.1:4390/ann/snapshot'],
    ['6. 127.0.0.2', 'http://127.0.0.2:4390/ann/snapshot'],
    ['6b. decimal alias', 'http://2130706433:4390/ann/snapshot'],
    ['6c. hex alias', 'http://0x7f000001:4390/ann/snapshot'],
    ['6d. octal alias', 'http://0177.0.0.1:4390/ann/snapshot'],
    ['6e. leading-zero alias', 'http://127.000.000.001:4390/ann/snapshot'],
    ['6f. IPv4-mapped IPv6', 'http://[::ffff:127.0.0.1]:4390/ann/snapshot'],
    ['7. LAN IP', 'http://192.168.1.20:4390/ann/snapshot'],
    ['7b. LAN IP 10/8', 'http://10.0.0.5:4390/ann/snapshot'],
    ['8. public IP', 'http://8.8.8.8:4390/ann/snapshot'],
    ['9. domain', 'http://ann.example:4390/ann/snapshot'],
    ['9b. look-alike domain', 'http://127.0.0.1.attacker.example:4390/ann/snapshot'],
    ['10. https', 'https://127.0.0.1:4390/ann/snapshot'],
    ['11. ftp', 'ftp://127.0.0.1:4390/ann/snapshot'],
    ['11b. protocol-relative', '//127.0.0.1:4390/ann/snapshot'],
    ['11c. file', 'file:///ann/snapshot'],
    ['12. userinfo', 'http://user:pw@127.0.0.1:4390/ann/snapshot'],
    ['12b. userinfo trick', 'http://127.0.0.1:4390@attacker.example/ann/snapshot'],
    ['13. query', `${EP}?path=/etc/passwd`],
    ['13b. empty query', `${EP}?`],
    ['14. fragment', `${EP}#x`],
    ['15. trailing slash', `${EP}/`],
    ['16. alternate path', 'http://127.0.0.1:4390/ann/health'],
    ['16b. case variant', 'http://127.0.0.1:4390/ANN/SNAPSHOT'],
    ['16c. encoded path', 'http://127.0.0.1:4390/ann/%73napshot'],
    ['16d. dot segment', 'http://127.0.0.1:4390/ann/./snapshot'],
    ['16e. traversal', 'http://127.0.0.1:4390/x/../ann/snapshot'],
    ['16f. double slash', 'http://127.0.0.1:4390//ann/snapshot'],
    ['16g. backslash', 'http:\\\\127.0.0.1:4390\\ann\\snapshot'],
    ['17. privileged port', 'http://127.0.0.1:80/ann/snapshot'],
    ['17b. port 1023', 'http://127.0.0.1:1023/ann/snapshot'],
    ['17c. port 65536', 'http://127.0.0.1:65536/ann/snapshot'],
    ['17d. leading-zero port', 'http://127.0.0.1:04390/ann/snapshot'],
    ['18. missing port', 'http://127.0.0.1/ann/snapshot'],
    ['18b. empty port', 'http://127.0.0.1:/ann/snapshot'],
    ['19. malformed URL', 'http//127.0.0.1:4390/ann/snapshot'],
    ['19b. whitespace', ` ${EP}`],
    ['19c. uppercase scheme', 'HTTP://127.0.0.1:4390/ann/snapshot'],
    ['19d. control character', `http://127.0.0.1:4390/ann/snap\nshot`],
  ])('%s is rejected', async (_name, url) => {
    expect(() => validateAnnLocalEndpoint(url)).toThrow(AnnLocalSourceError);
    const f = fake(() => json('{}'));
    expect(await failCode(new LocalSnapshotSource(url, { fetch: f.fetch }).load())).toBe(
      'LOCAL_ENDPOINT_INVALID',
    );
    expect(f.calls).toEqual([]); // never even attempted
  });

  it('19e. missing configuration is NOT_CONFIGURED; non-strings are INVALID; nothing is fetched', async () => {
    for (const v of [undefined, null, '']) {
      const f = fake(() => json('{}'));
      expect(await failCode(new LocalSnapshotSource(v, { fetch: f.fetch }).load())).toBe(
        'LOCAL_ENDPOINT_NOT_CONFIGURED',
      );
      expect(f.calls).toEqual([]);
    }
    for (const v of [4390, {}, ['x'], new URL(EP)])
      expect(await failCode(new LocalSnapshotSource(v).load())).toBe('LOCAL_ENDPOINT_INVALID');
  });
});

describe('request: one GET, nothing ambient', () => {
  const sent = async () => {
    const f = fake(() => json('{}'));
    await new LocalSnapshotSource(EP, { fetch: f.fetch }).load();
    expect(f.calls).toHaveLength(1);
    return f.calls[0]!;
  };
  it('20. method GET to the configured endpoint only', async () => {
    const c = await sent();
    expect(c.url).toBe(EP);
    expect(c.init.method).toBe('GET');
  });
  it('21. credentials omitted (no cookies or HTTP auth), no referrer, no cache', async () => {
    const c = await sent();
    expect(c.init.credentials).toBe('omit');
    expect(c.init.referrerPolicy).toBe('no-referrer');
    expect(c.init.cache).toBe('no-store');
  });
  it('22. no request body', async () => {
    expect((await sent()).init.body).toBeUndefined();
  });
  it('23–24. no headers at all: no Authorization, no Founder or authority header', async () => {
    const c = await sent();
    expect(c.init.headers).toBeUndefined();
    expect(Object.keys(c.init).sort()).toEqual(
      ['cache', 'credentials', 'method', 'mode', 'redirect', 'referrerPolicy'].sort(),
    );
  });
  it('24b. the request policy is frozen', () => {
    expect(Object.isFrozen(ANN_LOCAL_REQUEST)).toBe(true);
    expect(ANN_LOCAL_REQUEST.redirect).toBe('error');
  });
});

describe('response status and content type', () => {
  it('25. 200 is accepted', async () => {
    expect(await loadWith(() => json('{"a":1}'))).toEqual({ a: 1 });
  });
  it.each([201, 204, 206, 400, 403, 404, 405, 500, 503])(
    '26. status %i is a bounded HTTP error, its body never parsed as ANN',
    async (status) => {
      const body = status === 204 ? null : JSON.stringify(simFeed());
      expect(await failCode(loadWith(() => json(body, {}, status)))).toBe(
        'LOCAL_SOURCE_HTTP_ERROR',
      );
    },
  );
  it.each([
    ['27', 'text/html'],
    ['28', 'text/plain'],
    ['29', 'application/octet-stream'],
    ['29b', 'application/json5'],
    ['29c', 'application/jsonx'],
    ['29d', 'text/json'],
    ['29e', 'application/problem+json'],
    ['29f', 'application/json; charset=latin1'],
    ['29g', 'application/json; charset=utf-16'],
    ['29h', 'application/json; charset=utf-8; x=1'],
    ['29i', ''],
  ])('%s. content type %j is rejected (no sniffing)', async (_n, ct) => {
    const res = () =>
      new Response(JSON.stringify(simFeed()), { headers: ct ? { 'content-type': ct } : {} });
    expect(await failCode(loadWith(res))).toBe('LOCAL_SOURCE_CONTENT_TYPE');
  });
  it.each([
    ['30', 'application/json'],
    ['31', 'application/json;charset=utf-8'],
    ['31b', 'application/json; charset=utf-8'],
    ['31c', 'Application/JSON; Charset=UTF-8'],
  ])('%s. content type %j is accepted', async (_n, ct) => {
    expect(
      await loadWith(() => new Response('{"ok":true}', { headers: { 'content-type': ct } })),
    ).toEqual({ ok: true });
  });
});

describe('redirects never become ANN data', () => {
  it.each([301, 302, 303, 307, 308])('%i is refused', async (status) => {
    const res = () =>
      new Response(JSON.stringify(simFeed()), {
        status,
        headers: { 'content-type': JSON_CT, location: 'http://attacker.example/feed.json' },
      });
    expect(await failCode(loadWith(res))).toBe('LOCAL_SOURCE_REDIRECT_REFUSED');
  });
  it('36b. a response that was followed elsewhere (redirected/url changed) is refused', async () => {
    const followed = () => {
      const r = json(JSON.stringify(simFeed()));
      Object.defineProperty(r, 'redirected', { value: true });
      Object.defineProperty(r, 'url', { value: 'http://attacker.example/feed.json' });
      return r;
    };
    expect(await failCode(loadWith(followed))).toBe('LOCAL_SOURCE_REDIRECT_REFUSED');
    const flagged = () => {
      const r = json(JSON.stringify(simFeed()));
      Object.defineProperty(r, 'redirected', { value: true });
      Object.defineProperty(r, 'url', { value: EP });
      return r;
    };
    expect(await failCode(loadWith(flagged))).toBe('LOCAL_SOURCE_REDIRECT_REFUSED');
    const opaque = () => {
      const r = json(null);
      Object.defineProperty(r, 'type', { value: 'opaqueredirect' });
      Object.defineProperty(r, 'status', { value: 0 });
      return r;
    };
    expect(await failCode(loadWith(opaque))).toBe('LOCAL_SOURCE_REDIRECT_REFUSED');
  });
  it('36c. the platform refusing a redirect (redirect: error) is UNAVAILABLE, not data', async () => {
    const thrower: AnnLocalFetch = () => Promise.reject(new TypeError('redirect mode is error'));
    expect(await failCode(new LocalSnapshotSource(EP, { fetch: thrower }).load())).toBe(
      'LOCAL_SOURCE_UNAVAILABLE',
    );
  });
});

describe('size bound (32 MiB; Content-Length never trusted alone)', () => {
  const MAX = 64;
  it('37. zero bytes: a parse failure, never an empty feed', async () => {
    expect(await failCode(loadWith(() => json('')))).toBe('LOCAL_SOURCE_PARSE_FAILED');
  });
  it('38. a small valid body', async () => {
    expect(await loadWith(() => json('[1]'), MAX)).toEqual([1]);
  });
  it('39. exactly the bound', async () => {
    const body = `"${'a'.repeat(MAX - 2)}"`;
    expect(await loadWith(() => json(body), MAX)).toBe('a'.repeat(MAX - 2));
  });
  it('39b. the default bound mirrors the host: 33554432 bytes, exact max accepted', async () => {
    expect(ANN_LOCAL_MAX_BYTES).toBe(33_554_432);
    const big = new Uint8Array(ANN_LOCAL_MAX_BYTES).fill(0x20);
    big[0] = 0x30; // "0" followed by whitespace: valid JSON, exactly 32 MiB
    expect(await loadWith(() => json(big))).toBe(0);
  });
  it('39c. the default bound + 1 is refused', async () => {
    const big = new Uint8Array(ANN_LOCAL_MAX_BYTES + 1).fill(0x20);
    big[0] = 0x30;
    expect(await failCode(loadWith(() => json(big)))).toBe('LOCAL_SOURCE_TOO_LARGE');
  });
  it('40. Content-Length above the bound is refused before any byte is read', async () => {
    let pulled = 0;
    const res = () =>
      new Response(
        new ReadableStream({
          pull(c) {
            pulled++;
            c.enqueue(bytes('{}'));
            c.close();
          },
        }),
        { headers: { 'content-type': JSON_CT, 'content-length': String(MAX + 1) } },
      );
    expect(await failCode(loadWith(res, MAX))).toBe('LOCAL_SOURCE_TOO_LARGE');
    expect(pulled).toBeLessThanOrEqual(1); // at most the stream's own priming pull
  });
  it('40b. a malformed Content-Length is a bounded HTTP error', async () => {
    for (const cl of ['-1', 'abc', '1e9', '12 34'])
      expect(await failCode(loadWith(() => json('{}', { 'content-length': cl })))).toBe(
        'LOCAL_SOURCE_HTTP_ERROR',
      );
  });
  it('41. a lying (small) Content-Length cannot smuggle more than the bound', async () => {
    const res = () =>
      streamed([bytes(`"${'a'.repeat(MAX)}"`)], {
        'content-length': '2',
      });
    expect(await failCode(loadWith(res, MAX))).toBe('LOCAL_SOURCE_TOO_LARGE');
  });
  it('42. absent Content-Length is bounded by counting', async () => {
    expect(await loadWith(() => streamed([bytes('{"a":'), bytes('1}')]), MAX)).toEqual({ a: 1 });
  });
  it('43. streamed exactly to the bound is accepted', async () => {
    const half = `"${'a'.repeat(MAX / 2 - 1)}`;
    const rest = `${'a'.repeat(MAX / 2 - 1)}"`;
    expect(half.length + rest.length).toBe(MAX);
    expect(await loadWith(() => streamed([bytes(half), bytes(rest)]), MAX)).toHaveLength(MAX - 2);
  });
  it('44. streamed bound + 1 is refused, the stream cancelled, nothing parsed', async () => {
    let cancelled = false;
    let i = 0;
    const res = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            c.enqueue(new Uint8Array(MAX / 2 + 1).fill(0x20));
            if (++i > 100) c.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'content-type': JSON_CT } },
      );
    expect(await failCode(loadWith(res, MAX))).toBe('LOCAL_SOURCE_TOO_LARGE');
    expect(cancelled).toBe(true);
    expect(i).toBeLessThan(5); // stopped reading, not drained
  });
});

describe('strict UTF-8 and JSON', () => {
  it('45. valid UTF-8 (multi-byte) decodes unchanged', async () => {
    expect(await loadWith(() => json('{"t":"《Assembly▪︎Nexus》 é 🐺"}'))).toEqual({
      t: '《Assembly▪︎Nexus》 é 🐺',
    });
  });
  it.each([
    ['lone continuation', [0x22, 0x80, 0x22]],
    ['invalid byte', [0x22, 0xff, 0x22]],
    ['overlong', [0x22, 0xc0, 0xaf, 0x22]],
    ['truncated sequence', [0x22, 0xe2, 0x82, 0x22]],
    ['surrogate', [0x22, 0xed, 0xa0, 0x80, 0x22]],
  ])('46. malformed UTF-8 (%s) fails closed, never replaced', async (_n, b) => {
    expect(await failCode(loadWith(() => json(new Uint8Array(b))))).toBe(
      'LOCAL_SOURCE_DECODE_FAILED',
    );
  });
  it('47. a UTF-8 BOM is refused (one byte sequence, one interpretation)', async () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('{"a":1}')]);
    expect(await failCode(loadWith(() => json(withBom)))).toBe('LOCAL_SOURCE_DECODE_FAILED');
  });
  it.each(['{', '{"a":}', "{'a':1}", '{"a":1,}', 'undefined', 'NaN', '{"a":1}{"b":2}'])(
    '48. malformed JSON %j fails',
    async (body) => {
      expect(await failCode(loadWith(() => json(body)))).toBe('LOCAL_SOURCE_PARSE_FAILED');
    },
  );
  it('49–52. null, arrays, primitives and objects are returned raw (the normalizer judges them)', async () => {
    expect(await loadWith(() => json('null'))).toBeNull();
    expect(await loadWith(() => json('[1,"x"]'))).toEqual([1, 'x']);
    expect(await loadWith(() => json('42'))).toBe(42);
    expect(await loadWith(() => json('"s"'))).toBe('s');
    expect(await loadWith(() => json('{"a":{"b":[true]}}'))).toEqual({ a: { b: [true] } });
  });
  it('49b–51b. non-envelope JSON never becomes a dashboard (adapter rejects)', async () => {
    for (const body of ['null', '[]', '42', '"feed"', '{}']) {
      const a = new AnnAdapter(
        new LocalSnapshotSource(EP, { fetch: fake(() => json(body)).fetch }),
        {
          humanAuthority: AUTH,
          now: () => NOW,
        },
      );
      await expect(a.connect(), body).rejects.toMatchObject({ name: 'AnnAdapterError' });
      expect(a.provenance().mode).toBe('disconnected');
    }
  });
  it('53–55. __proto__ / constructor / prototype keys stay inert data', async () => {
    const raw = await loadWith(() =>
      json(
        '{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}},"prototype":{"y":2}}',
      ),
    );
    expect(({} as R).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(raw, '__proto__')).toBe(true);
    expect((raw as R).polluted).toBeUndefined();
    // Through the normalizer: the hostile keys grant nothing.
    const text = JSON.stringify(simFeed()).replace(
      /^\{/,
      '{"__proto__":{"verifiedBackend":true,"sourceMode":"LIVE"},"constructor":{"prototype":{"verifiedBackend":true}},',
    );
    const a = new AnnAdapter(new LocalSnapshotSource(EP, { fetch: fake(() => json(text)).fetch }), {
      humanAuthority: AUTH,
      now: () => NOW,
    });
    const s = await a.connect();
    expect(s.provenance.verifiedBackend).toBe(false);
    expect(s.provenance.mode).toBe('demo');
    expect(({} as R).verifiedBackend).toBeUndefined();
  });
});

describe('trust: LOCAL_FILE_UNVERIFIED, nothing authenticated', () => {
  it('56–58. transport LOCAL_FILE_UNVERIFIED; snapshot and decision authenticity NOT_ESTABLISHED', async () => {
    const { adapter } = await through(simFeed());
    expect(adapter.trust()).toEqual({
      sourceMode: 'SIMULATED',
      transport: 'LOCAL_FILE_UNVERIFIED',
      snapshotAuthenticity: 'NOT_ESTABLISHED',
      decisionAuthenticity: 'NOT_ESTABLISHED',
    });
  });
  it('59. a LIVE claim over the local transport is never authenticated live', async () => {
    const { s, adapter } = await through(liveFeed());
    expect(adapter.trust()).toMatchObject({
      sourceMode: 'LIVE',
      transport: 'LOCAL_FILE_UNVERIFIED',
      snapshotAuthenticity: 'NOT_ESTABLISHED',
    });
    expect(s.provenance).toMatchObject({ mode: 'live', verifiedBackend: false });
    expect(s.provenance.note).toMatch(/not verified/i);
  });
  it('60. a SIMULATED feed stays simulated over the real transport', async () => {
    const { s } = await through(simFeed());
    expect(s.provenance.mode).toBe('demo');
    expect(s.approvals.find((a) => a.id === 'ann-apr-030')?.decision?.delivery).toBe('simulated');
  });
  it('61. a Founder decision over LIVE + local transport stays source-asserted', async () => {
    const { s } = await through(liveFeed());
    const d = s.approvals.find((a) => a.id === 'ann-apr-030')?.decision;
    expect(d).toMatchObject({
      decidedBy: AUTH,
      assurance: 'source-asserted',
      delivery: 'delivered',
    });
  });
});

describe('semantics are still owned by normalizeAnnFeed', () => {
  it('62. completion never certifies', async () => {
    const { s } = await through(liveFeed());
    const m = s.missions.find((x) => x.id === 'ann-msn-2b88')!;
    expect(m.status).toMatch(/COMPLETE/);
    expect(m.certification).not.toBe('CERTIFIED');
  });
  it('63. missing health stays UNKNOWN (HTTP 200 is not health)', async () => {
    const f = liveFeed();
    delete f.health;
    const { s } = await through(f);
    expect(s.health.status).toBe('UNKNOWN');
  });
  it('64. a source failure is an error, never an empty healthy dashboard', async () => {
    const a = new AnnAdapter(
      new LocalSnapshotSource(EP, { fetch: () => Promise.reject(new TypeError('refused')) }),
      { humanAuthority: AUTH, now: () => NOW },
    );
    await expect(a.connect()).rejects.toThrow(/SOURCE_UNAVAILABLE.*LOCAL_SOURCE_UNAVAILABLE/);
    expect(a.provenance()).toMatchObject({ mode: 'disconnected', verifiedBackend: false });
    expect(a.trust()).toBeNull();
  });
  it('64b. adapter errors name only the bounded local code, never URL or platform text', async () => {
    const a = new AnnAdapter(
      new LocalSnapshotSource(EP, {
        fetch: () => Promise.reject(new TypeError('connect ECONNREFUSED 127.0.0.1:4390 /home/x')),
      }),
      { humanAuthority: AUTH },
    );
    const err = await a.connect().catch((e: Error) => e);
    expect(String((err as Error).message)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|home|TypeError/);
  });
  it('65. a missing ordinal is not fabricated', async () => {
    const { s } = await through(liveFeed());
    expect(s.missions.find((x) => x.id === 'ann-msn-e410')!.ordinal ?? null).toBeNull();
    expect(s.missions.find((x) => x.id === 'ann-msn-7f3a')!.ordinal).toBe(142);
  });
  it('66. duplicate ordinals both become UNKNOWN', async () => {
    const f = liveFeed();
    f.missions[1] = { ...f.missions[1], ordinal: 142 };
    const { s } = await through(f);
    expect(s.missions.find((x) => x.id === 'ann-msn-7f3a')!.ordinal ?? null).toBeNull();
    expect(s.missions.find((x) => x.id === 'ann-msn-91c0')!.ordinal ?? null).toBeNull();
  });
  it('67. Founder impersonation is still rejected', async () => {
    const f = liveFeed();
    f.approvals = f.approvals.map((a) =>
      a.id === 'ann-apr-030'
        ? { ...a, decision: { ...(a.decision as R), decidedBy: 'founder #0007' } }
        : a,
    );
    f.workers.push({ id: 'w-imp', name: 'Founder #0007', role: 'Engineer', state: 'WORKING' });
    const { s } = await through(f);
    const a = s.approvals.find((x) => x.id === 'ann-apr-030');
    expect(a?.decision).toBeUndefined();
    expect(a?.status ?? 'DROPPED').not.toBe('APPROVED');
    expect(s.workers.some((w) => w.id === 'w-imp')).toBe(false);
  });
  it('68. an unknown alert severity stays UNKNOWN', async () => {
    const f = liveFeed();
    f.alerts[0] = { ...f.alerts[0], severity: 'APOCALYPTIC' };
    const { s } = await through(f);
    expect(s.alerts[0]!.severity).toBe('UNKNOWN');
  });
  it('69. a missing priority stays unknown', async () => {
    const f = liveFeed();
    delete f.missions[0]!.priority;
    const { s } = await through(f);
    expect(s.missions.find((x) => x.id === 'ann-msn-7f3a')!.priority).toBe('unknown');
  });
  it('70. unstated reversibility stays unknown', async () => {
    const { s } = await through(liveFeed());
    expect(s.approvals.find((x) => x.id === 'ann-apr-032')!.reversible).toBeNull();
  });
  it('71. a spoofed requiredAuthority is hidden and cannot be decided', async () => {
    const f = liveFeed();
    f.approvals = f.approvals.map((a) =>
      a.id === 'ann-apr-030' ? { ...a, requiredAuthority: 'FOUNDER VERIFIED' } : a,
    );
    const { s } = await through(f);
    const a = s.approvals.find((x) => x.id === 'ann-apr-030')!;
    expect(a.requiredAuthority).toBe('');
    expect(a.decision).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain('FOUNDER VERIFIED');
  });
});

describe('read-only, no polling, no retry', () => {
  it('72–73. approvals and alert acknowledgement are refused; no request is made', async () => {
    const f = fake(() => json(JSON.stringify(liveFeed())));
    const a = new AnnAdapter(new LocalSnapshotSource(EP, { fetch: f.fetch }), {
      humanAuthority: AUTH,
      now: () => NOW,
    });
    await a.connect();
    expect(a.capabilities).toMatchObject({ approvals: false, alertAcknowledgement: false });
    await expect(
      a.submitApprovalDecision({ approvalId: 'ann-apr-031', decision: 'APPROVE' } as never),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });
    await expect(a.acknowledgeAlert('ann-alr-007', AUTH)).rejects.toMatchObject({
      code: 'READ_ONLY',
    });
    expect(f.calls.map((c) => c.init.method)).toEqual(['GET']);
  });
  it('74. the source has no write method', () => {
    const s = new LocalSnapshotSource(EP);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(s)).filter(
      (k) => k !== 'constructor',
    );
    expect(methods).toEqual(['load']);
  });
  it('75. no autonomous polling: nothing is requested until load() is called', async () => {
    const f = fake(() => json('{}'));
    const src = new LocalSnapshotSource(EP, { fetch: f.fetch });
    const a = new AnnAdapter(src, { humanAuthority: AUTH });
    await new Promise((r) => setTimeout(r, 30));
    expect(f.calls).toEqual([]);
    void a;
  });
  it('76. no automatic retry: one failure is one request', async () => {
    let n = 0;
    const src = new LocalSnapshotSource(EP, {
      fetch: () => {
        n++;
        return Promise.reject(new TypeError('down'));
      },
    });
    const a = new AnnAdapter(src, { humanAuthority: AUTH });
    await a.connect().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 30));
    expect(n).toBe(1);
    // Each explicit refresh is exactly one more request.
    await a.refresh();
    expect(n).toBe(2);
  });
});

describe('configuration: explicit opt-in only', () => {
  const EP_OK = 'http://127.0.0.1:4390/ann/snapshot';
  it('the default deployment never selects ann-local, whatever the URL says', () => {
    for (const search of ['', '?adapter=ann-local', `?endpoint=${EP_OK}`, '?ann=local'])
      expect(withEnvOverrides(assemblyNexusConfig, {}, search).adapter.kind).not.toBe('ann-local');
    expect(assemblyNexusConfig.adapter.kind).not.toBe('ann-local');
  });
  it('the build flag selects ann-local with the build-configured endpoint and deployment authority', () => {
    const c = withEnvOverrides(assemblyNexusConfig, {
      VITE_FORGE_ADAPTER: 'ann-local',
      VITE_FORGE_ANN_LOCAL_ENDPOINT: EP_OK,
    });
    expect(c.adapter).toEqual({
      kind: 'ann-local',
      endpoint: EP_OK,
      humanAuthority: assemblyNexusConfig.governance.humanAuthority,
    });
  });
  it('the URL can never change the endpoint', () => {
    const c = withEnvOverrides(
      assemblyNexusConfig,
      { VITE_FORGE_ADAPTER: 'ann-local', VITE_FORGE_ANN_LOCAL_ENDPOINT: EP_OK },
      '?endpoint=http://attacker.example/x&ann=unavailable#/x',
    );
    expect(c.adapter).toMatchObject({ kind: 'ann-local', endpoint: EP_OK });
  });
  it('ann-local without an endpoint fails closed (no fallback, no discovery)', async () => {
    const c = withEnvOverrides(assemblyNexusConfig, { VITE_FORGE_ADAPTER: 'ann-local' });
    expect(c.adapter).toMatchObject({ kind: 'ann-local', endpoint: '' });
    const adapter = createAdapter(c.adapter);
    await expect(adapter.connect()).rejects.toThrow(/LOCAL_ENDPOINT_NOT_CONFIGURED/);
    expect(adapter.provenance().mode).toBe('disconnected');
  });
  it('both factories build the read-only ANN adapter over LocalSnapshotSource', async () => {
    const cfg = { kind: 'ann-local' as const, endpoint: EP_OK, humanAuthority: AUTH };
    for (const a of [createAdapter(cfg), await loadAdapter(cfg)]) {
      expect(a).toBeInstanceOf(AnnAdapter);
      expect(a.capabilities.approvals).toBe(false);
    }
  });
});
