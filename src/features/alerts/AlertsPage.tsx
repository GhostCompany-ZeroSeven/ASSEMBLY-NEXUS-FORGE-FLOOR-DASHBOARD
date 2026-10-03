import { useUrlState } from '@/app/urlState';
import { EmptyState, Panel } from '@/components/ui';
import { openAlerts, resourceUnavailable } from '@/domain/selectors';
import { ALERT_SEVERITIES } from '@/domain/types';
import { FilterBar, FilteredEmpty, SelectFilter } from '@/features/filters/FilterBar';
import { activeFilterCount, DEFAULT_ALERT_FILTER, filterAlerts } from '@/features/filters/filters';
import { ALERT_SCHEMA } from '@/features/filters/urlSchemas';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';
import { AlertCard } from './AlertCard';

export function AlertsPage() {
  const snapshot = useSnapshot();
  const { m } = useI18n();
  const t = m.alerts;
  // Filters, sorting and search text live in the URL (?severity=&human=1&sort=&q=).
  const [f, set] = useUrlState(DEFAULT_ALERT_FILTER, ALERT_SCHEMA);
  useFocusTarget();
  const open = filterAlerts(openAlerts(snapshot), f, m);
  const resolved = filterAlerts(
    snapshot.alerts
      .filter((a) => a.resolvedAt)
      .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')),
    f,
    m,
  );
  const reset = () => set(DEFAULT_ALERT_FILTER);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
        </div>
      </header>
      <FilterBar
        resource="alerts"
        query={f.q}
        onQuery={(q) => set({ q }, 'replace')}
        quick={(['ALL', ...ALERT_SEVERITIES] as const).map((s) => ({
          value: s,
          label: s === 'ALL' ? t.all : m.status.severity[s],
          count:
            s === 'ALL'
              ? snapshot.alerts.length
              : snapshot.alerts.filter((a) => a.severity === s).length,
        }))}
        quickValue={f.severity}
        onQuick={(severity) => set({ severity })}
        activeCount={activeFilterCount(f, DEFAULT_ALERT_FILTER)}
        onReset={reset}
        shown={open.length + resolved.length}
        total={snapshot.alerts.length}
        more={
          <>
            <SelectFilter
              label={m.filters.sort}
              value={f.sort}
              onChange={(sort) => set({ sort })}
              options={(['severity', 'newest', 'oldest'] as const).map((s) => ({
                value: s,
                label: t.sort[s],
              }))}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={f.humanOnly}
                onChange={(e) => set({ humanOnly: e.target.checked })}
              />
              {t.humanOnly}
            </label>
          </>
        }
      />

      {open.length + resolved.length === 0 ? (
        <Panel>
          <FilteredEmpty
            resource="alerts"
            total={snapshot.alerts.length}
            unavailable={resourceUnavailable(snapshot, 'alerts')}
            onReset={reset}
          />
        </Panel>
      ) : (
        <>
          <Panel family="signal" title={t.open(open.length)}>
            {open.length === 0 ? (
              <EmptyState title={t.noOpenMatch}>{t.allResolved}</EmptyState>
            ) : (
              <div className="stack">
                {open.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            )}
          </Panel>
          <Panel family="signal" title={t.resolved(resolved.length)}>
            {resolved.length === 0 ? (
              <EmptyState title={t.nothingResolved} />
            ) : (
              <div className="stack">
                {resolved.map((a) => (
                  <AlertCard key={a.id} alert={a} compact />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
