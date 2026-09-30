import { useReducer } from 'react';
import { hasSimulationControls } from '@/adapters/types';
import { useDashboard } from '@/store/hooks';
import { Icon } from './Icon';

const SPEEDS = [0.5, 1, 2, 4];

/** Demo-only controls. Hidden for adapters that do not expose a simulation. */
export function SimulationControlsBar() {
  const { adapter } = useDashboard();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  if (!hasSimulationControls(adapter)) return null;
  const sim = adapter.simulation;
  const running = sim.isRunning();

  return (
    <div className="simbar" role="group" aria-label="Demo simulation controls">
      <span className="simbar__label">Sim</span>
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          sim.setRunning(!running);
          rerender();
        }}
        aria-label={running ? 'Pause simulation' : 'Resume simulation'}
        title={running ? 'Pause simulation' : 'Resume simulation'}
      >
        <Icon name={running ? 'pause' : 'play'} size={14} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => sim.step()}
        aria-label="Advance one simulation step"
        title="Step"
      >
        <Icon name="step" size={14} />
      </button>
      <label className="simbar__speed">
        <span className="visually-hidden">Simulation speed</span>
        <select
          value={sim.getSpeed()}
          onChange={(e) => {
            sim.setSpeed(Number(e.target.value));
            rerender();
          }}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="icon-btn"
        onClick={() => sim.reset()}
        aria-label="Reset demo scenario"
        title="Reset scenario"
      >
        <Icon name="reset" size={14} />
      </button>
    </div>
  );
}
