import { Icon } from '@/components/Icon';
import { SimulatedTag, StatusBadge } from '@/components/ui';
import { CERT_TONE, REVIEW_STATUS_META } from '@/domain/status';
import { useI18n } from '@/i18n/useI18n';
import { formatClock, missionTiming, toMs } from '@/domain/time';
import type { Mission } from '@/domain/types';
import { useSnapshot } from '@/store/hooks';

/** MISSION COMPLETE / MISSION FAILED results panel. */
export function MissionResultPanel({ mission }: { mission: Mission }) {
  const simulated = useSnapshot().provenance.mode === 'demo';
  const { m } = useI18n();
  const c = m.result;
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
          {simulated && <SimulatedTag>{c.simulated}</SimulatedTag>}
        </div>
        <h2 className="result__title" id={`result-${mission.id}`}>
          {success ? c.complete : c.failed}
        </h2>
        <p className="result__summary">{r.summary}</p>
        <dl className="result__facts">
          <div>
            <dt>{c.outcome}</dt>
            <dd>{m.status.outcome[r.outcome]}</dd>
          </div>
          <div>
            <dt>{c.duration}</dt>
            <dd className="mono">{t.elapsedMs === null ? '—' : formatClock(t.elapsedMs)}</dd>
          </div>
          <div>
            <dt>{c.artifacts}</dt>
            <dd>{mission.artifacts.length}</dd>
          </div>
          <div>
            <dt>{c.review}</dt>
            <dd>
              <StatusBadge tone={REVIEW_STATUS_META[mission.review.status].tone} size="sm">
                {m.status.review[mission.review.status]}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt>{c.certification}</dt>
            <dd>
              <StatusBadge tone={CERT_TONE[mission.certification]} size="sm">
                {m.status.certification[mission.certification]}
              </StatusBadge>
            </dd>
          </div>
        </dl>
        {r.nextAction && (
          <div className="result__next">
            <span>{c.next}</span> {r.nextAction}
          </div>
        )}
      </div>
    </section>
  );
}
