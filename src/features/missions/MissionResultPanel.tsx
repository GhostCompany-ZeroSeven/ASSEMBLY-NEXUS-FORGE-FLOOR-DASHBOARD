import { Icon } from '@/components/Icon';
import { SimulatedTag, StatusBadge } from '@/components/ui';
import { CERT_TONE, REVIEW_STATUS_META } from '@/domain/status';
import { formatClock, missionTiming, toMs } from '@/domain/time';
import type { Mission } from '@/domain/types';
import { useSnapshot } from '@/store/hooks';

/** MISSION COMPLETE / MISSION FAILED results panel. */
export function MissionResultPanel({ mission }: { mission: Mission }) {
  const simulated = useSnapshot().provenance.mode === 'demo';
  if (!mission.result || (mission.status !== 'COMPLETE' && mission.status !== 'FAILED'))
    return null;
  const success = mission.status === 'COMPLETE';
  // Finished missions have completedAt, so the clock argument is unused.
  const t = missionTiming(mission, toMs(mission.completedAt) ?? 0);
  const r = mission.result;

  return (
    <section
      className="result"
      data-outcome={success ? 'success' : 'failure'}
      aria-labelledby={`result-${mission.id}`}
    >
      <div className="result__seal" aria-hidden="true">
        <Icon name={success ? 'check' : 'x'} size={34} />
      </div>
      <div className="result__main">
        <div className="result__eyebrow">
          {mission.id}
          {simulated && <SimulatedTag>Simulated result</SimulatedTag>}
        </div>
        <h2 className="result__title" id={`result-${mission.id}`}>
          {success ? 'MISSION COMPLETE' : 'MISSION FAILED'}
        </h2>
        <p className="result__summary">{r.summary}</p>
        <dl className="result__facts">
          <div>
            <dt>Outcome</dt>
            <dd>{r.outcome}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd className="mono">{t.elapsedMs === null ? '—' : formatClock(t.elapsedMs)}</dd>
          </div>
          <div>
            <dt>Artifacts</dt>
            <dd>{mission.artifacts.length}</dd>
          </div>
          <div>
            <dt>Review</dt>
            <dd>
              <StatusBadge tone={REVIEW_STATUS_META[mission.review.status].tone} size="sm">
                {REVIEW_STATUS_META[mission.review.status].label}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt>Certification</dt>
            <dd>
              <StatusBadge tone={CERT_TONE[mission.certification]} size="sm">
                {mission.certification.replace('_', ' ')}
              </StatusBadge>
            </dd>
          </div>
        </dl>
        {r.nextAction && (
          <div className="result__next">
            <span>Next action</span> {r.nextAction}
          </div>
        )}
      </div>
    </section>
  );
}
