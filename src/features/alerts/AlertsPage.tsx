import { useState } from 'react';
import { EmptyState, Panel } from '@/components/ui';
import { openAlerts, resourceUnavailable } from '@/domain/selectors';
import { ALERT_SEVERITIES } from '@/domain/types';
import { FilterBar, FilteredEmpty, SelectFilter } from '@/features/filters/FilterBar';
import {
  activeFilterCount,
  DEFAULT_ALERT_FILTER,
  filterAlerts,
  type AlertFilter,
} from '@/features/filters/filters';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { useSnapshot } from '@/store/hooks';
import { AlertCard } from './AlertCard';

export function AlertsPage() {
  const snapshot = useSnapshot();
  const [f, setF] = useState<AlertFilter>(DEFAULT_ALERT_FILTER);
  const set = (patch: Partial<AlertFilter>) => setF((cur) => ({ ...cur, ...patch }));
  useFocusTarget();
  const open = filterAlerts(openAlerts(snapshot), f);
  const resolved = filterAlerts(
    snapshot.alerts
      .filter((a) => a.resolvedAt)
      .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')),
    f,
  );
  const reset = () => set(DEFAULT_ALERT_FILTER);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Operational alerts</div>
          <h1 className="page__title">Alerts</h1>
        </div>
      </header>
      <FilterBar
        label="Filter alerts"
        noun="alerts"
        query={f.q}
        onQuery={(q) => set({ q })}
        quick={(['ALL', ...ALERT_SEVERITIES] as const).map((s) => ({
          value: s,
          label: s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase(),
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
              label="Sort"
              value={f.sort}
              onChange={(sort) => set({ sort })}
              options={[
                { value: 'severity', label: 'Most severe first' },
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
              ]}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={f.humanOnly}
                onChange={(e) => set({ humanOnly: e.target.checked })}
              />
              Only alerts that require human action
            </label>
          </>
        }
      />

      {open.length + resolved.length === 0 ? (
        <Panel>
          <FilteredEmpty
            total={snapshot.alerts.length}
            unavailable={resourceUnavailable(snapshot, 'alerts')}
            noun="alerts"
            onReset={reset}
            sourceEmptyText="No alerts have been raised."
          />
        </Panel>
      ) : (
        <>
          <Panel title={`Open (${open.length})`}>
            {open.length === 0 ? (
              <EmptyState title="No open alerts match">Everything shown is resolved.</EmptyState>
            ) : (
              <div className="stack">
                {open.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            )}
          </Panel>
          <Panel title={`Resolved (${resolved.length})`}>
            {resolved.length === 0 ? (
              <EmptyState title="Nothing resolved yet" />
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
