/**
 * ANN snapshot host: OPTIONAL, read-only, loopback-only.
 *
 *   node scripts/ann-snapshot-host.ts --snapshot /absolute/path/to/ann-snapshot.json \
 *     [--port 4380] [--allow-origin http://127.0.0.1:5173]
 *
 * Its whole purpose: serve the exact bytes of ONE snapshot file, chosen at
 * startup by the operator, at `GET /ann/snapshot` on 127.0.0.1.
 *
 * It is NOT ANN, NOT authority, NOT certification, NOT a file server, NOT a
 * proxy and NOT a command channel. It never parses, normalizes, repairs or
 * rewrites the snapshot: the dashboard's ANN v1 normalizer stays the only
 * truth boundary. A 200 response proves only that this host returned bytes
 * from its configured file; it proves nothing about authenticity, health,
 * certification or any Founder decision.
 *
 * Capabilities, deliberately: inspect + open read-only + read + close one
 * file; one HTTP listener on 127.0.0.1. No writes, no outbound network, no
 * processes, no watchers, no timers, no dynamic code. Node built-ins only.
 *
 * The dashboard is NOT connected to this host yet (separate mission).
 */
import { constants as FS, lstatSync } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The only route. Exact match on the raw request target (no query, no variants). */
export const SNAPSHOT_ROUTE = '/ann/snapshot';
/** The only bind address. Configuration cannot widen it. */
export const LOOPBACK = '127.0.0.1';
/**
 * Upper bound on snapshot bytes. Realistic ANN v1 snapshots at the contract's
 * collection bounds with typical field lengths are a few MiB; 32 MiB leaves
 * wide headroom while bounding memory per request. (A pathological feed with
 * every text field at its normalized maximum could exceed it; such a feed is
 * rejected, never truncated.)
 */
export const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;

/** Bounded, non-secret error codes. Never paths, usernames, stacks or contents. */
export type HostErrorCode =
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'HOST_REJECTED'
  | 'ORIGIN_REJECTED'
  | 'UNAVAILABLE'
  | 'NOT_FILE'
  | 'EMPTY'
  | 'TOO_LARGE'
  | 'READ_FAILED';

const STATUS: Record<HostErrorCode, number> = {
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  HOST_REJECTED: 403,
  ORIGIN_REJECTED: 403,
  UNAVAILABLE: 503,
  NOT_FILE: 503,
  EMPTY: 503,
  TOO_LARGE: 503,
  READ_FAILED: 503,
};

export interface AnnSnapshotHostConfig {
  /** Absolute path of the one snapshot file. From startup configuration only. */
  snapshotPath: string;
  /** Port on 127.0.0.1; 0 = OS-assigned (tests). Privileged ports are refused. */
  port: number;
  /** Exact browser origins allowed to read cross-origin. Never `*`, never reflected. */
  allowedOrigins?: readonly string[];
  /** Must be 127.0.0.1 if given at all: anything else refuses to start. */
  host?: string;
  /** Lower bound for tests only; capped at MAX_SNAPSHOT_BYTES. */
  maxBytes?: number;
  /** Diagnostic sink. Receives event names and codes only, never paths or contents. */
  log?: (event: string, detail?: string) => void;
}

export class HostConfigError extends Error {
  constructor(reason: string) {
    super(`ANN snapshot host not started: ${reason}`);
    this.name = 'HostConfigError';
  }
}

const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;

function validate(c: AnnSnapshotHostConfig) {
  if (c.host !== undefined && c.host !== LOOPBACK)
    throw new HostConfigError(`bind address must be ${LOOPBACK}`);
  if (typeof c.snapshotPath !== 'string' || !c.snapshotPath || !isAbsolute(c.snapshotPath))
    throw new HostConfigError('an absolute --snapshot path is required');
  // The NUL byte is the one character no filesystem path may contain.
  if (c.snapshotPath.includes('\u0000')) throw new HostConfigError('invalid snapshot path');
  if (!Number.isInteger(c.port) || (c.port !== 0 && (c.port < 1024 || c.port > 65535)))
    throw new HostConfigError('port must be 0 (tests) or 1024-65535');
  for (const o of c.allowedOrigins ?? [])
    if (o === '*' || o === 'null' || !ORIGIN_RE.test(o))
      throw new HostConfigError('allowed origins must be explicit http(s) origins');
  const max = c.maxBytes ?? MAX_SNAPSHOT_BYTES;
  if (!Number.isInteger(max) || max < 1 || max > MAX_SNAPSHOT_BYTES)
    throw new HostConfigError('invalid byte limit');
  return max;
}

type ReadResult = { ok: true; bytes: Buffer } | { ok: false; code: HostErrorCode };

/**
 * Reads the configured file, read-only, refusing anything but a regular file.
 * lstat first (never follows a symlink, never opens a FIFO/device), then open
 * read-only with O_NOFOLLOW (where the platform has it) and O_NONBLOCK, then
 * fstat the open handle and require the same regular file (no swap between
 * the check and the open). Size is checked before any buffer is allocated.
 */
async function readSnapshot(path: string, max: number): Promise<ReadResult> {
  let before;
  try {
    before = await lstat(path);
  } catch {
    return { ok: false, code: 'UNAVAILABLE' };
  }
  if (!before.isFile()) return { ok: false, code: 'NOT_FILE' }; // symlink, dir, FIFO, socket, device
  if (before.size === 0) return { ok: false, code: 'EMPTY' };
  if (before.size > max) return { ok: false, code: 'TOO_LARGE' };
  // Windows has no O_NOFOLLOW and lstat cannot classify every reparse point
  // (junctions, cloud placeholders, mount points). Fail closed: the configured
  // path must already be its own canonical path, with nothing to resolve.
  if (process.platform === 'win32') {
    try {
      if ((await realpath(path)).toLowerCase() !== resolve(path).toLowerCase())
        return { ok: false, code: 'NOT_FILE' };
    } catch {
      return { ok: false, code: 'UNAVAILABLE' };
    }
  }

  const flags = FS.O_RDONLY | (FS.O_NOFOLLOW ?? 0) | (FS.O_NONBLOCK ?? 0);
  let handle;
  try {
    handle = await open(path, flags);
  } catch {
    return { ok: false, code: 'UNAVAILABLE' };
  }
  try {
    const st = await handle.stat();
    if (!st.isFile() || st.ino !== before.ino || st.dev !== before.dev)
      return { ok: false, code: 'NOT_FILE' };
    if (st.size === 0) return { ok: false, code: 'EMPTY' };
    if (st.size > max) return { ok: false, code: 'TOO_LARGE' };
    // One byte of headroom detects growth past the bound during the read.
    const buf = Buffer.alloc(Math.min(st.size, max) + 1);
    let filled = 0;
    while (filled < buf.length) {
      const { bytesRead } = await handle.read(buf, filled, buf.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > max) return { ok: false, code: 'TOO_LARGE' };
    // A size change mid-read (e.g. a producer writing in place) is not a snapshot.
    if (filled !== st.size) return { ok: false, code: 'READ_FAILED' };
    return { ok: true, bytes: buf.subarray(0, filled) };
  } catch {
    return { ok: false, code: 'READ_FAILED' };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function fail(res: ServerResponse, code: HostErrorCode, extra: Record<string, string> = {}) {
  const body = JSON.stringify({ error: code });
  res.writeHead(STATUS[code], {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    // The request body (if any) is never read; close instead of draining it.
    Connection: 'close',
    ...extra,
  });
  res.end(body);
}

/**
 * Creates the host (not yet listening). `listen()` binds 127.0.0.1 only and
 * resolves with the actual port; `close()` stops it.
 */
export function createAnnSnapshotHost(config: AnnSnapshotHostConfig) {
  const max = validate(config);
  const log = config.log ?? (() => undefined);
  const origins = new Set(config.allowedOrigins ?? []);
  let allowedHost = '';

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    // 1. Host header: only this listener's own loopback authority (DNS-rebinding defence).
    if (req.headers.host !== allowedHost) return fail(res, 'HOST_REJECTED');
    // 2. Exact route. Query strings, trailing slashes and encodings are other paths.
    if (req.url !== SNAPSHOT_ROUTE) return fail(res, 'NOT_FOUND');
    // 3. GET only (HEAD and OPTIONS included in the refusal; no preflight is needed for a simple GET).
    if (req.method !== 'GET') return fail(res, 'METHOD_NOT_ALLOWED', { Allow: 'GET' });
    // 4. Origin: absent = not a cross-origin browser read; present = exact allow-list match.
    //    CORS restricts browsers only; it is not authentication.
    const origin = req.headers.origin;
    const cors: Record<string, string> = {};
    if (origin !== undefined) {
      if (!origins.has(origin)) return fail(res, 'ORIGIN_REJECTED');
      cors['Access-Control-Allow-Origin'] = origin;
      cors['Vary'] = 'Origin';
    }
    const r = await readSnapshot(config.snapshotPath, max);
    if (!r.ok) {
      log('snapshot-error', r.code);
      return fail(res, r.code, cors);
    }
    log('snapshot-served', String(r.bytes.length));
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': r.bytes.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...cors,
    });
    res.end(r.bytes);
  };

  const server: Server = createServer(
    {
      maxHeaderSize: 8 * 1024,
      requestTimeout: 10_000,
      headersTimeout: 10_000,
      // A missing Host is answered by this host's own HOST_REJECTED, not Node's bare 400.
      requireHostHeader: false,
    },
    (req, res) => {
      handle(req, res).catch(() => {
        if (!res.headersSent) fail(res, 'READ_FAILED');
        else res.destroy();
      });
    },
  );

  return {
    server,
    listen(): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, LOOPBACK, () => {
          const addr = server.address();
          if (!addr || typeof addr === 'string' || addr.address !== LOOPBACK) {
            server.close();
            return reject(new HostConfigError('listener is not loopback'));
          }
          allowedHost = `${LOOPBACK}:${addr.port}`;
          log('listening', allowedHost);
          resolve(addr.port);
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/** CLI arguments: --snapshot <abs path> (required), --port <n>, --allow-origin <origin> (repeatable). */
export function parseHostArgs(argv: readonly string[]): AnnSnapshotHostConfig {
  const cfg: AnnSnapshotHostConfig = { snapshotPath: '', port: 4380, allowedOrigins: [] };
  const origins: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new HostConfigError(`missing value for ${flag}`);
    if (flag === '--snapshot') cfg.snapshotPath = value;
    else if (flag === '--port') cfg.port = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
    else if (flag === '--allow-origin') origins.push(value);
    else throw new HostConfigError(`unknown option ${String(flag).slice(0, 40)}`);
    i++;
  }
  cfg.allowedOrigins = origins;
  return cfg;
}

async function main() {
  try {
    const cfg = parseHostArgs(process.argv.slice(2));
    // Startup check only; every request re-checks the file.
    validate(cfg);
    let kind = 'missing';
    try {
      kind = lstatSync(cfg.snapshotPath).isFile() ? 'regular file' : 'not a regular file';
    } catch {
      /* reported as missing; requests will answer UNAVAILABLE */
    }
    const host = createAnnSnapshotHost({
      ...cfg,
      log: (event, detail) =>
        console.log(`[ann-snapshot-host] ${event}${detail ? ` ${detail}` : ''}`),
    });
    const port = await host.listen();
    // Conservative logging: the file's base name only, never the full path.
    console.log(
      `[ann-snapshot-host] serving ${basename(cfg.snapshotPath)} (${kind}) read-only at http://${LOOPBACK}:${port}${SNAPSHOT_ROUTE}`,
    );
  } catch (e) {
    console.error(e instanceof HostConfigError ? e.message : 'ANN snapshot host not started');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
