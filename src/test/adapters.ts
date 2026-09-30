import { RestAdapter } from '@/adapters/rest/RestAdapter';
import { BASE, createFakeBackend, type FakeBackend } from './fakeBackend';

const FIXED = Date.parse('2026-09-30T12:00:00.000Z');

/** RestAdapter wired to an in-memory backend with manual (no-op) polling. */
export function restTestAdapter(
  backend: FakeBackend = createFakeBackend(),
  clock = { now: FIXED },
) {
  const adapter = new RestAdapter(
    {
      baseUrl: BASE,
      label: 'Test REST backend',
      pollIntervalMs: 5000,
      requestTimeoutMs: 500,
      endpoints: { decide: '/approvals/:id/decision', acknowledge: '/alerts/:id/acknowledge' },
    },
    {
      fetch: backend.fetch,
      now: () => clock.now,
      createTransport: () => ({ start: () => undefined, stop: () => undefined }),
    },
  );
  return { adapter, backend, clock };
}

import { createSseTransport } from '@/adapters/transport/sse';
import { FakeEventSource } from './fakeEventSource';
import { manualTimers } from './manualTimers';

/** RestAdapter with an SSE stream backed by FakeEventSource and manual timers. */
export function restStreamTestAdapter(backend: FakeBackend = createFakeBackend(), maxRetries = 2) {
  const timers = manualTimers();
  const clock = { now: FIXED };
  const adapter = new RestAdapter(
    {
      baseUrl: BASE,
      label: 'Test REST+SSE backend',
      pollIntervalMs: 5000,
      requestTimeoutMs: 500,
      endpoints: { decide: '/approvals/:id/decision', acknowledge: '/alerts/:id/acknowledge' },
      stream: { path: '/stream', heartbeatTimeoutMs: 10_000, maxRetries, resyncIntervalMs: 60_000 },
    },
    {
      fetch: backend.fetch,
      now: () => clock.now,
      createTransport: () => ({ start: () => undefined, stop: () => undefined }),
      createStream: (opts) =>
        createSseTransport({
          ...opts,
          createEventSource: (url) => new FakeEventSource(url),
          setTimer: timers.setTimer,
          clearTimer: timers.clearTimer,
        }),
    },
  );
  return { adapter, backend, clock, timers };
}
