import { MoreLink } from '@/components/ui';
import type { AttentionItem } from '@/domain/attention';
import { explainAttention, type Fact } from '@/domain/attentionExplain';
import type { Freshness } from '@/domain/freshness';
import type { Messages } from '@/i18n/en';
import { freshnessCodeText, freshnessText } from '@/i18n/freshnessText';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';

/**
 * Founder attention entries with their evidence. Information and navigation
 * only: no control here decides, acknowledges or grants anything.
 */
export function AttentionList({
  items,
  freshness,
  now,
}: {
  items: AttentionItem[];
  freshness: Freshness;
  now: number;
}) {
  const { m, rel, dateTime } = useI18n();
  const t = m.brief.attention;
  const freshLabel = freshnessText(m, freshness);
  return (
    <ol className="attention-list">
      {items.map((it) => (
        <li key={it.key} className="attention-item" data-reason={it.reason}>
          <div className="attention-item__reason">{t.reason[it.reason]}</div>
          {it.source === 'data' ? (
            <MoreLink href={it.href}>
              {it.reason === 'data-unavailable'
                ? (m.brief.resource[it.id] ?? it.id)
                : m.brief.problems.diagnostics}
            </MoreLink>
          ) : (
            <>
              <a className="attention-item__title" href={it.href}>
                {it.label}
              </a>
              <dl className="attention-item__facts">
                <div>
                  <dt>{t.source[it.source]}</dt>
                  <dd className="mono" translate="no">
                    {it.id}
                  </dd>
                </div>
                <div>
                  <dt>{t.state}</dt>
                  <dd>
                    {it.source === 'approval'
                      ? m.status.approval[it.state as keyof Messages['status']['approval']]
                      : m.brief.alertPhase[it.state]}
                  </dd>
                </div>
                {it.since && (
                  <div>
                    <dt>{t.since}</dt>
                    <dd>
                      <time dateTime={it.since} title={dateTime(it.since)}>
                        {rel(it.since, now)}
                      </time>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>{t.freshness}</dt>
                  <dd>{freshLabel}</dd>
                </div>
              </dl>
              {it.related.length > 0 && (
                <div className="attention-item__related">
                  <span className="muted">{t.related}:</span>{' '}
                  {it.related.map((r, i) => (
                    <span key={`${r.kind}:${r.id}`}>
                      {i > 0 && ', '}
                      <a href={r.href}>{r.label}</a>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <Explanation item={it} freshness={freshness} now={now} />
        </li>
      ))}
    </ol>
  );
}

function Explanation({
  item,
  freshness,
  now,
}: {
  item: AttentionItem;
  freshness: Freshness;
  now: number;
}) {
  const snapshot = useSnapshot();
  const { m, rel, dateTime } = useI18n();
  const t = m.explain;
  const x = explainAttention(item, snapshot, freshness);
  const time = (iso: string) => (
    <time dateTime={iso} title={dateTime(iso)}>
      {dateTime(iso)} ({rel(iso, now)})
    </time>
  );
  const factValue = (f: Fact) => {
    switch (f.key) {
      case 'status':
        return item.source === 'approval'
          ? (m.status.approval[f.value as keyof Messages['status']['approval']] ?? f.value)
          : f.value;
      case 'requiredAuthority':
        return f.value ? <strong translate="no">{f.value}</strong> : <strong>{t.missing}</strong>;
      case 'requestedBy':
        return (
          <span translate="no">
            {snapshot.workers.find((w) => w.id === f.value)?.name ?? f.value}
          </span>
        );
      case 'risk':
        return m.status.risk[f.value as keyof Messages['status']['risk']] ?? f.value;
      case 'severity':
        return m.status.severity[f.value as keyof Messages['status']['severity']] ?? f.value;
      case 'resource':
        return m.brief.resource[f.value] ?? f.value;
      case 'freshness':
        return freshnessCodeText(m, f.value);
      case 'reversible':
      case 'humanActionRequired':
      case 'acknowledged':
        return f.value ? m.common.yes : m.common.no;
    }
  };
  const facts = (list: Fact[]) =>
    list.length === 0 ? (
      <span className="muted">{t.none}</span>
    ) : (
      <ul className="explain__facts">
        {list.map((f) => (
          <li key={f.key}>
            {t.fact[f.key]}: {factValue(f)}
          </li>
        ))}
      </ul>
    );
  return (
    <details className="explain" data-code={x.code}>
      <summary>{t.why}</summary>
      <dl className="explain__list">
        <div>
          <dt>{t.code}</dt>
          <dd className="mono" translate="no">
            {x.code}
          </dd>
        </div>
        <div>
          <dt>{t.trigger}</dt>
          <dd>{facts(x.trigger)}</dd>
        </div>
        <div>
          <dt>{t.known}</dt>
          <dd>{facts(x.known)}</dd>
        </div>
        <div>
          <dt>{t.unknown}</dt>
          <dd>
            {x.unknown.length === 0 ? (
              <span className="muted">{t.none}</span>
            ) : (
              <ul className="explain__facts">
                {x.unknown.map((u) => (
                  <li key={u}>{t.unknownFact[u]}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        {x.sourceTime && (
          <div>
            <dt>{t.sourceTime}</dt>
            <dd>{time(x.sourceTime)}</dd>
          </div>
        )}
        {x.receivedAt && (
          <div>
            <dt>{t.receivedAt}</dt>
            <dd>{time(x.receivedAt)}</dd>
          </div>
        )}
        <div>
          <dt>{t.freshness}</dt>
          <dd>{freshnessCodeText(m, x.freshness)}</dd>
        </div>
        <div>
          <dt>{t.action}</dt>
          <dd>{t.actionSurface[x.actionSurface]}</dd>
        </div>
      </dl>
    </details>
  );
}
