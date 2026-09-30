import { describe, expect, it, vi } from 'vitest';
import { createPollingTransport } from './polling';

function manualTimers() {
  const queue: { fn: () => void; ms: number }[] = [];
  return {
    queue,
    setTimer: (fn: () => void, ms: number) => {
      queue.push({ fn, ms });
      return queue.length;
    },
    clearTimer: vi.fn(),
    async fire() {
      const next = queue.shift();
      next?.fn();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

describe('createPollingTransport', () => {
  it('polls, delivers messages and backs off on errors', async () => {
    const timers = manualTimers();
    let calls = 0;
    const poll = vi.fn(async () => {
      calls++;
      if (calls === 2) throw new Error('boom');
      return calls;
    });
    const t = createPollingTransport({ poll, intervalMs: 100, ...timers });
    const onMessage = vi.fn();
    const onError = vi.fn();
    t.start(onMessage, onError);
    await new Promise((r) => setTimeout(r, 0));
    expect(onMessage).toHaveBeenCalledWith(1);
    expect(timers.queue[0]!.ms).toBe(100);
    await timers.fire();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(timers.queue[0]!.ms).toBe(200);
    await timers.fire();
    expect(onMessage).toHaveBeenLastCalledWith(3);
    expect(timers.queue[0]!.ms).toBe(100);
    t.stop();
    expect(timers.clearTimer).toHaveBeenCalled();
  });
});
