import { href } from '@/app/router';
import { Icon } from '@/components/Icon';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';

/**
 * Red Alert strip shown under the top bar while an unacknowledged CRITICAL
 * alert exists. Static red treatment — no strobing. The shell also switches
 * to its red-alert palette via `data-red-alert`.
 */
export function RedAlertBanner() {
  const snapshot = useSnapshot();
  const t = useI18n().m.redAlert;
  const critical = snapshot.alerts.filter(
    (a) => a.severity === 'CRITICAL' && !a.resolvedAt && !a.acknowledgedAt,
  );
  const first = critical[0];
  if (!first) return null;
  return (
    <div className="red-alert" role="alert">
      <Icon name="alert" size={20} />
      <div className="red-alert__text">
        <strong>{t.title}</strong>
        <span>
          {first.title}
          {critical.length > 1 && t.more(critical.length - 1)}
        </span>
        {first.humanActionRequired && <span className="red-alert__action">{t.humanAction}</span>}
      </div>
      <a className="btn btn--danger" href={href.alerts()}>
        {t.review}
      </a>
    </div>
  );
}
