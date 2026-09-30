import { useState } from 'react';
import { href } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { EmptyState, Panel, StatTile, StatusBadge } from '@/components/ui';
import {
  isMissionInFlight,
  openAlerts,
  pendingApprovals,
  selectOverview,
  sortMissions,
} from '@/domain/selectors';
import { HEALTH_STATUS_META, RISK_TONE, WORKER_STATE_META } from '@/domain/status';
import { formatRelative } from '@/domain/time';
import type { Mission } from '@/domain/types';
import { ActivityStream } from '@/features/activity/ActivityStream';
import { AlertCard } from '@/features/alerts/AlertCard';
import { ForgeFloorMap } from '@/features/forge-floor/ForgeFloorMap';
import { MissionCard } from '@/features/missions/MissionCard';
import { MissionInstrument } from '@/features/missions/MissionInstrument';
import { useConfig, useNow, useSnapshot } from '@/store/hooks';

/** Pick the mission most worth watching: approval-gated, then high priority, then oldest active. */
function featuredMission(missions: Mission[]): Mission | undefined {
  const rank = (m: Mission) =>
    (m.status === 'WAITING_APPROVAL' ? 0 : m.status === 'BLOCKED' ? 1 : 2) * 10 +
    (m.priority === 'critical' ? 0 : m.priority === 'high' ? 1 : 2);
  return missions
    .filter(isMissionInFlight)
    .sort((a, b) => rank(a) - rank(b) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))[0];
}

export function CommandCenter() {
  const snapshot = useSnapshot();
  const config = useConfig();
  const now = useNow(5000);
  const stats = selectOverview(snapshot);
  const featured = featuredMission(snapshot.missions);
  const gates = pendingApprovals(snapshot);
  const alerts = openAlerts(snapshot).slice(0, 3);
  const inFlight = sortMissions(snapshot.missions).filter(isMissionInFlight);
  const recentlyDone = snapshot.missions
    .filter((m) => m.status === 'COMPLETE' || m.status === 'FAILED')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 3);
  const [selected, setSelected] = useState<string | null>(null);
  const health = HEALTH_STATUS_META[snapshot.health.status];

  return (
    <div className="page page--wide">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">
            {config.branding.productName} · {config.branding.surfaceName}
          </div>
          <h1 className="page__title">Command Center</h1>
        </div>
      </header>

      {snapshot.provenance.mode === 'demo' && (
        <div className="demo-strip" role="note">
          <strong>LOCAL DEMO DATA.</strong> Every worker, mission, approval and alert on this screen
          is simulated in your browser by the {snapshot.provenance.adapterLabel}. No Assembly Nexus
          backend is connected.
        </div>
      )}

      <div className="stat-row">
        <StatTile
          label="Active missions"
          value={stats.activeMissions}
          tone="active"
          icon="mission"
          href={href.missions()}
        />
        <StatTile
          label="Queued"
          value={stats.queuedMissions}
          tone="muted"
          icon="clock"
          href={href.missions()}
        />
        <StatTile
          label="Workers busy"
          value={
            <>
              {stats.workersBusy}
              <span className="stat__of">/{stats.workersTotal}</span>
            </>
          }
          tone="info"
          icon="workers"
          href={href.workers()}
        />
        <StatTile
          label="Blocked / failed"
          value={stats.workersBlocked}
          tone={stats.workersBlocked ? 'danger' : 'muted'}
          icon="alert"
          href={href.workers()}
        />
        <StatTile label="Reviews open" value={stats.reviewsOpen} tone="progress" icon="check" />
        <StatTile
          label="Approval gates"
          value={stats.approvalsPending}
          tone={stats.approvalsPending ? 'warning' : 'muted'}
          icon="gate"
          href={href.approvals()}
          hint={stats.approvalsPending ? 'Decision needed' : 'Clear'}
        />
        <StatTile
          label="Alerts"
          value={stats.alertsOpen}
          tone={stats.alertsCritical ? 'danger' : stats.alertsOpen ? 'warning' : 'muted'}
          icon="alert"
          href={href.alerts()}
          hint={stats.alertsCritical ? `${stats.alertsCritical} critical` : undefined}
        />
        <StatTile
          label="Completed"
          value={stats.completedMissions}
          tone="success"
          icon="check"
          hint={stats.failedMissions ? `${stats.failedMissions} failed` : undefined}
        />
      </div>

      <div className="grid grid--command">
        <Panel
          title={featured ? featured.title : 'No mission in flight'}
          eyebrow={
            featured ? <span className="mono">Featured · {featured.id}</span> : 'Featured mission'
          }
          className="span-2"
          actions={featured && <a href={href.mission(featured.id)}>Open mission →</a>}
        >
          {featured ? (
            <MissionInstrument mission={featured} size="xl" />
          ) : (
            <EmptyState title="All quiet" />
          )}
        </Panel>

        <Panel
          title="Founder Gate"
          eyebrow={`Decision authority: ${config.governance.humanAuthority}`}
          tone={gates.length ? 'warning' : undefined}
          actions={<a href={href.approvals()}>All gates →</a>}
        >
          {gates.length === 0 ? (
            <EmptyState title="No decisions waiting" />
          ) : (
            <ul className="gate-mini">
              {gates.map((g) => (
                <li key={g.id}>
                  <a href={href.approvals()} className="gate-mini__item" data-risk={g.risk}>
                    <span className="mono small">{g.id}</span>
                    <span className="gate-mini__title">{g.title}</span>
                    <StatusBadge tone={RISK_TONE[g.risk]} size="sm">
                      {g.risk} risk
                    </StatusBadge>
                    <span className="small muted">{formatRelative(g.requestedAt, now)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {config.features.forgeFloor && (
          <Panel
            title="Forge Floor"
            className="span-2"
            actions={<a href={href.floor()}>Full floor →</a>}
          >
            <ForgeFloorMap compact selectedId={selected} onSelect={(id) => setSelected(id)} />
            {selected && (
              <p className="small">
                Selected:{' '}
                <a href={href.worker(selected)}>
                  {snapshot.workers.find((w) => w.id === selected)?.name}
                </a>{' '}
                — open focus view
              </p>
            )}
          </Panel>
        )}

        <Panel title="Alerts" actions={<a href={href.alerts()}>All alerts →</a>}>
          {alerts.length === 0 ? (
            <EmptyState title="No open alerts" />
          ) : (
            <div className="stack">
              {alerts.map((a) => (
                <AlertCard key={a.id} alert={a} compact={a.severity !== 'CRITICAL'} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={`Missions in flight (${inFlight.length})`}
          className="span-2"
          actions={<a href={href.missions()}>Mission control →</a>}
        >
          {inFlight.length === 0 ? (
            <EmptyState title="Nothing in flight" />
          ) : (
            <div className="mission-list">
              {inFlight.map((m) => (
                <MissionCard key={m.id} mission={m} />
              ))}
            </div>
          )}
          {recentlyDone.length > 0 && (
            <>
              <h3 className="subhead">Recently finished</h3>
              <div className="mission-list">
                {recentlyDone.map((m) => (
                  <MissionCard key={m.id} mission={m} />
                ))}
              </div>
            </>
          )}
        </Panel>

        <div className="stack">
          <Panel title="System health" id="health" tone={health.tone}>
            <div className="health">
              <StatusBadge tone={health.tone} size="lg">
                {health.label}
              </StatusBadge>
              <span className="small muted">
                checked {formatRelative(snapshot.health.checkedAt, now)}
              </span>
            </div>
            <ul className="health-list">
              {snapshot.health.components.map((c) => (
                <li key={c.id} data-status={c.status}>
                  <StatusBadge tone={HEALTH_STATUS_META[c.status].tone} size="sm">
                    {c.label}
                  </StatusBadge>
                  <span className="small muted">{c.detail}</span>
                  {typeof c.latencyMs === 'number' && (
                    <span className="mono small">{c.latencyMs}ms</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Crew" actions={<a href={href.workers()}>Roster →</a>}>
            <ul className="crew-strip">
              {snapshot.workers.map((w) => (
                <li key={w.id}>
                  <a
                    href={href.worker(w.id)}
                    title={`${w.name} — ${WORKER_STATE_META[w.state].label}`}
                    data-tone={WORKER_STATE_META[w.state].tone}
                  >
                    <CharacterAvatar characterId={w.characterId} state={w.state} size={34} />
                    <span className="visually-hidden">
                      {w.name}: {WORKER_STATE_META[w.state].label}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel
          title="Activity"
          className="span-3"
          actions={<a href={href.activity()}>Full log →</a>}
        >
          <ActivityStream limit={14} />
        </Panel>
      </div>
    </div>
  );
}
