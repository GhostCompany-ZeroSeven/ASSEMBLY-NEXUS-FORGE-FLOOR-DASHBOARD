import type { ReactNode } from 'react';
import { href, withQuery } from '@/app/router';
import { Icon, type IconName } from '@/components/Icon';
import { healthTone, type Tone } from '@/domain/status';
import { useI18n } from '@/i18n/useI18n';
import { useConfig, useDashboard, useNow, useSnapshot } from '@/store/hooks';
import { selectSituation, type SituationResource } from './situation';
import { useMissionLabel } from '@/hooks/useMissionLabel';

const DATA_TONE: Record<string, Tone> = {
  demo: 'warning',
  live: 'connected',
  disconnected: 'danger',
  replay: 'progress',
};

/**
 * "Understand the system in seconds." Seven questions, answered in plain words.
 * Founder-critical cells come first; calm states stay calm (no fake urgency).
 */
export function SituationBoard() {
  const snapshot = useSnapshot();
  const missionRef = useMissionLabel();
  const { status } = useDashboard();
  const { governance } = useConfig();
  const now = useNow(5000);
  const { m, rel } = useI18n();
  const t = m.situation;
  const s = selectSituation(snapshot, status, now);
  const founderCount = s.founder.approvals + s.founder.humanAlerts;
  const missing = (...rs: SituationResource[]) => rs.filter((r) => s.unavailable[r]);
  const names = (rs: SituationResource[]) => rs.map((r) => t.resource[r]).join(t.and);
  const unknown = (rs: SituationResource[]) => t.unknownBecause(names(rs));
  const founderMissing = missing('approvals', 'alerts');
  const workMissing = missing('missions', 'workers');
  const missionsMissing = missing('missions');
  const display = s.data.display as keyof typeof t.data;
  const data = t.data[display];
  const backendTone = healthTone({
    status: s.backend.health,
    connection: s.backend.connection,
    stale: s.backend.stale,
    partial: s.backend.partial,
    simulated: display === 'demo',
  });
  const blockedAny = s.blocked.workers + s.blocked.missions > 0;

  return (
    <section className="situation" aria-labelledby="situation-title">
      <h2 id="situation-title" className="visually-hidden">
        {t.heading}
      </h2>
      <Cell
        q={t.needs(governance.humanAuthority)}
        icon="gate"
        // "Nothing waiting" is calm, not a lime all-clear (it may be stale).
        tone={founderCount > 0 || founderMissing.length ? 'warning' : 'muted'}
        answer={
          founderCount > 0
            ? t.items(founderCount, founderMissing.length > 0)
            : founderMissing.length
              ? t.unknown
              : t.nothing
        }
        detail={
          founderCount === 0 && founderMissing.length
            ? unknown(founderMissing)
            : founderCount > 0
              ? [
                  s.founder.approvals &&
                    t.approvalsWaiting(
                      s.founder.approvals,
                      s.founder.oldestRequestAt ? rel(s.founder.oldestRequestAt, now) : undefined,
                    ),
                  s.founder.humanAlerts && t.alertsNeedAction(s.founder.humanAlerts),
                  founderMissing.length && t.resourcesUnavailable(names(founderMissing)),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t.nothingWaiting
        }
        href={
          s.founder.approvals ? href.approvals() : s.founder.humanAlerts ? href.alerts() : undefined
        }
        primary={founderCount > 0}
      />
      <Cell
        q={t.liveQ}
        icon="activity"
        tone={DATA_TONE[display] ?? 'muted'}
        answer={data.answer}
        detail={`${data.detail}${s.data.transport && display !== 'demo' ? t.updates(t.transportWords[s.data.transport]) : ''}`}
        href={withQuery(href.settings(), { focus: 'transport' })}
      />
      <Cell
        q={t.healthQ}
        icon="health"
        tone={backendTone}
        answer={
          s.backend.connection === 'error'
            ? t.unavailable
            : display === 'demo'
              ? t.simulatedHealth(m.status.health[s.backend.health])
              : m.status.health[s.backend.health]
        }
        detail={
          // Demo health is produced by the simulation: never presented as a backend's.
          (display === 'demo' && t.demoHealth) ||
          [
            s.backend.connection !== 'connected' &&
              t.connectionWord(m.connection[s.backend.connection] ?? s.backend.connection),
            s.backend.stale && t.stale,
            s.backend.partial && t.partial,
          ]
            .filter(Boolean)
            .join(' · ') ||
          t.allChecked
        }
        href={withQuery(href.command(), { focus: 'health' })}
      />
      <Cell
        q={t.runningQ}
        icon="mission"
        tone={workMissing.length ? 'warning' : 'active'}
        answer={missionsMissing.length ? t.unknown : t.missionsN(s.running.missions)}
        detail={
          workMissing.length
            ? unknown(workMissing)
            : t.busy(s.running.workersBusy, s.running.workersTotal)
        }
        href={href.missions()}
      />
      <Cell
        q={t.blockedQ}
        icon="alert"
        tone={blockedAny ? 'danger' : workMissing.length ? 'warning' : 'muted'}
        answer={
          workMissing.length && !blockedAny
            ? t.unknown
            : blockedAny
              ? t.workersN(s.blocked.workers)
              : t.nothing
        }
        detail={
          workMissing.length
            ? unknown(workMissing)
            : blockedAny
              ? t.blockedDetail(s.blocked.missions)
              : t.noBlockers
        }
        href={withQuery(href.floor(), { show: 'blocked' })}
      />
      <Cell
        q={t.failedQ}
        icon="x"
        tone={
          s.failed.missions + s.failed.workers > 0
            ? 'danger'
            : missionsMissing.length
              ? 'warning'
              : 'muted'
        }
        answer={
          missionsMissing.length && s.failed.missions === 0
            ? t.unknown
            : s.failed.missions > 0
              ? t.missionsN(s.failed.missions)
              : t.nothing
        }
        detail={
          missionsMissing.length
            ? unknown(missionsMissing)
            : s.failed.latest
              ? t.latest(
                  missionRef(s.failed.latest),
                  s.failed.latest.title,
                  s.failed.latest.completedAt ? rel(s.failed.latest.completedAt, now) : undefined,
                )
              : t.noFailed
        }
        href={s.failed.latest ? href.mission(s.failed.latest.id) : undefined}
      />
      <Cell
        q={t.completedQ}
        icon="check"
        tone={s.completed.latest ? 'success' : missionsMissing.length ? 'warning' : 'muted'}
        answer={
          s.completed.latest
            ? missionRef(s.completed.latest)
            : missionsMissing.length
              ? t.unknown
              : t.nothingYet
        }
        detail={
          missionsMissing.length
            ? unknown(missionsMissing)
            : s.completed.latest
              ? t.completedDetail(
                  s.completed.latest.title,
                  s.completed.latest.completedAt
                    ? rel(s.completed.latest.completedAt, now)
                    : undefined,
                  s.completed.count,
                )
              : t.noneCompleted
        }
        href={s.completed.latest ? href.mission(s.completed.latest.id) : undefined}
      />
    </section>
  );
}

function Cell({
  q,
  icon,
  tone,
  answer,
  detail,
  href: link,
  primary = false,
}: {
  q: string;
  icon: IconName;
  tone: Tone;
  answer: ReactNode;
  detail: ReactNode;
  href?: string;
  primary?: boolean;
}) {
  const body = (
    <>
      <span className="situation__q">
        <Icon name={icon} size={14} /> {q}
      </span>
      <span className="situation__a">{answer}</span>
      <span className="situation__d">{detail}</span>
    </>
  );
  return link ? (
    <a className="situation__cell" data-tone={tone} data-primary={primary || undefined} href={link}>
      {body}
    </a>
  ) : (
    <div className="situation__cell" data-tone={tone} data-primary={primary || undefined}>
      {body}
    </div>
  );
}
