import type { EventTransport } from './types';

/**
 * Server-Sent Events transport with explicit, bounded behaviour.
 *
 * - We manage reconnection ourselves instead of relying on the browser's
 *   unbounded automatic retry. After `maxRetries` consecutive failures the
 *   transport enters `failed`, stops, and the adapter falls back to polling.
 * - If no message or heartbeat arrives within `heartbeatTimeoutMs`, the stream
 *   is treated as `stale`, closed, and retried.
 * - Oversized messages are rejected.
 * - No credentials: `withCredentials` is always false. Authenticated streams
 *   must go through a same-origin proxy (see docs/ADAPTERS.md).
 */

export type StreamState = 'connecting' | 'open' | 'stale' | 'retrying' | 'failed' | 'closed';

export interface SseMessage {
  /** SSE event name: `message` (default), `forge` or `heartbeat`. */
  type: string;
  data: string;
  lastEventId: string;
}

/** Minimal subset of the DOM EventSource used here (injectable for tests). */
export interface EventSourceLike {
  onopen: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string; lastEventId?: string }) => void) | null;
  addEventListener(type: string, fn: (ev: { data: string; lastEventId?: string }) => void): void;
  close(): void;
}

export interface SseTransportOptions {
  url: string;
  heartbeatTimeoutMs: number;
  maxRetries: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
  maxMessageBytes?: number;
  /** Named events to listen for in addition to the default `message`. */
  eventNames?: string[];
  onState?: (state: StreamState, detail?: string) => void;
  createEventSource?: (url: string) => EventSourceLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface SseTransport extends EventTransport<SseMessage> {
  state(): StreamState;
  /** Consecutive failed attempts since the last successful open. */
  attempts(): number;
}

export function createSseTransport(opts: SseTransportOptions): SseTransport {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const create =
    opts.createEventSource ??
    ((url: string) =>
      new EventSource(url, { withCredentials: false }) as unknown as EventSourceLike);
  const baseRetry = opts.baseRetryMs ?? 1000;
  const maxRetry = opts.maxRetryMs ?? 30_000;
  const maxBytes = opts.maxMessageBytes ?? 256 * 1024;
  const names = opts.eventNames ?? ['forge', 'heartbeat'];

  let es: EventSourceLike | null = null;
  let heartbeat: unknown = null;
  let retryTimer: unknown = null;
  let current: StreamState = 'closed';
  let failures = 0;
  let running = false;
  let lastEventId = '';
  let handlers: { onMessage: (m: SseMessage) => void; onError: (e: unknown) => void } | null = null;

  const setState = (s: StreamState, detail?: string) => {
    current = s;
    opts.onState?.(s, detail);
  };

  const clearHeartbeat = () => {
    if (heartbeat !== null) clearTimer(heartbeat);
    heartbeat = null;
  };
  const armHeartbeat = () => {
    clearHeartbeat();
    heartbeat = setTimer(() => {
      heartbeat = null;
      fail('stale', `No data or heartbeat for ${opts.heartbeatTimeoutMs}ms`);
    }, opts.heartbeatTimeoutMs);
  };

  const closeSource = () => {
    if (!es) return;
    es.onopen = es.onerror = es.onmessage = null;
    es.close();
    es = null;
  };

  const fail = (kind: 'stale' | 'error', detail: string) => {
    if (!running) return;
    closeSource();
    clearHeartbeat();
    if (kind === 'stale') setState('stale', detail);
    failures += 1;
    handlers?.onError(new Error(detail));
    if (failures > opts.maxRetries) {
      running = false;
      setState('failed', `Gave up after ${failures} attempts: ${detail}`);
      return;
    }
    const delay = Math.min(maxRetry, baseRetry * 2 ** (failures - 1));
    setState('retrying', `Retry ${failures}/${opts.maxRetries} in ${delay}ms: ${detail}`);
    retryTimer = setTimer(() => {
      retryTimer = null;
      open();
    }, delay);
  };

  const deliver = (type: string, ev: { data: string; lastEventId?: string }) => {
    if (!running || !handlers) return;
    armHeartbeat();
    if (ev.lastEventId) lastEventId = ev.lastEventId;
    if (typeof ev.data !== 'string' || ev.data.length > maxBytes) {
      handlers.onError(new Error('Rejected oversized or non-text stream message'));
      return;
    }
    handlers.onMessage({ type, data: ev.data, lastEventId: ev.lastEventId ?? '' });
  };

  const open = () => {
    if (!running) return;
    setState('connecting');
    const url = lastEventId
      ? `${opts.url}${opts.url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(lastEventId)}`
      : opts.url;
    try {
      es = create(url);
    } catch (e) {
      fail('error', e instanceof Error ? e.message : 'Could not open stream');
      return;
    }
    es.onopen = () => {
      failures = 0;
      setState('open');
      armHeartbeat();
    };
    es.onerror = () => fail('error', 'Stream connection error');
    es.onmessage = (ev) => deliver('message', ev);
    for (const n of names) es.addEventListener(n, (ev) => deliver(n, ev));
    // A stream that never opens is also caught by the heartbeat timer.
    armHeartbeat();
  };

  return {
    start(onMessage, onError) {
      if (running) return;
      running = true;
      failures = 0;
      handlers = { onMessage, onError };
      open();
    },
    stop() {
      const wasActive = running || es !== null || retryTimer !== null;
      running = false;
      closeSource();
      clearHeartbeat();
      if (retryTimer !== null) clearTimer(retryTimer);
      retryTimer = null;
      handlers = null;
      if (wasActive) setState('closed');
    },
    state: () => current,
    attempts: () => failures,
  };
}
