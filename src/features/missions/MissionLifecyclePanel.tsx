import { Panel } from '@/components/ui';
import { missionLifecycle, type LadderState } from '@/domain/operational';
import type { Tone } from '@/domain/status';
import type { Mission } from '@/domain/types';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';

const TONE: Record<LadderState, Tone> = {
  DONE: 'success',
  SUBMITTED: 'info',
  IN_PROGRESS: 'active',
  PENDING: 'warning',
  BLOCKED: 'danger',
  FAILED: 'danger',
  CANCELLED: 'muted',
  NOT_REQUIRED: 'muted',
  NOT_REQUESTED: 'muted',
  EVIDENCE_REPORTED: 'info',
  NOT_REPORTED: 'muted',
  NOT_TRACKED: 'muted',
  UNKNOWN: 'neutral',
};

/**
 * The false-green guard on the mission page: work, tests, review,
 * certification, Founder decision and deployment, each from its own field.
 * No step is inferred from another and there is no readiness percentage.
 */
export function MissionLifecyclePanel({ mission }: { mission: Mission }) {
  const snapshot = useSnapshot();
  const { m } = useI18n();
  const t = m.ops.ladder;
  const rungs = missionLifecycle(mission, snapshot);
  return (
    <Panel title={t.title} className="span-3" focusId="lifecycle" id="mission-lifecycle">
      <p className="small muted">{t.lede}</p>
      <ol className="ladder">
        {rungs.map((r) => {
          const label = t.stepState[r.step]?.[r.state] ?? t.state[r.state];
          return (
            <li
              key={r.step}
              className="ladder__rung"
              data-step={r.step}
              data-state={r.state}
              data-tone={TONE[r.state]}
            >
              <span className="ladder__step">{t.step[r.step]}</span>
              <span className="ladder__state">{label}</span>
              {r.simulated && <span className="sim-tag">{t.simulated}</span>}
              {r.step === 'tests' && r.evidence.length > 0 && (
                <span className="ladder__evidence small muted">
                  {t.evidence}:{' '}
                  <span className="mono" translate="no">
                    {r.evidence.join(', ')}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="small muted">
        {t.testsNote} {t.deploymentNote}
      </p>
    </Panel>
  );
}
