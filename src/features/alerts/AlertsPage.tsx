import { useState } from 'react';
import { EmptyState, Panel } from '@/components/ui';
import { openAlerts } from '@/domain/selectors';
import { ALERT_SEVERITIES, type AlertSeverity } from '@/domain/types';
import { useSnapshot } from '@/store/hooks';
import { AlertCard } from './AlertCard';

export function AlertsPage() {
  const snapshot = useSnapshot();
  const [severity, setSeverity] = useState<AlertSeverity | 'ALL'>('ALL');
  const open = openAlerts(snapshot).filter((a) => severity === 'ALL' || a.severity === severity);
  const resolved = snapshot.alerts
    .filter((a) => a.resolvedAt)
    .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''));

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">Operational alerts</div>
          <h1 className="page__title">Alerts</h1>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Filter by severity">
          {(['ALL', ...ALERT_SEVERITIES] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={severity === s}
              className="segmented__item"
              onClick={() => setSeverity(s)}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </header>

      <Panel title={`Open (${open.length})`}>
        {open.length === 0 ? (
          <EmptyState title="No open alerts">Everything is quiet on the floor.</EmptyState>
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
    </div>
  );
}
