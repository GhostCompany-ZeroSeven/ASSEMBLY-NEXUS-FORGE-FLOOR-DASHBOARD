import { useSyncExternalStore } from 'react';
import { hasSimulationControls, type SimulationControls } from '@/adapters/types';
import { useDashboard } from '@/store/hooks';

const noop = () => () => undefined;

/** Subscribe to demo simulation state. Returns null for adapters without a simulation. */
export function useSimulation(): {
  sim: SimulationControls;
  running: boolean;
  speed: number;
} | null {
  const { adapter } = useDashboard();
  const sim = hasSimulationControls(adapter) ? adapter.simulation : null;
  const running = useSyncExternalStore(sim ? sim.onChange : noop, () => sim?.isRunning() ?? false);
  const speed = useSyncExternalStore(sim ? sim.onChange : noop, () => sim?.getSpeed() ?? 1);
  return sim ? { sim, running, speed } : null;
}
