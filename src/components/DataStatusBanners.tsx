import { isStale } from '@/domain/selectors';
import { formatRelative } from '@/domain/time';
import { useDashboard, useNow, useSnapshot } from '@/store/hooks';
import { Icon } from './Icon';

const CONNECTION_COPY: Partial<Record<string, { title: string; tone: 'warning' | 'danger' }>> = {
  reconnecting: { title: 'Reconnecting: backend not responding', tone: 'warning' },
  error: { title: 'Data source unavailable', tone: 'danger' },
  closed: { title: 'Connection closed', tone: 'warning' },
};

/**
 * Truthful connection and data-quality states. Shown under the top bar on
 * every screen. Nothing here claims health that the adapter did not report.
 */
export function DataStatusBanners() {
  const { status, error, retry } = useDashboard();
  const snapshot = useSnapshot();
  const now = useNow(5000);
  const conn = CONNECTION_COPY[status];
  const stale = isStale(snapshot, now);
  const { quality } = snapshot;
  const errors = quality.issues.filter((i) => i.severity === 'error');
  const warnings = quality.issues.filter((i) => i.severity === 'warning');
  if (!conn && !stale && !quality.partial && quality.issues.length === 0) return null;

  return (
    <div className="data-banners">
      {conn && (
        <div className="data-banner" data-tone={conn.tone} role="alert">
          <Icon name="alert" size={16} />
          <div className="data-banner__text">
            <strong>{conn.title}</strong>
            {error && <span>{error}</span>}
            <span className="muted">
              Showing{' '}
              {quality.lastSuccessfulSyncAt
                ? `data last synced ${formatRelative(quality.lastSuccessfulSyncAt, now)}`
                : 'no verified data'}
              . Retrying automatically.
            </span>
          </div>
          {status === 'error' && (
            <button type="button" className="btn btn--ghost" onClick={retry}>
              Retry now
            </button>
          )}
        </div>
      )}
      {!conn && stale && (
        <div className="data-banner" data-tone="warning" role="status">
          <Icon name="clock" size={16} />
          <div className="data-banner__text">
            <strong>STALE DATA</strong>
            <span>
              {quality.lastSuccessfulSyncAt
                ? `Last complete sync ${formatRelative(quality.lastSuccessfulSyncAt, now)}.`
                : 'No complete sync has succeeded yet.'}{' '}
              Values may no longer reflect reality.
            </span>
          </div>
        </div>
      )}
      {(quality.partial || quality.issues.length > 0) && (
        <details
          className="data-banner data-banner--details"
          data-tone={errors.length ? 'danger' : 'warning'}
        >
          <summary>
            <Icon name="info" size={16} />
            <strong>{quality.partial ? 'PARTIAL DATA' : 'DATA WARNINGS'}</strong>
            <span>
              {errors.length} error{errors.length === 1 ? '' : 's'}, {warnings.length} warning
              {warnings.length === 1 ? '' : 's'} while reading the data source. Affected records are
              hidden or marked UNKNOWN, never shown as healthy.
            </span>
          </summary>
          <ul className="data-banner__issues">
            {quality.issues.slice(0, 50).map((i) => (
              <li key={i.id} data-severity={i.severity}>
                <span className="mono">{i.source}</span> {i.message}
              </li>
            ))}
            {quality.issues.length > 50 && <li>…and {quality.issues.length - 50} more</li>}
          </ul>
        </details>
      )}
    </div>
  );
}
