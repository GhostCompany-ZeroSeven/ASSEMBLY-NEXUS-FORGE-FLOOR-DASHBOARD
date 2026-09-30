import { useSimulation } from '@/hooks/useSimulation';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from './Icon';

const SPEEDS = [0.5, 1, 2, 4];
/** Demo-only controls. Hidden for adapters that do not expose a simulation. */
export function SimulationControlsBar() {
  const state = useSimulation();
  const t = useI18n().m.sim;
  if (!state) return null;
  const { sim, running, speed } = state;

  return (
    <div className="simbar" role="group" aria-label={t.group}>
      <span className="simbar__label" aria-hidden="true">
        {t.label}
      </span>
      <button
        type="button"
        className="icon-btn"
        onClick={() => sim.setRunning(!running)}
        aria-label={running ? t.pause : t.resume}
        title={running ? t.pauseTitle : t.resumeTitle}
      >
        <Icon name={running ? 'pause' : 'play'} size={14} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => sim.step()}
        aria-label={t.step}
        title={t.stepTitle}
      >
        <Icon name="step" size={14} />
      </button>
      <label className="simbar__speed">
        <span className="visually-hidden">{t.speed}</span>
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
        aria-label={t.reset}
        title={t.resetTitle}
      >
        <Icon name="reset" size={14} />
      </button>
    </div>
  );
}
