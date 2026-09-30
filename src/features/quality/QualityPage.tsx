import type { ReactNode } from 'react';
import { FreshnessLine } from '@/components/FreshnessLine';
import { KeyValue, Panel } from '@/components/ui';
import { computeDigest } from '@/domain/digest';
import { selectDataQuality } from '@/domain/dataQuality';
import { selectFreshness } from '@/domain/freshness';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { useI18n } from '@/i18n/useI18n';
import { useDashboard, useLastView, useMissionViews, useNow, useSnapshot } from '@/store/hooks';

/**
 * Data-quality inspector: why a page says UNKNOWN, STALE, PARTIAL or LAST
 * KNOWN, one dimension at a time. Read-only; it shows no credentials,
 * addresses or stack traces, only normalized facts and adapter messages.
 */
export function QualityPage() {
  const snapshot = useSnapshot();
  const { status } = useDashboard();
  const lastView = useLastView();
  const views = useMissionViews();
  const now = useNow(5000);
  const { m, num, dateTime, rel, duration } = useI18n();
  const t = m.quality;
  useFocusTarget();
  const freshness = selectFreshness(snapshot, status, now);
  const r = selectDataQuality(snapshot, freshness, status, now);
  const digest = computeDigest(snapshot, lastView.baseline);
  const time = (iso: string | undefined, fallback: string): ReactNode =>
    iso ? (
      <time dateTime={iso} title={dateTime(iso)}>
        {dateTime(iso)} ({rel(iso, now)})
      </time>
    ) : (
      fallback
    );
  const viaText = (v: string | undefined) =>
    v ? m.activity.via[v as keyof typeof m.activity.via] : t.unrecorded;

  return (
    <div className="page quality">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
          <p className="page__lede">{t.lede}</p>
        </div>
        <FreshnessLine freshness={freshness} />
      </header>

      <div className="grid grid--settings">
        <Panel title={t.source} focusId="source">
          <KeyValue
            items={[
              [t.adapter, <span translate="no">{r.adapterLabel}</span>],
              ...(r.environment
                ? ([[t.environment, <span translate="no">{r.environment}</span>]] as [
                    ReactNode,
                    ReactNode,
                  ][])
                : []),
              [t.verified, r.verifiedBackend ? t.yes : t.no],
              [
                t.transport,
                r.transport ? m.provenance.transport[r.transport] : m.common.notReported,
              ],
              [t.connection, m.connection[r.connection] ?? r.connection],
            ]}
          />
        </Panel>

        <Panel title={t.freshness} focusId="freshness">
          <KeyValue
            items={[
              [
                t.lastSync,
                r.freshness.staleAfterMs === undefined && !r.freshness.lastSuccessfulSyncAt
                  ? t.notApplicable
                  : time(r.freshness.lastSuccessfulSyncAt, t.never),
              ],
              [
                t.staleAfter,
                r.freshness.staleAfterMs === undefined
                  ? t.notApplicable
                  : duration(r.freshness.staleAfterMs),
              ],
              [t.staleNow, r.freshness.stale ? t.yes : t.no],
              [t.generatedAt, time(r.freshness.generatedAt, m.common.unknown)],
            ]}
          />
        </Panel>

        <Panel title={t.resources} focusId="resources">
          <ul className="quality__resources">
            {r.resources.map((x) => (
              <li key={x.name} data-available={x.available ? 'true' : 'false'}>
                <strong>{m.brief.resource[x.name] ?? x.name}</strong>:{' '}
                {x.available ? t.loaded : <strong>{t.unavailable}</strong>}
                {x.issues > 0 && <span className="muted"> · {t.issueCount(num(x.issues))}</span>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t.history} focusId="history">
          <KeyValue
            items={[
              [t.history, t.retained(num(r.history.retained), num(r.history.capacity))],
              [t.oldest, time(r.history.oldestAt, t.noEvents)],
              [t.newest, time(r.history.newestAt, t.noEvents)],
              [
                t.coverageSinceView,
                <span data-coverage={digest.eventCoverage}>
                  {m.coverage.state[digest.eventCoverage]}
                </span>,
              ],
              [
                t.lastEvent,
                r.lastEvent
                  ? t.eventDetail(
                      dateTime(r.lastEvent.at),
                      r.lastEvent.receivedAt ? dateTime(r.lastEvent.receivedAt) : t.unrecorded,
                      viaText(r.lastEvent.via),
                    )
                  : t.noEvents,
              ],
              [
                t.lastReceived,
                r.lastReceived
                  ? t.eventDetail(
                      dateTime(r.lastReceived.at),
                      dateTime(r.lastReceived.receivedAt),
                      viaText(r.lastReceived.via),
                    )
                  : t.noEvents,
              ],
            ]}
          />
          {r.history.atCapacity && <p className="small muted">{t.atCapacity}</p>}
          <h3 className="brief__subhead">{t.ingest}</h3>
          <ul className="quality__ingest">
            {(['stream', 'poll', 'simulated', 'unrecorded'] as const).map((k) => (
              <li key={k}>
                {k === 'unrecorded' ? t.unrecorded : m.activity.viaOption[k]}:{' '}
                <strong>{num(r.ingest[k])}</strong>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t.issuesTitle} className="span-2" focusId="issues">
          {r.issues.length === 0 ? (
            <p className="brief__calm">{t.noIssues}</p>
          ) : (
            <ul className="quality__issues">
              {r.issues.map((i, n) => (
                <li key={n} data-class={i.class} data-severity={i.severity}>
                  <strong>{t.issueClass[i.class]}</strong>{' '}
                  <span className="mono" translate="no">
                    {i.source}
                  </span>
                  <details>
                    <summary>{t.message}</summary>
                    <span className="small" translate="no">
                      {i.message}
                    </span>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {r.moreIssues > 0 && <p className="small muted">{t.moreIssues(num(r.moreIssues))}</p>}
        </Panel>

        <Panel title={t.storage} className="span-2" focusId="storage">
          <KeyValue
            items={[
              [t.globalView, t.storageState[lastView.storage]],
              [t.missionViews, t.storageState[views.storage]],
            ]}
          />
          <button type="button" className="btn btn--ghost" onClick={views.forgetAll}>
            {t.forgetMissionViews}
          </button>
        </Panel>
      </div>
    </div>
  );
}
