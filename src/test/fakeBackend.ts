import { buildSeedSnapshot } from '@/adapters/demo/seed';
import type { FetchLike } from '@/adapters/rest/http';

/**
 * In-memory backend speaking the Forge Floor wire format, for adapter tests.
 * Failure modes can be switched per resource.
 */
export type ResourceName = 'health' | 'workers' | 'missions' | 'approvals' | 'alerts' | 'events';
export type Failure = 'down' | 'timeout' | 'http500' | 'not-json' | { payload: unknown };

export interface FakeBackend {
  fetch: FetchLike;
  data: Record<ResourceName, unknown>;
  failures: Partial<Record<ResourceName | 'decide' | 'acknowledge', Failure>>;
  requests: {
    method: string;
    url: string;
    body?: unknown;
    credentials?: RequestCredentials;
    headers?: HeadersInit;
  }[];
  decisions: { id: string; body: Record<string, unknown> }[];
  /** Override the decision endpoint's response body. */
  decisionResponse?: (body: Record<string, unknown>) => unknown;
}

export const BASE = 'http://backend.test/api';

export function wireFromSeed(nowMs = Date.parse('2026-09-30T12:00:00Z')) {
  const s = buildSeedSnapshot(nowMs);
  return {
    health: { ...s.health, environment: 'test' },
    workers: { workers: s.workers },
    missions: { missions: s.missions },
    approvals: { approvals: s.approvals },
    alerts: { alerts: s.alerts },
    events: { events: s.events },
  } satisfies Record<ResourceName, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function createFakeBackend(): FakeBackend {
  const backend: FakeBackend = {
    data: structuredClone(wireFromSeed()),
    failures: {},
    requests: [],
    decisions: [],
    fetch: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      backend.requests.push({
        method,
        url,
        body,
        credentials: init?.credentials,
        headers: init?.headers,
      });
      const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;

      const fail = (f: Failure | undefined): Promise<Response> | null => {
        if (!f) return null;
        if (f === 'down') return Promise.reject(new TypeError('Failed to fetch'));
        if (f === 'http500') return Promise.resolve(new Response('boom', { status: 500 }));
        if (f === 'not-json')
          return Promise.resolve(new Response('<html>oops</html>', { status: 200 }));
        if (f === 'timeout') {
          return new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          });
        }
        return Promise.resolve(json(f.payload));
      };

      const decide = path.match(/^\/approvals\/([^/]+)\/decision$/);
      if (decide && method === 'POST') {
        const f = fail(backend.failures.decide);
        if (f) return f;
        const id = decodeURIComponent(decide[1]!);
        backend.decisions.push({ id, body: body ?? {} });
        const record = {
          decision: body?.decision,
          decidedBy: body?.decidedBy,
          decidedAt: '2026-09-30T12:05:00.000Z',
          note: body?.note ?? undefined,
        };
        const approvals = (backend.data.approvals as { approvals: Record<string, unknown>[] })
          .approvals;
        const a = approvals.find((x) => x.id === id);
        if (a) {
          a.status =
            { APPROVE: 'APPROVED', DENY: 'DENIED', HOLD: 'HELD' }[String(body?.decision)] ??
            a.status;
          a.decision = record;
        }
        return json(backend.decisionResponse ? backend.decisionResponse(body ?? {}) : { record });
      }
      const ack = path.match(/^\/alerts\/([^/]+)\/acknowledge$/);
      if (ack && method === 'POST') {
        const f = fail(backend.failures.acknowledge);
        if (f) return f;
        return json({ ok: true });
      }

      const name = path.replace(/^\//, '') as ResourceName;
      if (!(name in backend.data)) return new Response('not found', { status: 404 });
      return fail(backend.failures[name]) ?? json(backend.data[name]);
    },
  };
  return backend;
}
