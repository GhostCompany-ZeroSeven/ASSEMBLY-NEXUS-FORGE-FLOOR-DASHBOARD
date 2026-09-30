/** Deterministic timer harness for transport tests. */
export function manualTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number): unknown => {
      const id = ++seq;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => {
      pending.delete(h as number);
    },
    /** Number of timers still scheduled (leak detection). */
    pendingCount: () => pending.size,
    now: () => now,
    /** Advance time, firing due timers in order (including ones they schedule). */
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const next = [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        pending.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        // Let async work started by the timer settle (real macrotask, not a manual timer).
        await new Promise((r) => setTimeout(r, 0));
      }
      now = target;
    },
  };
}
