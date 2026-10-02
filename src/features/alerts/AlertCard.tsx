import { useState } from 'react';
import { href, withQuery } from '@/app/router';
import { Icon } from '@/components/Icon';
import { ActionClassTag } from '@/components/ActionClassTag';
import { StatusBadge } from '@/components/ui';
import { classifyOperation } from '@/domain/operational';
import { ALERT_SEVERITY_META } from '@/domain/status';
import { useI18n } from '@/i18n/useI18n';
import type { Alert } from '@/domain/types';
import { useConfig, useDashboard, useNow, useSnapshot } from '@/store/hooks';

function affectedHref(a: Alert['affected'][number]): string | undefined {
  switch (a.kind) {
    case 'mission':
      return href.mission(a.id);
    case 'worker':
      return href.worker(a.id);
    case 'approval':
      return withQuery(href.approvals(), { focus: a.id });
    case 'system':
      // System components are shown in the Command Center health panel.
      return withQuery(href.command(), { focus: 'health' });
  }
}

/**
 * Structured alert: WHAT HAPPENED / WHAT IS AFFECTED / WHAT NEEDS ATTENTION /
 * WHETHER HUMAN ACTION IS REQUIRED.
 */
export function AlertCard({ alert, compact = false }: { alert: Alert; compact?: boolean }) {
  const meta = ALERT_SEVERITY_META[alert.severity];
  const { acknowledgeAlert, adapter } = useDashboard();
  const { governance } = useConfig();
  const now = useNow(5000);
  const { m, rel } = useI18n();
  const t = m.alert;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const state = alert.resolvedAt ? 'resolved' : alert.acknowledgedAt ? 'acknowledged' : 'open';
  const action = classifyOperation('alert-acknowledge', {
    mode: useSnapshot().provenance.mode,
    capabilities: adapter.capabilities,
  });

  const ack = async () => {
    setBusy(true);
    setErr(null);
    try {
      await acknowledgeAlert(alert.id, governance.humanAuthority);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="alert-card"
      data-severity={alert.severity}
      data-state={state}
      data-focus-id={alert.id}
      aria-labelledby={`alert-title-${alert.id}`}
    >
      <header className="alert-card__head">
        <StatusBadge tone={meta.tone} pulse={state === 'open' && alert.severity === 'CRITICAL'}>
          {m.status.severity[alert.severity]}
        </StatusBadge>
        <h3 className="alert-card__title" id={`alert-title-${alert.id}`}>
          {alert.title}
        </h3>
        <span className="alert-card__time">
          <span className="mono">{alert.id}</span> · {rel(alert.raisedAt, now)} ·{' '}
          <a className="target" href={withQuery(href.activity(), { alert: alert.id })}>
            {m.activity.openTimeline}
          </a>
        </span>
      </header>
      {!compact && (
        <dl className="alert-card__grid">
          <div>
            <dt>{t.whatHappened}</dt>
            <dd>{alert.whatHappened || '—'}</dd>
          </div>
          <div>
            <dt>{t.affected}</dt>
            <dd>
              {alert.affected.length === 0
                ? '—'
                : alert.affected.map((a) => {
                    const link = affectedHref(a);
                    return (
                      <span key={`${a.kind}:${a.id}`} className="chip">
                        {link ? <a href={link}>{a.label}</a> : a.label}
                      </span>
                    );
                  })}
            </dd>
          </div>
          <div>
            <dt>{t.attention}</dt>
            <dd>{alert.attention || '—'}</dd>
          </div>
          <div>
            <dt>{t.humanAction}</dt>
            <dd>
              {alert.humanActionRequired ? (
                <strong className="text-warning">{t.yesWho(governance.humanAuthority)}</strong>
              ) : (
                m.common.no
              )}
            </dd>
          </div>
        </dl>
      )}
      <footer className="alert-card__foot">
        {state === 'resolved' && (
          <span className="muted">{t.resolved(rel(alert.resolvedAt!, now))}</span>
        )}
        {state === 'acknowledged' && (
          <span className="muted">{t.acknowledged(rel(alert.acknowledgedAt!, now))}</span>
        )}
        {state === 'open' && adapter.capabilities.alertAcknowledgement && (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={ack}
              disabled={busy}
              data-action-class={action.cls}
              title={action.cls === 'DEMO_SIMULATION' ? m.ops.actionNote.acknowledge : undefined}
            >
              <Icon name="check" size={14} /> {t.acknowledge}
            </button>
            <ActionClassTag c={action} />
          </>
        )}
        {err && (
          <span className="text-danger" role="alert">
            {err}
          </span>
        )}
      </footer>
    </article>
  );
}
