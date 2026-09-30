import type { EventTransport } from './types';

export interface PollingOptions<T> {
  /** Performs one fetch. Receives an AbortSignal for cancellation. */
  poll: (signal: AbortSignal) => Promise<T>;
  intervalMs: number;
  /** Maximum backoff after consecutive errors. */
  maxBackoffMs?: number;
  /** Injected for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Reference polling transport with exponential backoff on errors.
 * Polls never overlap: the next poll is scheduled after the previous settles.
 */
export function createPollingTransport<T>(options: PollingOptions<T>): EventTransport<T> {
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const maxBackoff = options.maxBackoffMs ?? 60_000;

  let handle: unknown = null;
  let controller: AbortController | null = null;
  let running = false;
  let failures = 0;

  const schedule = (ms: number, run: () => void) => {
    handle = setTimer(run, ms);
  };

  return {
    start(onMessage, onError) {
      if (running) return;
      running = true;
      const tick = async () => {
        if (!running) return;
        controller = new AbortController();
        try {
          const message = await options.poll(controller.signal);
          if (!running) return;
          failures = 0;
          onMessage(message);
        } catch (error) {
          if (!running) return;
          failures += 1;
          onError(error);
        }
        const delay =
          failures === 0
            ? options.intervalMs
            : Math.min(maxBackoff, options.intervalMs * 2 ** failures);
        schedule(delay, () => void tick());
      };
      void tick();
    },
    stop() {
      running = false;
      controller?.abort();
      if (handle !== null) clearTimer(handle);
      handle = null;
    },
  };
}
