import { useContext, useSyncExternalStore } from 'react';
import { ConfigContext, DashboardContext, PreferencesContext } from './contexts';
import type { DashboardSnapshot } from '@/domain/snapshot';

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return ctx;
}

/** Snapshot accessor for components rendered only after the first snapshot. */
export function useSnapshot(): DashboardSnapshot {
  const { snapshot } = useDashboard();
  if (!snapshot) throw new Error('Snapshot not loaded yet');
  return snapshot;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used inside <ConfigProvider>');
  return ctx;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}

/**
 * Shared wall clocks: ONE interval per tick rate for the whole app, however many
 * cards display a timer (was one interval per component). The interval stops
 * when the last subscriber unmounts.
 */
const clocks = new Map<
  number,
  { now: number; subs: Set<() => void>; handle: ReturnType<typeof setInterval> | null }
>();

function clockFor(intervalMs: number) {
  let c = clocks.get(intervalMs);
  if (!c) {
    c = { now: Date.now(), subs: new Set(), handle: null };
    clocks.set(intervalMs, c);
  }
  return c;
}

function subscribeClock(intervalMs: number, cb: () => void): () => void {
  const c = clockFor(intervalMs);
  c.subs.add(cb);
  if (c.handle === null) {
    c.now = Date.now();
    c.handle = setInterval(() => {
      c.now = Date.now();
      for (const s of c.subs) s();
    }, intervalMs);
  }
  return () => {
    c.subs.delete(cb);
    if (c.subs.size === 0 && c.handle !== null) {
      clearInterval(c.handle);
      c.handle = null;
    }
  };
}

// Stable subscribe function per rate, so React never resubscribes on re-render.
const subscribers = new Map<number, (cb: () => void) => () => void>();
function subscriberFor(intervalMs: number) {
  let fn = subscribers.get(intervalMs);
  if (!fn) {
    fn = (cb) => subscribeClock(intervalMs, cb);
    subscribers.set(intervalMs, fn);
  }
  return fn;
}

/** Wall clock that re-renders every `intervalMs`. Drives timers. */
export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(subscriberFor(intervalMs), () => clockFor(intervalMs).now);
}

/** Test/diagnostic hook: number of running shared clock intervals. */
export function activeClockCount(): number {
  return [...clocks.values()].filter((c) => c.handle !== null).length;
}
