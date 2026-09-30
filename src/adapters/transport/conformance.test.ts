/**
 * Transport conformance: behaviour every EventTransport must share
 * (polling today, SSE today, WebSocket later).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeEventSource } from '@/test/fakeEventSource';
import { manualTimers } from '@/test/manualTimers';
import { createPollingTransport } from './polling';
import { createSseTransport } from './sse';
import type { EventTransport } from './types';

interface Subject {
  transport: EventTransport<unknown>;
  timers: ReturnType<typeof manualTimers>;
  /** Make the backend produce one message. */
  produce: () => Promise<void>;
  /** Make the backend fail once. */
  fail: () => Promise<void>;
}

function describeTransport(name: string, make: () => Subject) {
  describe(`transport conformance: ${name}`, () => {
    it('delivers messages after start', async () => {
      const s = make();
      const got: unknown[] = [];
      s.transport.start(
        (m) => got.push(m),
        () => {},
      );
      await s.produce();
      expect(got.length).toBeGreaterThan(0);
      s.transport.stop();
    });

    it('start() is idempotent (no duplicate connections)', async () => {
      const s = make();
      const got: unknown[] = [];
      s.transport.start(
        (m) => got.push(m),
        () => {},
      );
      s.transport.start(
        (m) => got.push(m),
        () => {},
      );
      await s.produce();
      expect(got.length).toBe(1);
      s.transport.stop();
    });

    it('reports errors instead of throwing', async () => {
      const s = make();
      const errors: unknown[] = [];
      s.transport.start(
        () => {},
        (e) => errors.push(e),
      );
      await s.fail();
      expect(errors.length).toBeGreaterThan(0);
      s.transport.stop();
    });

    it('stop() delivers nothing further and leaves no timers behind', async () => {
      const s = make();
      const got: unknown[] = [];
      s.transport.start(
        (m) => got.push(m),
        () => {},
      );
      s.transport.stop();
      const before = got.length;
      await s.timers.advance(10 * 60_000);
      await s.produce().catch(() => {});
      expect(got.length).toBe(before);
      expect(s.timers.pendingCount()).toBe(0);
      expect(() => s.transport.stop()).not.toThrow();
    });

    it('backs off after failures instead of storming', async () => {
      const s = make();
      const errors: unknown[] = [];
      s.transport.start(
        () => {},
        (e) => errors.push(e),
      );
      for (let i = 0; i < 4; i++) await s.fail();
      // Within one second of simulated time there must be no burst of retries.
      const burst = errors.length;
      await s.timers.advance(1000);
      expect(errors.length - burst).toBeLessThanOrEqual(1);
      s.transport.stop();
    });
  });
}

describeTransport('polling', () => {
  const timers = manualTimers();
  let mode: 'ok' | 'fail' = 'ok';
  let n = 0;
  const transport = createPollingTransport<number>({
    intervalMs: 5000,
    poll: async () => {
      if (mode === 'fail') throw new Error('down');
      return ++n;
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return {
    transport,
    timers,
    produce: async () => {
      mode = 'ok';
      await Promise.resolve();
      await Promise.resolve();
    },
    fail: async () => {
      mode = 'fail';
      await new Promise((r) => setTimeout(r, 0)); // let the in-flight poll reschedule
      await timers.advance(60_000);
    },
  };
});

describe('sse', () => {
  beforeEach(() => FakeEventSource.reset());
  describeTransport('sse', () => {
    const timers = manualTimers();
    const transport = createSseTransport({
      url: '/stream',
      heartbeatTimeoutMs: 20_000,
      maxRetries: 50,
      createEventSource: (url) => new FakeEventSource(url),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    return {
      transport,
      timers,
      produce: async () => {
        const es = FakeEventSource.latest();
        es.open();
        es.emit('forge', '{"x":1}');
      },
      fail: async () => {
        FakeEventSource.latest().error();
        await Promise.resolve();
      },
    };
  });
});
