import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MockBackend } from '../../scripts/mock/backend.ts';
import { RestAdapter } from '@/adapters/rest/RestAdapter';
import { createSseTransport, type EventSourceLike } from '@/adapters/transport/sse';
import type { ConformanceProbe, Delivery, WireEvent } from '@/domain/contract/runner';

/**
 * In-process conformance probe: the REAL RestAdapter (REST + SSE transport)
 * against the REAL Phase 7 mock backend core, wired without a network. HTTP
 * requests and the event stream are bridged in memory; nothing leaves the
 * process. MOCK target only: this is not, and cannot reach, Assembly Nexus.
 */
const BASE = 'http://mock-contract.test';

function request(
  method: string,
  body?: string,
  onClose?: (fn: () => void) => void,
): IncomingMessage {
  const r = Readable.from(body === undefined ? [] : [body]) as unknown as IncomingMessage;
  (r as { method?: string }).method = method;
  // A dropped connection (fault mode `down`) destroys the socket: nothing is replied.
  Object.defineProperty(r, 'socket', { value: { destroy: () => undefined } });
  if (onClose)
    (r as unknown as { on: (ev: string, fn: () => void) => void }).on = (ev, fn) =>
      ev === 'close' && onClose(fn);
  return r;
}

export function createMockContractProbe(): ConformanceProbe & { close(): void } {
  const backend = new MockBackend({ heartbeatMs: 200, environment: 'mock' });
  let tenant = '';
  let n = 0;
  let adapter: RestAdapter | null = null;
  const streamUrls: string[] = [];

  const control = async (path: string, body?: unknown) => {
    let status = 0;
    let out: unknown;
    await backend.control(
      tenant,
      path,
      request(
        body === undefined ? 'GET' : 'POST',
        body === undefined ? undefined : JSON.stringify(body),
      ),
      (s, b) => {
        status = s;
        out = b;
      },
    );
    if (status !== 200) throw new Error(`${path} → ${status} ${JSON.stringify(out)}`);
    return out;
  };

  const fetchBridge = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = String(input).slice(BASE.length);
    let reply: { status: number; body: unknown } | null = null;
    await backend.api(
      tenant,
      path,
      request(init?.method ?? 'GET', typeof init?.body === 'string' ? init.body : undefined),
      {} as ServerResponse,
      (status, body) => {
        reply = { status, body };
      },
    );
    if (!reply) throw new TypeError('Failed to fetch'); // connection dropped (mode `down`)
    const r = reply as { status: number; body: unknown };
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  /** EventSource over the mock's SSE writer (frames parsed as a browser would). */
  class Bridge implements EventSourceLike {
    onopen: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: { data: string; lastEventId?: string }) => void) | null = null;
    private listeners = new Map<string, ((ev: { data: string; lastEventId?: string }) => void)[]>();
    private closeFns: (() => void)[] = [];
    private closed = false;
    private buffer = '';
    constructor(url: string) {
      streamUrls.push(url);
      const res = {
        writeHead: (status: number) => {
          if (status === 200) queueMicrotask(() => !this.closed && this.onopen?.({}));
        },
        write: (chunk: string) => this.receive(chunk),
        destroy: () => queueMicrotask(() => !this.closed && this.onerror?.({})),
      } as unknown as ServerResponse;
      void backend.api(
        tenant,
        '/stream',
        request('GET', undefined, (fn) => this.closeFns.push(fn)),
        res,
        () => queueMicrotask(() => !this.closed && this.onerror?.({})),
      );
    }
    addEventListener(type: string, fn: (ev: { data: string; lastEventId?: string }) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    close() {
      this.closed = true;
      for (const fn of this.closeFns) fn();
    }
    private receive(chunk: string) {
      if (this.closed) return;
      this.buffer += chunk;
      let i: number;
      while ((i = this.buffer.indexOf('\n\n')) >= 0) {
        const frame = this.buffer.slice(0, i);
        this.buffer = this.buffer.slice(i + 2);
        let type = 'message';
        let data = '';
        let id = '';
        for (const line of frame.split('\n')) {
          const [k, ...rest] = line.split(':');
          const v = rest.join(':').replace(/^ /, '');
          if (k === 'event') type = v;
          else if (k === 'data') data += data ? `\n${v}` : v;
          else if (k === 'id') id = v;
        }
        if (!data && type === 'message') continue;
        const ev = { data, lastEventId: id };
        if (type === 'message') this.onmessage?.(ev);
        for (const fn of this.listeners.get(type) ?? []) fn(ev);
      }
    }
  }

  const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn: () => boolean, ms = 2000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await settle(10);
    }
    return fn();
  };

  return {
    target: { id: 'phase7-mock-in-process', kind: 'MOCK' },
    capabilities: { inject: true, stream: true, faults: true, window: true, observeListing: true },
    async reset() {
      adapter?.disconnect();
      tenant = `probe-${++n}`;
      streamUrls.length = 0;
      adapter = new RestAdapter(
        {
          baseUrl: BASE,
          label: 'Conformance probe (mock)',
          pollIntervalMs: 300_000,
          contractProfile: 'mock',
          stream: {
            path: '/stream',
            heartbeatTimeoutMs: 5000,
            maxRetries: 8,
            resyncIntervalMs: 300_000,
          },
        },
        {
          fetch: fetchBridge,
          createTransport: () => ({ start: () => undefined, stop: () => undefined }),
          createStream: (opts) =>
            createSseTransport({
              ...opts,
              baseRetryMs: 20,
              maxRetryMs: 80,
              createEventSource: (url) => new Bridge(url),
            }),
        },
      );
      await adapter.connect();
      await waitFor(() => adapter!.getStreamState() === 'open');
    },
    async inject(deliver: Delivery, events: WireEvent[]) {
      await control('/__mock/events', { deliver, events });
      await settle(5);
    },
    async injectRaw(text: string) {
      await control('/__mock/events', { deliver: 'stream', raw: text });
      await settle(5);
    },
    async setWindow(size) {
      await control('/__mock/fixture', { op: 'events.window', size });
    },
    async fault(resource, mode) {
      await control('/__mock/fault', { resource, mode });
    },
    async patchMission(id, fields) {
      await control('/__mock/fixture', { op: 'mission.patch', id, ...fields });
    },
    async sync() {
      await adapter!.refresh();
    },
    async listingPayload() {
      const r = await fetchBridge(`${BASE}/events`);
      return r.json();
    },
    snapshot: () => adapter!.getSnapshot(),
    async streamDown() {
      await control('/__mock/fault', { resource: 'stream', mode: 'down' });
      await waitFor(() => adapter!.getStreamState() !== 'open');
    },
    async streamUp() {
      await control('/__mock/fault', { resource: 'stream', mode: 'off' });
      return waitFor(() => adapter!.getStreamState() === 'open', 3000);
    },
    streamRequests: () => [...streamUrls],
    now: () => Date.now(),
    close() {
      adapter?.disconnect();
      backend.close();
    },
  };
}
