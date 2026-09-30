import { DemoAdapter } from '@/adapters/demo/DemoAdapter';

export const FIXED_NOW = Date.parse('2026-09-30T12:00:00.000Z');

/** Deterministic, non-ticking demo adapter for tests. */
export function testAdapter() {
  let now = FIXED_NOW;
  const adapter = new DemoAdapter({ autoRun: false, seed: 7, now: () => (now += 1000) });
  return adapter;
}
