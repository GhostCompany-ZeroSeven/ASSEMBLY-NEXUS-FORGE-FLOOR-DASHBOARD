import { Panel, SimulatedTag, StatusBadge } from '@/components/ui';
import { selectHealthReport } from '@/domain/operational';
import { isStale } from '@/domain/selectors';
import { healthTone } from '@/domain/status';
import { useI18n } from '@/i18n/useI18n';
import { useDashboard, useNow, useSnapshot } from '@/store/hooks';

/**
 * Reported system health, explained (Phase 14): the status as REPORTED by the
 * data source (simulated in demo), each component's status in words (never
 * colour alone), the reasons for a non-nominal status, and what no report
 * covers. A rendered frontend proves nothing about the wider ecosystem.
 */
export function HealthReportPanel({ title }: { title: string }) {
  const snapshot = useSnapshot();
  const now = useNow(5000);
  const { m, num, rel, dateTime } = useI18n();
  const t = m.ops.health;
  const { status: connection } = useDashboard();
  const r = selectHealthReport(snapshot);
  // Same rule as the Command Center cell: a stale, partial, disconnected or
  // simulated "Nominal" never shows as real-looking lime health.
  const stale = isStale(snapshot, now);
  const tone = healthTone({
    status: r.status,
    connection,
    stale,
    partial: snapshot.quality.partial,
    simulated: r.simulated,
  });
  return (
    <Panel family="systems" title={title} id="health" tone={tone} focusId="health">
      <div className="health">
        <StatusBadge tone={tone} size="lg">
          {m.status.health[r.status]}
        </StatusBadge>
        {r.simulated && <SimulatedTag />}
        <span className="small muted">
          {r.checkedAt ? (
            <>
              {t.checked}{' '}
              <time dateTime={r.checkedAt} title={dateTime(r.checkedAt)}>
                {rel(r.checkedAt, now)}
              </time>
            </>
          ) : (
            `${t.checked}: ${m.common.unknown}`
          )}
        </span>
      </div>
      <p className="small" data-testid="health-source">
        <span className="muted">{t.reportedBy}:</span>{' '}
        <span translate="no">{snapshot.provenance.adapterLabel}</span>
        {r.simulated && <span className="muted"> · {t.simulated}</span>}
      </p>
      {r.status !== 'NOMINAL' && r.status !== 'UNKNOWN' && (
        <p className="small" data-testid="health-why">
          <strong>{t.reasons}:</strong>{' '}
          {r.unexplained
            ? t.unexplained
            : r.reasons
                .map(
                  (c) =>
                    `${c.label}: ${m.status.health[c.status]}${c.detail ? ` (${c.detail})` : ''}`,
                )
                .join('; ')}
        </p>
      )}
      {r.components.length > 0 ? (
        <ul className="health-list" aria-label={t.components}>
          {r.components.map((c) => (
            <li key={c.id} data-status={c.status}>
              <StatusBadge
                tone={healthTone({ status: c.status, stale, simulated: r.simulated })}
                size="sm"
              >
                {m.status.health[c.status]}
              </StatusBadge>
              <span>{c.label}</span>
              {c.detail && <span className="small muted">{c.detail}</span>}
              {typeof c.latencyMs === 'number' && (
                <span className="mono small">{m.common.milliseconds(num(c.latencyMs))}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">{t.noReasons}</p>
      )}
      <details className="health-gaps">
        <summary className="small">{t.notCovered}</summary>
        <ul className="plain-list small muted">
          {r.notCovered.map((k) => (
            <li key={k} data-not-covered={k}>
              {t.item[k]}
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}
