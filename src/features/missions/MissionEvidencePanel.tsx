import { href } from '@/app/router';
import { Icon } from '@/components/Icon';
import { EmptyState, Panel, SimulatedTag } from '@/components/ui';
import type { Mission } from '@/domain/types';
import { useI18n } from '@/i18n/useI18n';
import { useSnapshot } from '@/store/hooks';
import { safeExternalHref } from './safeHref';

/**
 * Artifacts as REPORTED evidence. Presence, a link or a worker's claim says
 * nothing about correctness: the dashboard has not verified any of it, and an
 * artifact is never certification (certification is shown separately).
 */
export function MissionEvidencePanel({
  mission,
  newIds,
  now,
}: {
  mission: Mission;
  newIds?: ReadonlySet<string>;
  now: number;
}) {
  const snapshot = useSnapshot();
  const { m, rel, dateTime } = useI18n();
  const t = m.evidence;
  const simulated = snapshot.provenance.mode === 'demo';
  return (
    <Panel title={t.title(mission.artifacts.length)} className="span-2 mission-evidence">
      <p className="muted small">{t.note}</p>
      {mission.artifacts.length === 0 ? (
        <EmptyState title={m.mission.noArtifacts} />
      ) : (
        <ul className="artifact-list">
          {mission.artifacts.map((a) => {
            const link = safeExternalHref(a.uri);
            const producer = a.producedBy
              ? (snapshot.workers.find((w) => w.id === a.producedBy)?.name ?? a.producedBy)
              : undefined;
            return (
              <li key={a.id} className="artifact" data-focus-id={a.id}>
                <Icon name={link ? 'link' : 'artifact'} size={16} />
                <div>
                  <div className="artifact__title">
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer noopener">
                        {a.title}
                        <span className="visually-hidden"> ({t.external})</span>
                      </a>
                    ) : (
                      a.title
                    )}
                  </div>
                  {a.summary && <div className="small muted">{a.summary}</div>}
                  <div className="small muted">
                    <span className="mono" translate="no">
                      {a.id}
                    </span>{' '}
                    ·{' '}
                    {producer ? (
                      <>
                        {t.reportedBy}{' '}
                        <a href={href.worker(a.producedBy!)} translate="no">
                          {producer}
                        </a>
                      </>
                    ) : (
                      t.reportedBySource
                    )}
                    {!link && <> · {t.noLink}</>}
                  </div>
                </div>
                <span className="chip">{m.status.artifact[a.kind]}</span>
                {newIds?.has(a.id) && (
                  <span className="stream__new">{m.activity.newSinceView}</span>
                )}
                {simulated && <SimulatedTag />}
                <time className="small muted" dateTime={a.createdAt} title={dateTime(a.createdAt)}>
                  {rel(a.createdAt, now)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
