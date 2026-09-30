import { useMemo } from 'react';
import { KeyValue, Panel } from '@/components/ui';
import { observeSession } from '@/domain/contract/observe';
import { activeProfile, profileAssuresHistory } from '@/domain/contract/profiles';
import { RULE_IDS, RULES } from '@/domain/contract/rules';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { arrivedOutOfOrder } from '@/features/activity/filter';
import { useI18n } from '@/i18n/useI18n';

/**
 * Adapter contract, one rule at a time: what the build-declared profile
 * STATES (with its provenance), what THIS SESSION showed, and what remains
 * unknown. Read-only and passive: it runs no probe and makes no request.
 * No aggregate score; nothing here is authority, certification or approval.
 */
export function ContractPanel({ snapshot, now }: { snapshot: DashboardSnapshot; now: number }) {
  const { m, num } = useI18n();
  const t = m.contract;
  const profile = activeProfile(snapshot.provenance);
  const lateCount = useMemo(() => arrivedOutOfOrder(snapshot.events).size, [snapshot.events]);
  const observed = observeSession(snapshot, now, lateCount);
  const assured = profileAssuresHistory(profile);
  const env = snapshot.provenance.mode === 'demo' ? undefined : snapshot.provenance.environment;

  return (
    <Panel title={t.title} className="span-2 contract" focusId="contract" id="contract">
      <p className="muted small">{t.lede}</p>
      <div className="contract__profile" data-profile-kind={profile.kind}>
        <span className="contract__kind">{t.kind[profile.kind]}</span>
        <span className="mono small" translate="no">
          {profile.id}
        </span>
        <p className="small">{t.kindNote[profile.kind]}</p>
      </div>
      <KeyValue
        items={[
          [
            t.provenanceLabel,
            <span data-provenance={profile.provenance}>{t.provenance[profile.provenance]}</span>,
          ],
          [t.approval, <span data-founder-approved="false">{t.notApproved}</span>],
          [
            t.coverage,
            <span data-history-assured={assured ? 'true' : 'false'}>
              {assured ? t.coverageYes : t.coverageNo}
            </span>,
          ],
          [
            t.environment,
            <span data-environment={env ?? ''}>
              {env ? <span translate="no">{env}</span> : t.environmentNone}
            </span>,
          ],
        ]}
      />
      <p className="small muted">{t.environmentNote}</p>

      <h3 className="brief__subhead">{t.rules}</h3>
      <ul className="contract__rules">
        {RULE_IDS.map((id) => {
          const def = RULES[id];
          const clause = profile.clauses[id];
          const o = observed[id];
          return (
            <li key={id} data-rule={id} data-guarantee={clause.guarantee} data-observed={o.status}>
              <div className="contract__rule-head">
                <strong>{t.rule[id].name}</strong>{' '}
                <span className="mono small" translate="no">
                  {id}
                </span>
                {def.historyTruth && <span className="chip">{t.historyTruth}</span>}
              </div>
              <p className="small muted">{t.rule[id].description}</p>
              <KeyValue
                items={[
                  [t.needs, t.requirement[def.requirement]],
                  [
                    t.states,
                    <>
                      {t.guarantee[clause.guarantee]}
                      {clause.capability && <> · {t.capability[clause.capability]}</>}
                      {clause.note && <> · {t.note[clause.note]}</>}
                    </>,
                  ],
                  [
                    t.observedLabel,
                    o.status === 'violation-observed' || o.status === 'observed'
                      ? t.observed[o.status](num(o.count))
                      : t.observed[o.status],
                  ],
                ]}
              />
            </li>
          );
        })}
      </ul>
      <p className="small muted">{t.runnerNote}</p>
    </Panel>
  );
}
