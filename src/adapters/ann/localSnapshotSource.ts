import type { AnnFeedSource } from './contract';

/**
 * Browser-side READ-ONLY source over the optional local ANN snapshot host
 * (scripts/ann-snapshot-host.ts). One explicit GET per `load()`, to one
 * deployment-configured endpoint of exactly this shape:
 *
 *   http://127.0.0.1:<1024-65535>/ann/snapshot
 *
 * It transports bytes and parses JSON; nothing else. It never normalizes,
 * infers authority, certification, health or ordinals, retries, polls,
 * follows redirects, sends credentials or writes anything. The parsed value
 * goes, untrusted, to the one ANN v1 normalization boundary (normalize.ts).
 *
 * Trust: LOCAL_FILE_UNVERIFIED. Bytes arrived from the configured loopback
 * host; who produced them, and whether they are true, is NOT established.
 */

/** Mirrors the preserved host's bound (MAX_SNAPSHOT_BYTES): 32 MiB. */
export const ANN_LOCAL_MAX_BYTES = 33_554_432;

/** The only accepted endpoint shape. Stricter than any URL parser on purpose. */
const ENDPOINT_RE = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/ann\/snapshot$/;

/** Bounded error vocabulary. No URLs, bodies, stacks or host error text. */
export type AnnLocalSourceErrorCode =
  | 'LOCAL_ENDPOINT_NOT_CONFIGURED'
  | 'LOCAL_ENDPOINT_INVALID'
  | 'LOCAL_SOURCE_UNAVAILABLE'
  | 'LOCAL_SOURCE_REDIRECT_REFUSED'
  | 'LOCAL_SOURCE_HTTP_ERROR'
  | 'LOCAL_SOURCE_CONTENT_TYPE'
  | 'LOCAL_SOURCE_TOO_LARGE'
  | 'LOCAL_SOURCE_DECODE_FAILED'
  | 'LOCAL_SOURCE_PARSE_FAILED';

export const ANN_LOCAL_SOURCE_ERROR_CODES: readonly AnnLocalSourceErrorCode[] = [
  'LOCAL_ENDPOINT_NOT_CONFIGURED',
  'LOCAL_ENDPOINT_INVALID',
  'LOCAL_SOURCE_UNAVAILABLE',
  'LOCAL_SOURCE_REDIRECT_REFUSED',
  'LOCAL_SOURCE_HTTP_ERROR',
  'LOCAL_SOURCE_CONTENT_TYPE',
  'LOCAL_SOURCE_TOO_LARGE',
  'LOCAL_SOURCE_DECODE_FAILED',
  'LOCAL_SOURCE_PARSE_FAILED',
];

export class AnnLocalSourceError extends Error {
  readonly code: AnnLocalSourceErrorCode;
  constructor(code: AnnLocalSourceErrorCode) {
    super(`configured local ANN source: ${code}`);
    this.name = 'AnnLocalSourceError';
    this.code = code;
  }
}

/**
 * Returns the endpoint unchanged when it has exactly the allowed shape, else
 * throws. Rejects localhost, ::1, 0.0.0.0, 127.1, other 127/8 addresses, IP
 * aliases, LAN/public hosts, names, https, userinfo, query, fragment, other
 * or encoded paths, a trailing slash, privileged or missing ports.
 */
export function validateAnnLocalEndpoint(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '')
    throw new AnnLocalSourceError('LOCAL_ENDPOINT_NOT_CONFIGURED');
  if (typeof raw !== 'string') throw new AnnLocalSourceError('LOCAL_ENDPOINT_INVALID');
  const m = ENDPOINT_RE.exec(raw);
  const port = m ? Number(m[1]) : NaN;
  if (!m || port < 1024 || port > 65535) throw new AnnLocalSourceError('LOCAL_ENDPOINT_INVALID');
  // Belt and braces: the platform parser must agree byte-for-byte.
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AnnLocalSourceError('LOCAL_ENDPOINT_INVALID');
  }
  if (parsed.href !== raw || parsed.hostname !== '127.0.0.1' || parsed.port !== m[1])
    throw new AnnLocalSourceError('LOCAL_ENDPOINT_INVALID');
  return raw;
}

/** The subset of `fetch` this source uses (injectable for unit tests only). */
export type AnnLocalFetch = (url: string, init: RequestInit) => Promise<Response>;

/** The exact request: GET, no body, no headers, no credentials, no redirects. */
export const ANN_LOCAL_REQUEST: Readonly<RequestInit> = Object.freeze({
  method: 'GET',
  credentials: 'omit',
  redirect: 'error',
  cache: 'no-store',
  mode: 'cors',
  referrerPolicy: 'no-referrer',
});

/** `application/json`, optionally with `charset=utf-8`; nothing else. */
function isJsonUtf8(contentType: string | null): boolean {
  if (!contentType) return false;
  const [type, ...params] = contentType.split(';').map((s) => s.trim().toLowerCase());
  if (type !== 'application/json') return false;
  return params.every((p) => p === 'charset=utf-8' || p === 'charset="utf-8"');
}

async function readBounded(res: Response, max: number): Promise<Uint8Array> {
  const declared = res.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d{1,16}$/.test(declared.trim()))
      throw new AnnLocalSourceError('LOCAL_SOURCE_HTTP_ERROR');
    // Rejected before reading a byte. The declared length is never trusted as a cap.
    if (Number(declared.trim()) > max) throw new AnnLocalSourceError('LOCAL_SOURCE_TOO_LARGE');
  }
  if (!res.body) {
    // No stream exposed: the platform buffers the body; still never parsed when over the bound.
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > max) throw new AnnLocalSourceError('LOCAL_SOURCE_TOO_LARGE');
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      // Stop reading and discard everything: no truncated parse.
      await reader.cancel().catch(() => undefined);
      throw new AnnLocalSourceError('LOCAL_SOURCE_TOO_LARGE');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export class LocalSnapshotSource implements AnnFeedSource {
  readonly transport = 'local-snapshot' as const;
  private readonly endpoint: string | null;
  private readonly problem: AnnLocalSourceErrorCode | null;
  private readonly fetchImpl: AnnLocalFetch;
  private readonly maxBytes: number;

  constructor(
    endpoint: unknown,
    /** Tests only. Production uses the browser's own fetch. */
    deps: { fetch?: AnnLocalFetch; maxBytes?: number } = {},
  ) {
    let ok: string | null = null;
    let problem: AnnLocalSourceErrorCode | null = null;
    try {
      ok = validateAnnLocalEndpoint(endpoint);
    } catch (e) {
      problem = e instanceof AnnLocalSourceError ? e.code : 'LOCAL_ENDPOINT_INVALID';
    }
    this.endpoint = ok;
    this.problem = problem;
    this.fetchImpl = deps.fetch ?? ((url, init) => globalThis.fetch(url, init));
    const m = deps.maxBytes ?? ANN_LOCAL_MAX_BYTES;
    this.maxBytes =
      Number.isInteger(m) && m > 0 ? Math.min(m, ANN_LOCAL_MAX_BYTES) : ANN_LOCAL_MAX_BYTES;
  }

  /** One bounded GET. No retry: a failure is reported, and the next explicit load tries again. */
  async load(): Promise<unknown> {
    if (this.problem || !this.endpoint)
      throw new AnnLocalSourceError(this.problem ?? 'LOCAL_ENDPOINT_INVALID');
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, { ...ANN_LOCAL_REQUEST });
    } catch {
      // Network failure, CORS refusal, or a redirect stopped by `redirect: 'error'`.
      throw new AnnLocalSourceError('LOCAL_SOURCE_UNAVAILABLE');
    }
    const discard = () => res.body?.cancel().catch(() => undefined);
    if (
      res.redirected ||
      res.type === 'opaqueredirect' ||
      (res.status >= 300 && res.status < 400) ||
      (res.url !== '' && res.url !== this.endpoint)
    ) {
      void discard();
      throw new AnnLocalSourceError('LOCAL_SOURCE_REDIRECT_REFUSED');
    }
    if (res.status !== 200) {
      void discard();
      throw new AnnLocalSourceError('LOCAL_SOURCE_HTTP_ERROR');
    }
    if (!isJsonUtf8(res.headers.get('content-type'))) {
      void discard();
      throw new AnnLocalSourceError('LOCAL_SOURCE_CONTENT_TYPE');
    }
    let bytes: Uint8Array;
    try {
      bytes = await readBounded(res, this.maxBytes);
    } catch (e) {
      if (e instanceof AnnLocalSourceError) throw e;
      throw new AnnLocalSourceError('LOCAL_SOURCE_UNAVAILABLE');
    }
    // BOM policy: refused. The host serves exact file bytes, and one byte
    // sequence must have exactly one interpretation.
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
      throw new AnnLocalSourceError('LOCAL_SOURCE_DECODE_FAILED');
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new AnnLocalSourceError('LOCAL_SOURCE_DECODE_FAILED');
    }
    try {
      // Raw, untrusted value: normalizeAnnFeed is the only interpreter.
      return JSON.parse(text) as unknown;
    } catch {
      throw new AnnLocalSourceError('LOCAL_SOURCE_PARSE_FAILED');
    }
  }
}
