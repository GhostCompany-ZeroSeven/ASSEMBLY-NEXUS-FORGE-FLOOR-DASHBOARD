/**
 * ANN snapshot host: read-only, loopback-only, one file, one route.
 *
 * Fixture files are created by THIS TEST HARNESS in a private temp directory
 * (the only writes here); the host under test never writes. Every test that
 * touches fixtures re-hashes them to prove SOURCE_FILE_MUTATED=NO.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { createServer as createNetServer, connect, type Server as NetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createAnnSnapshotHost,
  HostConfigError,
  LOOPBACK,
  MAX_SNAPSHOT_BYTES,
  parseHostArgs,
  SNAPSHOT_ROUTE,
  type AnnSnapshotHostConfig,
} from './ann-snapshot-host.ts';

// Vitest runs from the repository root (import.meta.url is not a file URL under jsdom).
const ROOT = process.cwd();
const HERE = join(ROOT, 'scripts');
const HOST_SOURCE = readFileSync(join(HERE, 'ann-snapshot-host.ts'), 'utf8');

const FEED = Buffer.from(
  JSON.stringify({ contract: 'assembly-nexus.dashboard-feed.v1', note: 'fixture' }),
  'utf8',
);

let dir: string;
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

function fixture(name: string, bytes: Buffer | string): string {
  const p = join(dir, name);
  writeFileSync(p, bytes);
  return p;
}

/** Hash + mtime + size of every regular file, and the directory listing itself. */
function tree(): string {
  return readdirSync(dir)
    .sort()
    .map((n) => {
      const p = join(dir, n);
      const st = lstatSync(p);
      return st.isFile() ? `${n}:${sha(p)}:${st.size}:${st.mtimeMs}` : `${n}:${st.mode}`;
    })
    .join('\n');
}

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function send(
  port: number,
  opts: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string;
    omitHost?: boolean;
  } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: LOOPBACK,
        port,
        method: opts.method ?? 'GET',
        path: opts.path ?? SNAPSHOT_ROUTE,
        setHost: !opts.omitHost,
        headers: { ...(opts.omitHost ? {} : { host: `${LOOPBACK}:${port}` }), ...opts.headers },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/** Raw request line, for targets the http client would normalise. */
function raw(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = connect(port, LOOPBACK, () => s.end(text));
    const chunks: Buffer[] = [];
    s.on('data', (c: Buffer) => chunks.push(c));
    s.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
    s.on('error', reject);
  });
}

const errBody = (code: string) => JSON.stringify({ error: code });

const running: { close(): Promise<void> }[] = [];
async function start(
  snapshotPath: string,
  extra: Partial<AnnSnapshotHostConfig> = {},
): Promise<{ port: number; logs: string[] }> {
  const logs: string[] = [];
  const host = createAnnSnapshotHost({
    snapshotPath,
    port: 0,
    log: (e, d) => logs.push(`${e} ${d ?? ''}`),
    ...extra,
  });
  running.push(host);
  return { port: await host.listen(), logs };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ann-host-test-'));
});
afterEach(async () => {
  await Promise.all(running.splice(0).map((h) => h.close()));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true }); // test harness cleanup only
});

describe('A. routing', () => {
  it('1. GET /ann/snapshot returns 200', async () => {
    const { port } = await start(fixture('a1.json', FEED));
    expect((await send(port)).status).toBe(200);
  });

  it('2. unknown paths are 404, including near-misses', async () => {
    const { port } = await start(fixture('a2.json', FEED));
    for (const path of [
      '/',
      '/ann',
      '/ann/',
      '/ann/snapshot/',
      '/ANN/SNAPSHOT',
      '/ann/snapshot.json',
      '/ann/%73napshot',
      '//ann/snapshot',
      '/ann/./snapshot',
      '/ann/snapshot/../snapshot',
      '/ann/snapshot;x',
      '/ann/snapshot#x',
    ]) {
      const r = await send(port, { path });
      expect(r.status, path).toBe(404);
      expect(r.body.toString()).toBe(errBody('NOT_FOUND'));
    }
  });

  it('3. a query string is a different path (404), never a parameter', async () => {
    const { port } = await start(fixture('a3.json', FEED));
    for (const path of ['/ann/snapshot?', '/ann/snapshot?path=/etc/passwd', '/ann/snapshot?x=1'])
      expect((await send(port, { path })).status, path).toBe(404);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])(
    '4. %s is 405 with Allow: GET',
    async (method) => {
      const { port } = await start(fixture(`a4-${method}.json`, FEED));
      const r = await send(port, { method });
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('GET');
      if (method !== 'HEAD') expect(r.body.toString()).toBe(errBody('METHOD_NOT_ALLOWED'));
    },
  );

  it('5. OPTIONS preflight from an allowed origin is still 405 and grants nothing', async () => {
    const origin = 'http://127.0.0.1:5173';
    const { port } = await start(fixture('a5.json', FEED), { allowedOrigins: [origin] });
    const r = await send(port, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'GET' },
    });
    expect(r.status).toBe(405);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('6. no auxiliary routes exist', async () => {
    const { port } = await start(fixture('a6.json', FEED));
    for (const p of [
      'health',
      'status',
      'files',
      'config',
      'debug',
      'admin',
      'metrics',
      'reload',
      'write',
      'commands',
      'ann/health',
      'ann/status',
      'ann/reload',
      'ann/snapshot/raw',
    ])
      expect((await send(port, { path: `/${p}` })).status, p).toBe(404);
  });

  it('7. absolute-form and traversal request targets are 404', async () => {
    const { port } = await start(fixture('a7.json', FEED));
    const h = `Host: ${LOOPBACK}:${port}\r\nConnection: close\r\n\r\n`;
    for (const target of [
      `http://${LOOPBACK}:${port}/ann/snapshot`,
      '/ann/snapshot/../../etc/passwd',
      '/..%2f..%2fetc%2fpasswd',
      '*',
    ]) {
      const out = await raw(port, `GET ${target} HTTP/1.1\r\n${h}`);
      expect(out, target).toMatch(/^HTTP\/1\.1 (404|400) /);
    }
  });

  it('8. a non-GET with the correct route never reads or returns the file', async () => {
    const p = fixture('a8.json', FEED);
    const { port, logs } = await start(p);
    const r = await send(port, { method: 'POST', body: 'anything' });
    expect(r.body.includes(FEED)).toBe(false);
    expect(logs.some((l) => l.startsWith('snapshot-'))).toBe(false);
  });
});

describe('B. file', () => {
  it('9. a valid regular file is served', async () => {
    const { port } = await start(fixture('b9.json', FEED));
    expect((await send(port)).body.equals(FEED)).toBe(true);
  });

  it('10. an empty file is EMPTY (503)', async () => {
    const { port } = await start(fixture('b10.json', ''));
    const r = await send(port);
    expect([r.status, r.body.toString()]).toEqual([503, errBody('EMPTY')]);
  });

  it('11. a nonexistent file is UNAVAILABLE and is never created', async () => {
    const p = join(dir, 'b11-missing.json');
    const { port } = await start(p);
    const r = await send(port);
    expect([r.status, r.body.toString()]).toEqual([503, errBody('UNAVAILABLE')]);
    expect(existsSync(p)).toBe(false);
  });

  it('12. a directory is NOT_FILE', async () => {
    const d = join(dir, 'b12-dir');
    mkdirSync(d);
    const { port } = await start(d);
    expect((await send(port)).body.toString()).toBe(errBody('NOT_FILE'));
  });

  it('13. a symlink is NOT_FILE even when its target is a valid regular file', async () => {
    const target = fixture('b13-target.json', FEED);
    const link = join(dir, 'b13-link.json');
    symlinkSync(target, link);
    const { port } = await start(link);
    const r = await send(port);
    expect([r.status, r.body.toString()]).toEqual([503, errBody('NOT_FILE')]);
    expect(r.body.includes(FEED)).toBe(false);
  });

  it('13b. dangling and directory symlinks are refused too', async () => {
    const dangling = join(dir, 'b13b-dangling');
    symlinkSync(join(dir, 'nowhere.json'), dangling);
    const toDir = join(dir, 'b13b-dirlink');
    symlinkSync(dir, toDir);
    for (const p of [dangling, toDir]) {
      const { port } = await start(p);
      expect((await send(port)).body.toString()).toBe(errBody('NOT_FILE'));
    }
    expect(existsSync(join(dir, 'nowhere.json'))).toBe(false);
  });

  it('14. exactly the byte limit is served', async () => {
    const bytes = Buffer.alloc(1024, 0x41);
    const { port } = await start(fixture('b14.json', bytes), { maxBytes: 1024 });
    expect((await send(port)).body.equals(bytes)).toBe(true);
  });

  it('15. limit + 1 is TOO_LARGE with no partial body', async () => {
    const { port } = await start(fixture('b15.json', Buffer.alloc(1025, 0x41)), {
      maxBytes: 1024,
    });
    const r = await send(port);
    expect([r.status, r.body.toString()]).toEqual([503, errBody('TOO_LARGE')]);
  });

  it('15b. the default limit is 32 MiB: exactly 32 MiB served, 32 MiB + 1 refused', async () => {
    expect(MAX_SNAPSHOT_BYTES).toBe(32 * 1024 * 1024);
    const at = fixture('b15b-at.json', Buffer.alloc(MAX_SNAPSHOT_BYTES, 0x20));
    const over = fixture('b15b-over.json', Buffer.alloc(MAX_SNAPSHOT_BYTES + 1, 0x20));
    const a = await start(at);
    const ra = await send(a.port);
    expect([ra.status, ra.body.length]).toEqual([200, MAX_SNAPSHOT_BYTES]);
    const o = await start(over);
    const ro = await send(o.port);
    expect([ro.status, ro.body.toString()]).toEqual([503, errBody('TOO_LARGE')]);
    rmSync(at); // harness cleanup of large fixtures
    rmSync(over);
  });

  it('16. repeated requests return identical bytes (re-read each time, no cache)', async () => {
    const { port } = await start(fixture('b16.json', FEED));
    for (let i = 0; i < 5; i++) expect((await send(port)).body.equals(FEED)).toBe(true);
  });

  it('17. an atomic producer replace (rename) is picked up on the next request', async () => {
    const p = fixture('b17.json', FEED);
    const { port } = await start(p);
    expect((await send(port)).body.equals(FEED)).toBe(true);
    const next = Buffer.from('{"next":true}');
    writeFileSync(join(dir, 'b17.tmp'), next); // harness plays the producer
    renameSync(join(dir, 'b17.tmp'), p);
    expect((await send(port)).body.equals(next)).toBe(true);
  });

  it('18. hashes, sizes, mtimes and the directory listing are unchanged after success and failure', async () => {
    const ok = fixture('b18.json', FEED);
    const empty = fixture('b18-empty.json', '');
    const big = fixture('b18-big.json', Buffer.alloc(2048, 0x41));
    const before = tree();
    const s = await start(ok);
    const e = await start(empty);
    const b = await start(big, { maxBytes: 1024 });
    for (let i = 0; i < 3; i++) {
      await send(s.port);
      await send(s.port, { path: '/nope' });
      await send(s.port, { method: 'PUT', body: '{"x":1}' });
      await send(s.port, { method: 'DELETE' });
      await send(e.port);
      await send(b.port);
    }
    await Promise.all(Array.from({ length: 10 }, () => send(s.port)));
    expect(tree()).toBe(before); // SOURCE_FILE_MUTATED=NO
  });
});

describe('C. response', () => {
  it('19. bytes are returned exactly (not parsed, normalised or re-serialised)', async () => {
    const odd = Buffer.from('{ "b":1,\n\t"a" : [ 1.0, 1e2 ], "a":2 }   \n');
    const { port } = await start(fixture('c19.json', odd));
    const r = await send(port);
    expect(r.body.equals(odd)).toBe(true);
    expect(Number(r.headers['content-length'])).toBe(odd.length);
  });

  it('20. content type is application/json; charset=utf-8', async () => {
    const { port } = await start(fixture('c20.json', FEED));
    expect((await send(port)).headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('21. success and errors are Cache-Control: no-store, nosniff', async () => {
    const { port } = await start(fixture('c21.json', FEED));
    for (const r of [await send(port), await send(port, { path: '/x' })]) {
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('22. no informational transport or server headers that could read as trust', async () => {
    const { port } = await start(fixture('c22.json', FEED));
    const r = await send(port);
    expect(r.headers['x-ann-transport']).toBeUndefined();
    expect(r.headers['server']).toBeUndefined();
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('23. error bodies are exactly {"error":CODE}: no path, name, stack or Node error', async () => {
    const secretName = 'b23-SECRET-name.json';
    const big = fixture(secretName, Buffer.from('{"secret":"CONTENT-SHOULD-NOT-LEAK"}'));
    const cases: [string, Partial<AnnSnapshotHostConfig>, string][] = [
      [join(dir, 'missing-SECRET.json'), {}, 'UNAVAILABLE'],
      [dir, {}, 'NOT_FILE'],
      [fixture('c23-empty.json', ''), {}, 'EMPTY'],
      [big, { maxBytes: 4 }, 'TOO_LARGE'],
    ];
    for (const [p, extra, code] of cases) {
      const { port, logs } = await start(p, extra);
      const r = await send(port);
      const all = r.body.toString() + JSON.stringify(r.headers) + logs.join('\n');
      expect(r.body.toString()).toBe(errBody(code));
      for (const leak of [
        dir,
        'SECRET',
        'CONTENT-SHOULD-NOT-LEAK',
        'ENOENT',
        'Error',
        ' at ',
        tmpdir(),
      ])
        expect(all, `${code} leaks ${leak}`).not.toContain(leak);
    }
  });

  it('24. the host never logs paths or contents', async () => {
    const { port, logs } = await start(fixture('c24-private-name.json', FEED));
    await send(port);
    await send(port, { path: '/x' });
    expect(logs.join('\n')).not.toMatch(/c24-private-name|fixture|ann-host-test|\//);
  });
});

describe('D. Host and Origin', () => {
  it('25. Host 127.0.0.1:<port> is accepted', async () => {
    const { port } = await start(fixture('d25.json', FEED));
    expect((await send(port, { headers: { host: `127.0.0.1:${port}` } })).status).toBe(200);
  });

  it('26. localhost, attacker, arbitrary, wrong-port and malformed Host values are rejected', async () => {
    const { port } = await start(fixture('d26.json', FEED));
    for (const host of [
      `localhost:${port}`,
      `localhost`,
      `attacker.example`,
      `attacker.example:${port}`,
      `127.0.0.1`,
      `127.0.0.1:${port + 1}`,
      `127.0.0.1:${port}.`,
      `127.0.0.1:${port}@attacker.example`,
      `attacker.example@127.0.0.1:${port}`,
      `[::1]:${port}`,
      `0.0.0.0:${port}`,
      `127.1:${port}`,
      `2130706433:${port}`,
      ` 127.0.0.1:${port}x`,
    ]) {
      const r = await send(port, { headers: { host } });
      expect(r.status, JSON.stringify(host)).toBe(403);
      expect(r.body.toString()).toBe(errBody('HOST_REJECTED'));
      expect(r.body.includes(FEED)).toBe(false);
    }
  });

  it('27. a missing or empty Host header is rejected by the host itself', async () => {
    const { port } = await start(fixture('d27.json', FEED));
    const out = await raw(port, `GET ${SNAPSHOT_ROUTE} HTTP/1.0\r\n\r\n`);
    expect(out).toMatch(/^HTTP\/1\.1 403 /);
    expect(out).toContain(errBody('HOST_REJECTED'));
    const out11 = await raw(port, `GET ${SNAPSHOT_ROUTE} HTTP/1.1\r\nConnection: close\r\n\r\n`);
    expect(out11).toMatch(/^HTTP\/1\.1 403 /);
    // An empty Host value (the http client would substitute its own, so send it raw).
    const empty = await raw(
      port,
      `GET ${SNAPSHOT_ROUTE} HTTP/1.1\r\nHost:\r\nConnection: close\r\n\r\n`,
    );
    expect(empty).toMatch(/^HTTP\/1\.1 403 /);
    expect(empty).not.toContain('"contract"');
  });

  it('28. an allow-listed Origin is echoed exactly (never *), with Vary: Origin', async () => {
    const origin = 'http://127.0.0.1:5173';
    const { port } = await start(fixture('d28.json', FEED), {
      allowedOrigins: [origin, 'http://localhost:5173'],
    });
    const r = await send(port, { headers: { origin } });
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe(origin);
    expect(r.headers['vary']).toBe('Origin');
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('29. any other Origin is refused and never reflected', async () => {
    const { port } = await start(fixture('d29.json', FEED), {
      allowedOrigins: ['http://127.0.0.1:5173'],
    });
    for (const origin of [
      'http://attacker.example',
      'null',
      '*',
      'http://127.0.0.1:5174',
      'HTTP://127.0.0.1:5173',
      'http://127.0.0.1:5173/',
      'https://127.0.0.1:5173',
      'http://127.0.0.1:5173.attacker.example',
    ]) {
      const r = await send(port, { headers: { origin } });
      expect(r.status, origin).toBe(403);
      expect(r.body.toString()).toBe(errBody('ORIGIN_REJECTED'));
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('30. no Origin = non-browser/same-origin read: served without any CORS grant; empty allow-list refuses every Origin', async () => {
    const { port } = await start(fixture('d30.json', FEED));
    const r = await send(port);
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect((await send(port, { headers: { origin: 'http://127.0.0.1:5173' } })).status).toBe(403);
  });

  it('30b. configuration refuses wildcard, null and malformed origins', () => {
    for (const o of ['*', 'null', 'http://*.example', 'file://', 'http://a.example/path', ''])
      expect(
        () => createAnnSnapshotHost({ snapshotPath: join(dir, 'x'), port: 0, allowedOrigins: [o] }),
        o,
      ).toThrow(HostConfigError);
  });
});

/** Host source with comments removed, for the capability audit. */
const CODE = HOST_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('E. capability', () => {
  it('31. no write, delete, rename, mkdir, chmod, chown or copy APIs', () => {
    for (const api of [
      'writeFile',
      'appendFile',
      'truncate',
      'unlink',
      'rename',
      'mkdir',
      'rmdir',
      'chmod',
      'chown',
      'createWriteStream',
      'copyFile',
      'cp(',
      'symlink',
      'utimes',
      'O_WRONLY',
      'O_RDWR',
      'O_CREAT',
      'O_TRUNC',
      'O_APPEND',
    ])
      expect(CODE, api).not.toContain(api);
    expect(CODE).not.toMatch(/\brm(Sync)?\s*\(/);
    expect(CODE).not.toMatch(/\bopen\([^)]*['"][wa+]/);
  });

  it('32. no process execution', () => {
    for (const api of ['child_process', 'exec(', 'execFile', 'spawn', 'fork(', 'process.kill'])
      expect(CODE, api).not.toContain(api);
  });

  it('33. no watchers', () => {
    for (const api of ['fs.watch', 'watch(', 'watchFile', 'chokidar'])
      expect(CODE, api).not.toContain(api);
  });

  it('34. no timers, eval, Function constructor or dynamic import', () => {
    for (const api of [
      'setInterval',
      'setTimeout',
      'setImmediate',
      'eval(',
      'Function(',
      'import(',
    ])
      expect(CODE, api).not.toContain(api);
  });

  it('35. no outbound client: imports are exactly the five allowed built-ins', () => {
    for (const api of [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'request(',
      'connect(',
      'node:https',
      'node:net',
      'node:tls',
      'dgram',
    ])
      expect(CODE, api).not.toContain(api);
    const specifiers = [...HOST_SOURCE.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map(
      (m) => m[1],
    );
    expect(specifiers.sort()).toEqual(
      ['node:fs', 'node:fs/promises', 'node:http', 'node:path', 'node:url'].sort(),
    );
    expect(HOST_SOURCE).toMatch(/import \{ constants as FS, lstatSync \} from 'node:fs';/);
    expect(HOST_SOURCE).toMatch(/import \{ lstat, open, realpath \} from 'node:fs\/promises';/);
  });

  it('36. the path cannot be chosen per request: query, header, cookie and body are ignored', async () => {
    const served = fixture('e36.json', FEED);
    const other = fixture('e36-other.json', '{"other":true}');
    const { port } = await start(served);
    expect((await send(port, { path: `${SNAPSHOT_ROUTE}?path=${other}` })).status).toBe(404);
    for (const headers of <Record<string, string>[]>[
      { 'x-snapshot-path': other },
      { 'x-ann-path': other },
      { cookie: `path=${other}; snapshot=${other}` },
      { referer: `http://127.0.0.1/?path=${other}` },
    ])
      expect((await send(port, { headers })).body.equals(FEED)).toBe(true);
    expect(CODE).not.toMatch(/req\.(headers\.(cookie|referer)|on\(|read\(|pipe\()/);
    expect(CODE).not.toContain('searchParams');
  });

  it('37. request bodies are never interpreted', async () => {
    const other = fixture('e37-other.json', '{"other":true}');
    const { port } = await start(fixture('e37.json', FEED));
    const body = JSON.stringify({ path: other, snapshotPath: other, command: 'write' });
    const g = await send(port, {
      body,
      headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
    });
    expect(g.body.equals(FEED)).toBe(true);
    const p = await send(port, { method: 'POST', body });
    expect([p.status, p.body.toString()]).toEqual([405, errBody('METHOD_NOT_ALLOWED')]);
  });

  it('37b. startup: loopback only, explicit absolute path, no privileged ports', () => {
    const p = join(dir, 'x.json');
    for (const host of ['0.0.0.0', '::', '::1', 'localhost', '192.168.1.10', '10.0.0.1', ''])
      expect(() => createAnnSnapshotHost({ snapshotPath: p, port: 0, host }), host).toThrow(
        HostConfigError,
      );
    for (const snapshotPath of ['', 'relative/feed.json', './feed.json', `${p}\u0000x`])
      expect(() => createAnnSnapshotHost({ snapshotPath, port: 0 })).toThrow(HostConfigError);
    for (const port of [80, 443, 1023, 65536, -1, 1.5, NaN])
      expect(() => createAnnSnapshotHost({ snapshotPath: p, port }), String(port)).toThrow(
        HostConfigError,
      );
    for (const maxBytes of [0, -1, MAX_SNAPSHOT_BYTES + 1, 1.5])
      expect(() => createAnnSnapshotHost({ snapshotPath: p, port: 0, maxBytes })).toThrow(
        HostConfigError,
      );
  });

  it('37c. the listener is bound to 127.0.0.1 only', async () => {
    const host = createAnnSnapshotHost({ snapshotPath: fixture('e37c.json', FEED), port: 0 });
    running.push(host);
    await host.listen();
    const addr = host.server.address();
    expect(typeof addr === 'object' && addr?.address).toBe('127.0.0.1');
  });

  it('37d. CLI: one --snapshot, explicit options only', () => {
    expect(parseHostArgs(['--snapshot', '/srv/ann/feed.json'])).toEqual({
      snapshotPath: '/srv/ann/feed.json',
      port: 4380,
      allowedOrigins: [],
    });
    const c = parseHostArgs([
      '--snapshot',
      '/srv/ann/feed.json',
      '--port',
      '4390',
      '--allow-origin',
      'http://127.0.0.1:5173',
    ]);
    expect([c.port, c.allowedOrigins]).toEqual([4390, ['http://127.0.0.1:5173']]);
    for (const argv of [['--snapshot'], ['--host', '0.0.0.0'], ['--dir', '/srv'], ['x', 'y']])
      expect(() => parseHostArgs(argv), argv.join(' ')).toThrow(HostConfigError);
    expect(() => createAnnSnapshotHost(parseHostArgs([]))).toThrow(HostConfigError);
    expect(() =>
      createAnnSnapshotHost(parseHostArgs(['--snapshot', '/srv/f.json', '--port', '8o'])),
    ).toThrow(HostConfigError);
  });

  // Phase boundary. Host-only preservation (b663c38) required NO dashboard
  // connection. Founder #0007 then authorized exactly ONE governed, read-only
  // connection: the explicit `ann-local` adapter via LocalSnapshotSource. This
  // guard enforces that narrow architecture; it is not a whitelist.
  it('37e. optional host: no lifecycle hook or auto-start; the dashboard reaches it only through the explicit ann-local boundary', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const hook of [
      'preinstall',
      'install',
      'postinstall',
      'prepare',
      'prepublish',
      'prebuild',
      'postbuild',
      'pretest',
      'posttest',
      'predev',
      'prestart',
      'start',
    ])
      expect(pkg.scripts[hook], hook).toBeUndefined();
    const users = Object.entries(pkg.scripts).filter(([, cmd]) =>
      cmd.includes('ann-snapshot-host'),
    );
    expect(users.map(([name]) => name)).toEqual(['ann:host']);
    expect(Object.values(pkg.scripts).some((cmd) => cmd.includes('ann:host'))).toBe(false);

    // Production browser code (tests excluded), comments stripped.
    const strip = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const code = new Map<string, string>();
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n))
          code.set(p.slice(ROOT.length + 1).replace(/\\/g, '/'), strip(readFileSync(p, 'utf8')));
      }
    };
    walk(join(ROOT, 'src'));
    const holders = (re: RegExp) =>
      [...code]
        .filter(([, t]) => re.test(t))
        .map(([f]) => f)
        .sort();

    const SOURCE = 'src/adapters/ann/localSnapshotSource.ts';
    // The browser never names, starts or imports the host program, nor its default port.
    expect(holders(/ann-snapshot-host|\b4380\b/)).toEqual([]);
    // Exactly one module knows the host route, and only as the anchored endpoint shape.
    expect(holders(/ann\\?\/snapshot/)).toEqual([SOURCE]);
    const src = code.get(SOURCE) ?? '';
    expect(src.match(/ann\\?\/snapshot/g)).toHaveLength(1);
    expect(src).toContain(
      'const ENDPOINT_RE = /^http:\\/\\/127\\.0\\.0\\.1:([1-9][0-9]{3,4})\\/ann\\/snapshot$/;',
    );
    // One read-only GET: no credentials, no redirects, no other method, no filesystem.
    expect(src).toMatch(/method: 'GET'/);
    expect(src).toMatch(/credentials: 'omit'/);
    expect(src).toMatch(/redirect: 'error'/);
    expect(src).not.toMatch(
      /'(POST|PUT|PATCH|DELETE)'|WebSocket|EventSource|setInterval|setTimeout/,
    );
    expect(src).not.toMatch(/node:|file:|FileReader|showOpenFilePicker|localStorage|location\./);
    // Network capability lives in that one module only.
    expect(holders(/\bfetch\s*\(/).filter((f) => f.startsWith('src/adapters/ann/'))).toEqual([
      SOURCE,
    ]);
    // The source is instantiated only by the two adapter factories.
    expect(holders(/new LocalSnapshotSource\(/)).toEqual([
      'src/adapters/createAdapter.ts',
      'src/adapters/loadAdapter.ts',
    ]);
    // `ann-local` exists only in the config type, the explicit opt-in and the factories.
    expect(holders(/ann-local/)).toEqual([
      'src/adapters/createAdapter.ts',
      'src/adapters/loadAdapter.ts',
      'src/config/runtime.ts',
      'src/config/types.ts',
    ]);
    // Opt-in: selected only by the explicit build flag, endpoint only from build config.
    const runtime = code.get('src/config/runtime.ts') ?? '';
    expect(runtime).toContain("env.VITE_FORGE_ADAPTER === 'ann-local'");
    expect(runtime.match(/VITE_FORGE_ANN_LOCAL_ENDPOINT/g)).toHaveLength(1);
    expect(holders(/VITE_FORGE_ANN_LOCAL_ENDPOINT/)).toEqual(['src/config/runtime.ts']);
    const block = runtime.slice(
      runtime.indexOf("env.VITE_FORGE_ADAPTER === 'ann-local'"),
      runtime.indexOf("env.VITE_FORGE_ADAPTER !== 'rest'"),
    );
    expect(block).toContain("endpoint: env.VITE_FORGE_ANN_LOCAL_ENDPOINT ?? '',");
    expect(block).not.toMatch(/search|location|Storage|cookie|hash|prompt\(/);
    // No default deployment config or default build env selects it.
    for (const f of ['.env', '.env.local', '.env.production', '.env.development'])
      if (existsSync(join(ROOT, f)))
        expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/ann-local/);
    for (const [f, t] of code)
      if (
        f.startsWith('src/config/') &&
        f !== 'src/config/types.ts' &&
        f !== 'src/config/runtime.ts'
      )
        expect(t, f).not.toMatch(/ann-local/);
  });
});

describe('F. concurrency and content', () => {
  it('38. simultaneous GETs all receive the exact bytes', async () => {
    const p = fixture('f38.json', FEED);
    const before = sha(p);
    const { port } = await start(p);
    const all = await Promise.all(Array.from({ length: 25 }, () => send(port)));
    for (const r of all) expect(r.body.equals(FEED)).toBe(true);
    expect(sha(p)).toBe(before);
  });

  it('39. sequential mixed requests stay independent', async () => {
    const { port } = await start(fixture('f39.json', FEED));
    for (let i = 0; i < 5; i++) {
      expect((await send(port, { method: 'POST' })).status).toBe(405);
      expect((await send(port, { path: '/x' })).status).toBe(404);
      expect((await send(port)).body.equals(FEED)).toBe(true);
    }
  });

  it('40. malformed JSON and non-UTF-8 bytes are returned unchanged (the browser owns parsing)', async () => {
    const bad = Buffer.concat([
      Buffer.from('{"unterminated": ['),
      Buffer.from([0xff, 0xfe, 0x00, 0x80]),
    ]);
    const { port } = await start(fixture('f40.json', bad));
    const r = await send(port);
    expect([r.status, r.body.equals(bad)]).toEqual([200, true]);
  });

  it('41. prototype-looking JSON is returned byte-for-byte, never interpreted', async () => {
    const proto = Buffer.from(
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}},"contract":"assembly-nexus.dashboard-feed.v1"}',
    );
    const { port } = await start(fixture('f41.json', proto));
    expect((await send(port)).body.equals(proto)).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('42. Unicode (BOM, emoji, combining, RTL, bidi controls) is returned unchanged', async () => {
    const uni = Buffer.from('﻿{"t":"Founder #0007 《Assembly▪︎Nexus》 é ‮RTL‬ 🐺 ̀ ‍"}', 'utf8');
    const { port } = await start(fixture('f42.json', uni));
    expect((await send(port)).body.equals(uni)).toBe(true);
  });
});

describe('G. special files', () => {
  it('43. a character device is NOT_FILE and is never opened', async () => {
    if (!existsSync('/dev/null') || !lstatSync('/dev/null').isCharacterDevice()) return;
    const { port } = await start('/dev/null');
    expect((await send(port)).body.toString()).toBe(errBody('NOT_FILE'));
  });

  it('44. a FIFO is NOT_FILE and the request never blocks on it', async () => {
    const fifo = join(dir, 'g44.fifo');
    try {
      execFileSync('mkfifo', [fifo]); // test-harness fixture only; the host never executes anything
    } catch {
      return; // platform without mkfifo
    }
    const { port } = await start(fifo);
    expect((await send(port)).body.toString()).toBe(errBody('NOT_FILE'));
  });

  it('45. a Unix socket is NOT_FILE', async () => {
    if (process.platform === 'win32') return;
    const sock = join(dir, 'g45.sock');
    const srv: NetServer = createNetServer();
    await new Promise<void>((r) => srv.listen(sock, r));
    try {
      const { port } = await start(sock);
      expect((await send(port)).body.toString()).toBe(errBody('NOT_FILE'));
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it('46. a symlink swapped in after startup is refused on the next request', async () => {
    const p = fixture('g46.json', FEED);
    const { port } = await start(p);
    expect((await send(port)).status).toBe(200);
    const target = fixture('g46-target.json', '{"swapped":true}');
    const tmpLink = join(dir, 'g46.tmplink');
    symlinkSync(target, tmpLink);
    renameSync(tmpLink, p); // harness replaces the file with a symlink
    const r = await send(port);
    expect(r.body.toString()).toBe(errBody('NOT_FILE'));
  });

  it('47. a file that disappears after startup is UNAVAILABLE, not a crash', async () => {
    const p = fixture('g47.json', FEED);
    const { port } = await start(p);
    rmSync(p);
    expect((await send(port)).body.toString()).toBe(errBody('UNAVAILABLE'));
    expect((await send(port, { path: '/x' })).status).toBe(404);
  });
});
