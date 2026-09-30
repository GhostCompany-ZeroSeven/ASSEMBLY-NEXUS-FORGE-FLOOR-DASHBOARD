import type { ReactNode } from 'react';
import { href, withQuery } from '@/app/router';
import { Icon, type IconName } from '@/components/Icon';
import { HEALTH_STATUS_META, type Tone } from '@/domain/status';
import { formatRelative } from '@/domain/time';
import { useConfig, useDashboard, useNow, useSnapshot } from '@/store/hooks';
import { selectSituation } from './situation';

const DATA_ANSWER: Record<string, { answer: string; tone: Tone; detail: string }> = {
  demo: { answer: 'Simulated', tone: 'warning', detail: 'Local demo data. No backend connected.' },
  live: { answer: 'Live', tone: 'success', detail: 'Verified backend connection.' },
  disconnected: { answer: 'Not live', tone: 'danger', detail: 'Backend not verified right now.' },
  replay: { answer: 'Replay', tone: 'progress', detail: 'Recorded data, not live.' },
};

/**
 * "Understand the system in seconds." Seven questions, answered in plain words.
 * Founder-critical cells come first; calm states stay calm (no fake urgency).
 */
export function SituationBoard() {
  const snapshot = useSnapshot();
  const { status } = useDashboard();
  const { governance } = useConfig();
  const now = useNow(5000);
  const s = selectSituation(snapshot, status, now);
  const founderCount = s.founder.approvals + s.founder.humanAlerts;
  const data = DATA_ANSWER[s.data.display]!;
  const health = HEALTH_STATUS_META[s.backend.health];
  const backendTone: Tone =
    s.backend.connection === 'error' || s.backend.health === 'CRITICAL'
      ? 'danger'
      : s.backend.stale ||
          s.backend.partial ||
          s.backend.health === 'DEGRADED' ||
          s.backend.connection === 'reconnecting'
        ? 'warning'
        : health.tone;

  return (
    <section className="situation" aria-labelledby="situation-title">
      <h2 id="situation-title" className="visually-hidden">
        Situation summary
      </h2>
      <Cell
        q={`Needs ${governance.humanAuthority}?`}
        icon="gate"
        tone={founderCount > 0 ? 'warning' : 'success'}
        answer={
          founderCount > 0 ? `${founderCount} item${founderCount === 1 ? '' : 's'}` : 'Nothing'
        }
        detail={
          founderCount > 0
            ? [
                s.founder.approvals &&
                  `${s.founder.approvals} approval${s.founder.approvals === 1 ? '' : 's'} waiting${s.founder.oldestRequestAt ? ` (oldest ${formatRelative(s.founder.oldestRequestAt, now)})` : ''}`,
                s.founder.humanAlerts &&
                  `${s.founder.humanAlerts} alert${s.founder.humanAlerts === 1 ? ' needs' : 's need'} action`,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'No decisions or actions are waiting on you.'
        }
        href={
          s.founder.approvals ? href.approvals() : s.founder.humanAlerts ? href.alerts() : undefined
        }
        primary={founderCount > 0}
      />
      <Cell
        q="Live or simulated?"
        icon="activity"
        tone={data.tone}
        answer={data.answer}
        detail={`${data.detail}${s.data.transport && s.data.display !== 'demo' ? ` Updates: ${s.data.transport.replace('-', ' ')}.` : ''}`}
        href={href.settings()}
      />
      <Cell
        q="Backend healthy?"
        icon="health"
        tone={backendTone}
        answer={s.backend.connection === 'error' ? 'Unavailable' : health.label}
        detail={
          [
            s.backend.connection !== 'connected' && `connection ${s.backend.connection}`,
            s.backend.stale && 'data is stale',
            s.backend.partial && 'data is partial',
          ]
            .filter(Boolean)
            .join(' · ') || 'All reported components checked.'
        }
        href={withQuery(href.command(), { focus: 'health' })}
      />
      <Cell
        q="What is running?"
        icon="mission"
        tone="active"
        answer={`${s.running.missions} mission${s.running.missions === 1 ? '' : 's'}`}
        detail={`${s.running.workersBusy} of ${s.running.workersTotal} workers busy`}
        href={href.missions()}
      />
      <Cell
        q="What is blocked?"
        icon="alert"
        tone={s.blocked.workers + s.blocked.missions > 0 ? 'danger' : 'muted'}
        answer={
          s.blocked.workers + s.blocked.missions > 0
            ? `${s.blocked.workers} worker${s.blocked.workers === 1 ? '' : 's'}`
            : 'Nothing'
        }
        detail={
          s.blocked.workers + s.blocked.missions > 0
            ? `${s.blocked.missions} mission${s.blocked.missions === 1 ? '' : 's'} blocked. Founder-gated waits are counted above.`
            : 'No blockers besides Founder gates.'
        }
        href={withQuery(href.floor(), { show: 'blocked' })}
      />
      <Cell
        q="What failed?"
        icon="x"
        tone={s.failed.missions + s.failed.workers > 0 ? 'danger' : 'muted'}
        answer={
          s.failed.missions > 0
            ? `${s.failed.missions} mission${s.failed.missions === 1 ? '' : 's'}`
            : 'Nothing'
        }
        detail={
          s.failed.latest
            ? `Latest: ${s.failed.latest.id} ${s.failed.latest.title}${s.failed.latest.completedAt ? ` · ${formatRelative(s.failed.latest.completedAt, now)}` : ''}`
            : 'No failed missions.'
        }
        href={s.failed.latest ? href.mission(s.failed.latest.id) : undefined}
      />
      <Cell
        q="Just completed?"
        icon="check"
        tone={s.completed.latest ? 'success' : 'muted'}
        answer={s.completed.latest ? s.completed.latest.id : 'Nothing yet'}
        detail={
          s.completed.latest
            ? `${s.completed.latest.title}${s.completed.latest.completedAt ? ` · ${formatRelative(s.completed.latest.completedAt, now)}` : ''} · ${s.completed.count} complete in total`
            : 'No missions have completed.'
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
