import type { ReactNode } from 'react';
import { href, withQuery } from '@/app/router';
import { Icon } from '@/components/Icon';
import { Panel } from '@/components/ui';
import type { EventCoverage } from '@/domain/eventCoverage';
import {
  MISSION_AREAS,
  NOT_REPORTED,
  type MissionChange,
  type MissionDigest,
} from '@/domain/missionView';
import type { Messages } from '@/i18n/en';
import { freshnessCodeText } from '@/i18n/freshnessText';
import { useI18n } from '@/i18n/useI18n';
import type { MissionViewsStorage } from '@/store/missionViews';
import { useSnapshot } from '@/store/hooks';

/** "New events: …" with the coverage state spelled out (never a bare number when not exact). */
export function CoverageText({ coverage }: { coverage: EventCoverage }) {
  const { m, num } = useI18n();
  const t = m.coverage;
  const text =
    coverage.state === 'exact'
      ? t.exact(coverage.count ?? 0, num(coverage.count ?? 0))
      : coverage.state === 'lower-bound'
        ? t.lowerBound(num(coverage.count ?? 0))
        : coverage.state === 'unknown'
          ? t.unknown
          : t.notApplicable;
  return (
    <span className="coverage" data-coverage={coverage.state}>
      <span className="coverage__state">{t.state[coverage.state]}</span> {text}
    </span>
  );
}

function valueText(m: Messages, c: MissionChange, v: string | undefined): string {
  if (v === undefined) return '';
  if (v === NOT_REPORTED) return m.missionView.notReported;
  const s = m.status;
  switch (c.kind) {
    case 'status':
    case 'missionNoLongerReported':
    case 'missionReappeared':
      return s.mission[v as keyof typeof s.mission] ?? v;
    case 'workerState':
    case 'workerNoLongerReported':
    case 'workerReappeared':
      return s.worker[v as keyof typeof s.worker] ?? v;
    case 'approvalLinked':
    case 'approvalStatus':
    case 'approvalNoLongerReported':
      return s.approval[v as keyof typeof s.approval] ?? v;
    case 'alertOpened':
    case 'alertPhase':
    case 'alertNoLongerReported':
      return m.brief.alertPhase[v] ?? v;
    case 'freshnessChanged':
      return freshnessCodeText(m, v);
    default:
      return v;
  }
}

export function MissionChangesPanel({
  missionId,
  digest,
  storage,
  rejected,
  onMarkSeen,
  onForget,
  now,
}: {
  missionId: string;
  digest: MissionDigest;
  storage: MissionViewsStorage;
  rejected: boolean;
  onMarkSeen: () => void;
  onForget: () => void;
  now: number;
}) {
  const snapshot = useSnapshot();
  const { m, rel, dateTime } = useI18n();
  const t = m.missionView;
  const mode = (x: keyof Messages['provenance']['mode']) => m.provenance.mode[x];

  const subject = (c: MissionChange): ReactNode => {
    if (!c.id) return null;
    if (c.kind === 'dataBecameUnavailable' || c.kind === 'dataRecovered')
      return m.brief.resource[c.id] ?? c.id;
    if (c.kind.startsWith('worker') || c.kind === 'assigned' || c.kind === 'unassigned')
      return (
        <a href={href.worker(c.id)} translate="no">
          {snapshot.workers.find((w) => w.id === c.id)?.name ?? c.id}
        </a>
      );
    if (c.kind.startsWith('approval'))
      return (
        <a className="mono" href={withQuery(href.approvals(), { focus: c.id })} translate="no">
          {c.id}
        </a>
      );
    if (c.kind.startsWith('alert'))
      return (
        <a className="mono" href={withQuery(href.alerts(), { focus: c.id })} translate="no">
          {c.id}
        </a>
      );
    if (c.kind === 'artifactNew')
      return (
        <a
          className="mono"
          href={withQuery(href.mission(missionId), { focus: c.id })}
          translate="no"
        >
          {c.id}
        </a>
      );
    return <span className="mono">{c.id}</span>;
  };

  const unknownAreas = MISSION_AREAS.filter((a) => digest.unknown[a]);

  return (
    <Panel
      id="mission-changes"
      focusId="changes"
      title={t.title}
      className="mission-changes"
      tone={digest.changed ? 'info' : undefined}
      actions={
        <>
          <button type="button" className="btn" onClick={onMarkSeen}>
            <Icon name="check" size={14} /> {t.markSeen}
          </button>
          {digest.baseline !== 'none' && (
            <button type="button" className="btn btn--ghost" onClick={onForget}>
              {t.forget}
            </button>
          )}
        </>
      }
    >
      <p className="muted small">{t.scope}</p>
      <div className="brief__baseline" role="status" data-baseline={digest.baseline}>
        {digest.baseline === 'none' && <p>{t.none}</p>}
        {digest.baseline === 'different-source' && (
          <p>{t.differentSource(mode(digest.sourceThen!))}</p>
        )}
        {digest.baseline === 'ok' && digest.since && (
          <p>{t.since(dateTime(digest.since), rel(digest.since, now))}</p>
        )}
        {rejected && <p className="brief__warning">{t.rejected}</p>}
        {storage === 'unavailable' && <p className="brief__warning">{t.storageUnavailable}</p>}
        {storage === 'outdated' && <p className="brief__warning">{t.outdated}</p>}
      </div>

      {digest.baseline === 'ok' && (
        <>
          <p className="mission-changes__events">
            <CoverageText coverage={digest.events} />
          </p>
          {digest.changed === false && <p className="brief__calm">{t.nothing}</p>}
          {digest.changed === null && <p className="brief__warning">{t.cannotSay}</p>}
          {digest.changes.length > 0 && (
            <>
              <h3 className="brief__subhead">{t.changes}</h3>
              <ul className="digest-items">
                {digest.changes.map((c, i) => (
                  <li
                    key={`${c.kind}:${c.id ?? ''}:${i}`}
                    className="digest-item"
                    data-change={c.kind}
                  >
                    <span className="digest-item__cat">{t.change[c.kind]}</span>
                    {subject(c)}
                    {(c.from || c.to) && (
                      <span className="digest-item__change">
                        {c.from && <span>{valueText(m, c, c.from)}</span>}
                        {c.from && c.to && <Icon name="arrow-right" size={12} />}
                        {c.to && <span>{valueText(m, c, c.to)}</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {unknownAreas.length > 0 && (
            <>
              <h3 className="brief__subhead">{t.unknownAreas}</h3>
              <ul className="mission-changes__unknown">
                {unknownAreas.map((a) => (
                  <li key={a} data-area={a}>
                    <strong>{t.area[a]}</strong>: {m.brief.unknownValue} ·{' '}
                    {t.unknownReason[digest.unknown[a]!]}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Panel>
  );
}
