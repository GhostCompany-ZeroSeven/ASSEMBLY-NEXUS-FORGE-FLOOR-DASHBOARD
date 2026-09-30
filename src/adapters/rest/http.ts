/**
 * Minimal JSON-over-HTTP helper with timeout and typed, sanitized errors.
 * Error messages never include response bodies, which could carry secrets or huge payloads.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RestErrorKind = 'network' | 'timeout' | 'http' | 'malformed' | 'aborted';

export class RestRequestError extends Error {
  readonly kind: RestErrorKind;
  readonly status?: number;
  constructor(kind: RestErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'RestRequestError';
    this.kind = kind;
    this.status = status;
  }
}

export interface RequestOptions {
  fetch: FetchLike;
  timeoutMs: number;
  credentials: RequestCredentials;
  method?: 'GET' | 'POST';
  body?: unknown;
  /** External cancellation (adapter disconnect). */
  signal?: AbortSignal;
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export async function requestJson(url: string, opts: RequestOptions): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);

  let response: Response;
  try {
    response = await opts.fetch(url, {
      method: opts.method ?? 'GET',
      headers:
        opts.body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: opts.credentials,
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
    if (timedOut) throw new RestRequestError('timeout', `Timed out after ${opts.timeoutMs}ms`);
    if (opts.signal?.aborted) throw new RestRequestError('aborted', 'Request cancelled');
    throw new RestRequestError('network', 'Backend unreachable');
  }

  try {
    if (!response.ok) {
      throw new RestRequestError('http', `HTTP ${response.status}`, response.status);
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      if (timedOut) throw new RestRequestError('timeout', `Timed out after ${opts.timeoutMs}ms`);
      throw new RestRequestError('network', 'Connection interrupted while reading response');
    }
    if (text.length > MAX_BODY_BYTES) {
      throw new RestRequestError('malformed', 'Response too large');
    }
    if (text.trim() === '') return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RestRequestError('malformed', 'Response is not valid JSON');
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
