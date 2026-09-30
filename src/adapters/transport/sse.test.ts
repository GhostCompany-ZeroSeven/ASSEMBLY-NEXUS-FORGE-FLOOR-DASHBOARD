import { beforeEach, describe, expect, it } from 'vitest';
import { FakeEventSource } from '@/test/fakeEventSource';
import { manualTimers } from '@/test/manualTimers';
import { createSseTransport, type StreamState } from './sse';

function setup(over: { maxRetries?: number; heartbeatTimeoutMs?: number } = {}) {
  const timers = manualTimers();
  const states: StreamState[] = [];
  const t = createSseTransport({
    url: '/api/stream',
    heartbeatTimeoutMs: over.heartbeatTimeoutMs ?? 10_000,
    maxRetries: over.maxRetries ?? 3,
    baseRetryMs: 1000,
    createEventSource: (url) => new FakeEventSource(url),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onState: (s) => states.push(s),
  });
  const msgs: { type: string; data: string }[] = [];
  const errors: unknown[] = [];
  return {
    t,
    timers,
    states,
    msgs,
    errors,
    start: () =>
      t.start(
        (m) => msgs.push(m),
        (e) => errors.push(e),
      ),
  };
}

describe('SSE transport', () => {
  beforeEach(() => FakeEventSource.reset());

  it('goes connecting → open and delivers named and default events', () => {
    const s = setup();
    s.start();
    const es = FakeEventSource.latest();
    es.open();
    es.emit('forge', '{"a":1}');
    es.emit('heartbeat', '');
    es.emit('message', '{"b":2}');
    expect(s.states).toEqual(['connecting', 'open']);
    expect(s.msgs.map((m) => m.type)).toEqual(['forge', 'heartbeat', 'message']);
  });

  it('never opens a credentialed stream', () => {
    // Default factory uses withCredentials:false; the option cannot be supplied.
    const opts = Object.keys({} as Parameters<typeof createSseTransport>[0]);
    expect(opts).not.toContain('withCredentials');
  });

  it('declares the stream stale when heartbeats stop, then reconnects', async () => {
    const s = setup();
    s.start();
    FakeEventSource.latest().open();
    await s.timers.advance(10_001);
    expect(s.states).toContain('stale');
    expect(s.states.at(-1)).toBe('retrying');
    expect(FakeEventSource.latest().closed).toBe(true);
    await s.timers.advance(1000);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('bounded retries: gives up with "failed" after maxRetries consecutive errors', async () => {
    const s = setup({ maxRetries: 3 });
    s.start();
    for (let i = 0; i < 4; i++) {
      FakeEventSource.latest().error();
      await s.timers.advance(60_000);
    }
    expect(s.states.at(-1)).toBe('failed');
    expect(s.t.state()).toBe('failed');
    const count = FakeEventSource.instances.length;
    await s.timers.advance(10 * 60_000);
    expect(FakeEventSource.instances.length).toBe(count); // no reconnect storm
    expect(s.timers.pendingCount()).toBe(0);
  });

  it('exponential backoff between attempts', async () => {
    const s = setup({ maxRetries: 5 });
    s.start();
    FakeEventSource.latest().error(); // retry in 1s
    await s.timers.advance(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    await s.timers.advance(1);
    expect(FakeEventSource.instances).toHaveLength(2);
    FakeEventSource.latest().error(); // retry in 2s
    await s.timers.advance(1999);
    expect(FakeEventSource.instances).toHaveLength(2);
    await s.timers.advance(1);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('a successful open resets the failure count', async () => {
    const s = setup({ maxRetries: 2 });
    s.start();
    FakeEventSource.latest().error();
    await s.timers.advance(1000);
    FakeEventSource.latest().open();
    expect(s.t.attempts()).toBe(0);
  });

  it('resumes with the last event id', async () => {
    const s = setup();
    s.start();
    const es = FakeEventSource.latest();
    es.open();
    es.emit('forge', '{}', 'evt-42');
    es.error();
    await s.timers.advance(1000);
    expect(FakeEventSource.latest().url).toBe('/api/stream?lastEventId=evt-42');
  });

  it('rejects oversized messages', () => {
    const s = setup();
    s.start();
    const es = FakeEventSource.latest();
    es.open();
    es.emit('forge', 'x'.repeat(300 * 1024));
    expect(s.msgs).toHaveLength(0);
    expect(s.errors).toHaveLength(1);
  });

  it('stop() closes the source, clears timers and ignores late events', () => {
    const s = setup();
    s.start();
    const es = FakeEventSource.latest();
    es.open();
    s.t.stop();
    expect(es.closed).toBe(true);
    expect(s.states.at(-1)).toBe('closed');
    expect(s.timers.pendingCount()).toBe(0);
    es.emit('forge', '{}');
    expect(s.msgs).toHaveLength(0);
  });
});
