import { isStale } from '@/domain/selectors';
import { useDashboard, useNow, useSnapshot } from '@/store/hooks';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from './Icon';

const CONNECTION_TONE: Partial<Record<string, 'warning' | 'danger'>> = {
  reconnecting: 'warning',
  error: 'danger',
  closed: 'warning',
};

/**
 * Truthful connection and data-quality states. Shown under the top bar on
 * every screen. Nothing here claims health that the adapter did not report.
 */
export function DataStatusBanners() {
  const { status, error, retry } = useDashboard();
  const snapshot = useSnapshot();
  const now = useNow(5000);
  const { m, rel } = useI18n();
  const b = m.banners;
  const tone = CONNECTION_TONE[status];
  const conn = tone
    ? {
        tone,
        title: status === 'error' ? b.unavailable : status === 'closed' ? b.closed : b.reconnecting,
      }
    : undefined;
  const stale = isStale(snapshot, now);
  const { quality } = snapshot;
  const errors = quality.issues.filter((i) => i.severity === 'error');
  const warnings = quality.issues.filter((i) => i.severity === 'warning');
  const fallback = snapshot.provenance.transport === 'polling-fallback';
  if (!conn && !stale && !fallback && !quality.partial && quality.issues.length === 0) return null;

  return (
    <div className="data-banners">
      {conn && (
        <div className="data-banner" data-tone={conn.tone} role="alert">
          <Icon name="alert" size={16} />
          <div className="data-banner__text">
            <strong>{conn.title}</strong>
            {error && <span>{error}</span>}
            <span className="muted">
              {quality.lastSuccessfulSyncAt
                ? b.showingSynced(rel(quality.lastSuccessfulSyncAt, now))
                : b.showingNone}
            </span>
          </div>
          {status === 'error' && (
            <button type="button" className="btn btn--ghost" onClick={retry}>
              {b.retryNow}
            </button>
          )}
        </div>
      )}
      {!conn && fallback && (
        <div className="data-banner" data-tone="warning" role="status">
          <Icon name="activity" size={16} />
          <div className="data-banner__text">
            <strong>{b.fallbackTitle}</strong>
            <span>{b.fallbackBody}</span>
          </div>
        </div>
      )}
      {!conn && stale && (
        <div className="data-banner" data-tone="warning" role="status">
          <Icon name="clock" size={16} />
          <div className="data-banner__text">
            <strong>{b.staleTitle}</strong>
            <span>
              {quality.lastSuccessfulSyncAt
                ? b.staleSynced(rel(quality.lastSuccessfulSyncAt, now))
                : b.staleNever}{' '}
              {b.staleTail}
            </span>
          </div>
        </div>
      )}
      {(quality.partial || quality.issues.length > 0) && (
        <details
          className="data-banner data-banner--details"
          data-tone={errors.length ? 'danger' : 'warning'}
          data-show={b.showDetails}
          data-hide={b.hideDetails}
        >
          <summary>
            <Icon name="info" size={16} />
            <strong>{quality.partial ? b.partialTitle : b.warningsTitle}</strong>
            <span>{b.issuesSummary(errors.length, warnings.length)}</span>
          </summary>
          <ul className="data-banner__issues">
            {quality.issues.slice(0, 50).map((i) => (
              <li key={i.id} data-severity={i.severity}>
                <span className="mono">{i.source}</span> {i.message}
              </li>
            ))}
            {quality.issues.length > 50 && <li>{b.andMore(quality.issues.length - 50)}</li>}
          </ul>
        </details>
      )}
    </div>
  );
}
