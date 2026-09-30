import { useSimulation } from '@/hooks/useSimulation';
import { Icon } from './Icon';

const SPEEDS = [0.5, 1, 2, 4];
/** Demo-only controls. Hidden for adapters that do not expose a simulation. */
export function SimulationControlsBar() {
  const state = useSimulation();
  if (!state) return null;
  const { sim, running, speed } = state;

  return (
    <div className="simbar" role="group" aria-label="Demo simulation controls">
      <span className="simbar__label" aria-hidden="true">
        Sim
      </span>
      <button
        type="button"
        className="icon-btn"
        onClick={() => sim.setRunning(!running)}
        aria-label={running ? 'Pause simulation' : 'Resume simulation'}
        title={running ? 'Pause simulation (P)' : 'Resume simulation (P)'}
      >
        <Icon name={running ? 'pause' : 'play'} size={14} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => sim.step()}
        aria-label="Advance one simulation step"
        title="Step (N)"
      >
        <Icon name="step" size={14} />
      </button>
      <label className="simbar__speed">
        <span className="visually-hidden">Simulation speed</span>
        <select value={speed} onChange={(e) => sim.setSpeed(Number(e.target.value))}>
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
