import { useMemo } from 'react';
import { href, withQuery } from '@/app/router';
import { FreshnessLine } from '@/components/FreshnessLine';
import { Icon } from '@/components/Icon';
import { EmptyState, MoreLink, Panel } from '@/components/ui';
import { selectAttentionQueue, type AttentionItem } from '@/domain/attention';
import { selectBrief, type BriefCategory, type DataProblem } from '@/domain/brief';
import { computeDigest, DIGEST_CATEGORIES, type Digest, type DigestItem } from '@/domain/digest';
import { selectFreshness, type Freshness } from '@/domain/freshness';
import type { Tone } from '@/domain/status';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import type { Messages } from '@/i18n/en';
import { useI18n } from '@/i18n/useI18n';
import { useMissionMarkers } from '@/features/missions/useMissionMarkers';
import { AttentionList } from './AttentionList';
import { useConfig, useDashboard, useLastView, useNow, useSnapshot } from '@/store/hooks';

const FIGURES: BriefCategory[] = [
  'needsFounder',
  'newSinceLastView',
  'running',
  'blocked',
  'failed',
  'completed',
];
const FIGURE_TONE: Record<BriefCategory, Tone> = {
  needsFounder: 'warning',
  newSinceLastView: 'info',
  running: 'progress',
  blocked: 'warning',
  failed: 'danger',
  completed: 'success',
};

/**
 * Founder morning / return brief. Everything here is information and
 * navigation; the only controls change this browser's "last viewed" marker.
 */
export function BriefPage() {
  const snapshot = useSnapshot();
  const { status } = useDashboard();
  const { governance } = useConfig();
  const lastView = useLastView();
  const now = useNow(5000);
  const { m } = useI18n();
  const t = m.brief;
  useFocusTarget();

  const freshness = selectFreshness(snapshot, status, now);
  const digest = useMemo(
    () => computeDigest(snapshot, lastView.baseline),
    [snapshot, lastView.baseline],
  );
  const queue = selectAttentionQueue(snapshot, governance.humanAuthority, freshness);
  const brief = selectBrief(snapshot, freshness, digest, queue);
  const names = (rs: string[]) => rs.map((r) => t.resource[r] ?? r).join(t.and);

  return (
    <div className="page brief">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">{t.eyebrow}</div>
          <h1 className="page__title">{t.title}</h1>
          <p className="page__lede">{t.lead}</p>
        </div>
        <FreshnessLine freshness={freshness} />
      </header>

      <section className="brief__figures" aria-labelledby="brief-glance">
        <h2 id="brief-glance" className="visually-hidden">
          {t.glance}
        </h2>
        {FIGURES.map((c) => {
          const f = brief.figures[c];
          const label =
            c === 'needsFounder' ? t.figure.needsFounder(governance.humanAuthority) : t.figure[c];
          const unknownWhy =
            f.value !== null
              ? null
              : f.missing.length
                ? t.unknownBecause(names(f.missing))
                : t.unknownNoBaseline;
          return (
            <div
              key={c}
              className="brief__figure"
              data-figure={c}
              data-tone={f.value ? FIGURE_TONE[c] : undefined}
              data-unknown={f.value === null ? 'true' : undefined}
            >
              <div className="brief__figure-label">{label}</div>
              <div className="brief__figure-value">
                {f.value === null ? t.unknownValue : <Num n={f.value} />}
              </div>
              <div className="brief__figure-hint">
                {unknownWhy ??
                  (c === 'completed' && brief.completedSinceLastView !== null
                    ? t.completedSince(String(brief.completedSinceLastView))
                    : t.figureHint[c])}
              </div>
            </div>
          );
        })}
      </section>

      <div className="brief__columns">
        <AttentionPanel
          items={queue.items}
          complete={queue.complete}
          freshness={freshness}
          missingNames={names(
            (['approvals', 'alerts'] as const).filter((r) =>
              brief.problems.some((p) => p.kind === 'unavailable' && p.resource === r),
            ),
          )}
          now={now}
        />
        <DigestPanel digest={digest} now={now} />
      </div>

      <ProblemsPanel problems={brief.problems} names={names} />
    </div>
  );
}

function Num({ n }: { n: number }) {
  const { num } = useI18n();
  return <>{num(n)}</>;
}

/* ------------------------------ Attention queue ------------------------------ */

function AttentionPanel({
  items,
  complete,
  freshness,
  missingNames,
  now,
}: {
  items: AttentionItem[];
  complete: boolean;
  freshness: Freshness;
  missingNames: string;
  now: number;
}) {
  const { m } = useI18n();
  const t = m.brief.attention;
  const records = items.filter((i) => i.source !== 'data');
  return (
    <Panel
      id="brief-attention"
      focusId="attention"
      title={t.title}
      className="brief__attention"
      tone={records.length ? 'warning' : undefined}
    >
      <p className="muted brief__note">
        <Icon name="info" size={14} /> {t.note}
      </p>
      {!complete && (
        <p className="brief__warning" role="note">
          {t.incomplete(missingNames)}
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title={t.empty} />
      ) : (
        <AttentionList items={items} freshness={freshness} now={now} />
      )}
    </Panel>
  );
}

/* --------------------------------- Digest --------------------------------- */

function stateLabel(m: Messages, item: DigestItem, value: string | undefined): string {
  if (value === undefined) return '';
  const s = m.status;
  switch (item.entity) {
    case 'mission':
      return s.mission[value as keyof typeof s.mission] ?? value;
    case 'worker':
      return s.worker[value as keyof typeof s.worker] ?? value;
    case 'approval':
      return s.approval[value as keyof typeof s.approval] ?? value;
    case 'alert':
      return s.severity[value as keyof typeof s.severity] ?? m.brief.alertPhase[value] ?? value;
    case 'artifact':
      return s.artifact[value as keyof typeof s.artifact] ?? value;
  }
}

function DigestPanel({ digest, now }: { digest: Digest; now: number }) {
  const { m, rel, dateTime, num } = useI18n();
  const lastView = useLastView();
  const { markers } = useMissionMarkers();
  let changedMissions = 0;
  for (const x of markers.values()) if (x.changed) changedMissions += 1;
  const t = m.brief.digest;
  const mode = (x: keyof Messages['provenance']['mode']) => m.provenance.mode[x];
  const allKnownZero =
    digest.baseline === 'ok' && DIGEST_CATEGORIES.every((c) => digest.counts[c] === 0);

  return (
    <Panel
      id="brief-digest"
      focusId="digest"
      title={t.title}
      className="brief__digest"
      actions={
        <>
          <button type="button" className="btn" onClick={lastView.markSeen} title={t.markSeenHint}>
            <Icon name="check" size={14} /> {t.markSeen}
          </button>
          {lastView.baseline && (
            <button type="button" className="btn btn--ghost" onClick={lastView.clear}>
              {t.clear}
            </button>
          )}
        </>
      }
    >
      <div className="brief__baseline" role="status" data-baseline={digest.baseline}>
        {digest.baseline === 'none' && <p>{t.noBaseline}</p>}
        {digest.baseline === 'different-source' && (
          <p>{t.differentSource(mode(digest.sourceThen!))}</p>
        )}
        {digest.since && digest.baseline === 'ok' && (
          <p>
            {t.since(dateTime(digest.since), rel(digest.since, now))}{' '}
            {digest.sourceThen && digest.sourceThen !== digest.sourceNow && (
              <strong>{t.sourceChanged(mode(digest.sourceThen), mode(digest.sourceNow))}</strong>
            )}
          </p>
        )}
        {lastView.storage === 'rejected' && <p className="brief__warning">{t.rejected}</p>}
        {lastView.storage === 'outdated' && <p className="brief__warning">{t.outdated}</p>}
        {lastView.storage === 'unavailable' && (
          <p className="brief__warning">{t.storageUnavailable}</p>
        )}
      </div>

      {changedMissions > 0 && (
        <p>
          <MoreLink href={withQuery(href.missions(), { since: 'changed' })}>
            {t.missionsChanged(changedMissions, num(changedMissions))}
          </MoreLink>
        </p>
      )}
      <h3 className="brief__subhead">{t.counts}</h3>
      <dl className="digest-counts">
        {DIGEST_CATEGORIES.map((c) => {
          const v = digest.counts[c];
          const why = digest.unknown[c];
          return (
            <div
              key={c}
              className="digest-counts__row"
              data-category={c}
              data-unknown={v === null ? 'true' : undefined}
            >
              <dt>{t.category[c]}</dt>
              <dd>
                {v === null ? (
                  <>
                    <strong>{m.brief.unknownValue}</strong>
                    <span className="muted">
                      {' '}
                      · {why ? t.reason[why] : ''}
                      {c === 'events' && digest.eventsObserved > 0
                        ? ` · ${t.eventsLowerBound(num(digest.eventsObserved))}`
                        : ''}
                    </span>
                  </>
                ) : (
                  <strong>{num(v)}</strong>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {allKnownZero && <p className="brief__calm">{t.nothing}</p>}

      {digest.items.length > 0 && (
        <>
          <h3 className="brief__subhead">{t.items}</h3>
          <ul className="digest-items">
            {digest.items.map((it) => (
              <li
                key={`${it.category}:${it.entity}:${it.id}`}
                className="digest-item"
                data-category={it.category}
              >
                <span className="digest-item__cat">{t.category[it.category]}</span>
                <span className="digest-item__entity">{t.entity[it.entity]}</span>
                <a className="digest-item__link" href={it.href}>
                  {it.label}
                </a>
                {it.label !== it.id && <span className="mono muted">{it.id}</span>}
                {(it.from || it.to) && (
                  <span className="digest-item__change">
                    {it.from && <span>{stateLabel(m, it, it.from)}</span>}
                    {it.from && it.to && <Icon name="arrow-right" size={12} />}
                    {it.to && <span>{stateLabel(m, it, it.to)}</span>}
                  </span>
                )}
                {it.category === 'noLongerReported' && (
                  <span className="muted digest-item__note">{t.goneNote}</span>
                )}
              </li>
            ))}
          </ul>
          {digest.moreItems > 0 && <p className="muted">{t.moreItems(num(digest.moreItems))}</p>}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------ Data problems ------------------------------ */

function ProblemsPanel({
  problems,
  names,
}: {
  problems: DataProblem[];
  names: (rs: string[]) => string;
}) {
  const { m, num } = useI18n();
  const t = m.brief.problems;
  const text = (p: DataProblem) => {
    switch (p.kind) {
      case 'unavailable':
        return t.unavailable(names([p.resource]));
      case 'issues':
        return t.issues(num(p.count));
      default:
        return t[p.kind];
    }
  };
  return (
    <Panel
      id="brief-problems"
      focusId="problems"
      title={t.title}
      tone={problems.length ? 'warning' : undefined}
      actions={
        <>
          <MoreLink href={href.quality()}>{m.quality.open}</MoreLink>
          <MoreLink href={withQuery(href.settings(), { focus: 'transport' })}>
            {t.diagnostics}
          </MoreLink>
        </>
      }
    >
      {problems.length === 0 ? (
        <p className="brief__calm">{t.none}</p>
      ) : (
        <ul className="brief__problems">
          {problems.map((p, i) => (
            <li key={i} data-problem={p.kind}>
              <Icon name="alert" size={14} /> {text(p)}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
