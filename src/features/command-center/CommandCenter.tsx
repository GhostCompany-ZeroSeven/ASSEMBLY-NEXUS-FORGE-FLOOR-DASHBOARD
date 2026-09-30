import { useState } from 'react';
import { href } from '@/app/router';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { EmptyState, MoreLink, Panel, StatusBadge } from '@/components/ui';
import { useFocusTarget } from '@/hooks/useFocusTarget';
import { DEFAULT_MISSION_FILTER, filterMissions } from '@/features/filters/filters';
import { SituationBoard } from './SituationBoard';
import {
  isMissionInFlight,
  openAlerts,
  pendingApprovals,
  resourceUnavailable,
} from '@/domain/selectors';
import { HEALTH_STATUS_META, RISK_TONE, WORKER_STATE_META } from '@/domain/status';
import type { Mission } from '@/domain/types';
import { ActivityStream } from '@/features/activity/ActivityStream';
import { AlertCard } from '@/features/alerts/AlertCard';
import { ForgeFloorMap } from '@/features/forge-floor/ForgeFloorMap';
import { MissionCard } from '@/features/missions/MissionCard';
import { MissionInstrument } from '@/features/missions/MissionInstrument';
import { useI18n } from '@/i18n/useI18n';
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
  const { m, rel } = useI18n();
  const t = m.command;
  const featured = featuredMission(snapshot.missions);
  const gates = pendingApprovals(snapshot);
  const alerts = openAlerts(snapshot).slice(0, 3);
  const allInFlight = filterMissions(snapshot, { ...DEFAULT_MISSION_FILTER, group: 'in-flight' });
  // The overview shows the most pressing few; Mission Control has the full list.
  const inFlight = allInFlight.slice(0, 8);
  const recentlyDone = snapshot.missions
    .filter((m) => m.status === 'COMPLETE' || m.status === 'FAILED')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 3);
  const [selected, setSelected] = useState<string | null>(null);
  const health = HEALTH_STATUS_META[snapshot.health.status];
  // A failed fetch is not "nothing": empty panels say the data is unavailable instead.
  const missionsMissing = resourceUnavailable(snapshot, 'missions');
  useFocusTarget();

  return (
    <div className="page page--wide">
      <header className="page__header">
        <div>
          <div className="page__eyebrow">
            {t.eyebrow(config.branding.productName, config.branding.surfaceName)}
          </div>
          <h1 className="page__title">{t.title}</h1>
        </div>
      </header>

      {snapshot.provenance.mode === 'demo' && (
        <div className="demo-strip" role="note">
          <strong>{t.demoStrip}</strong> {t.demoStripBody(snapshot.provenance.adapterLabel)}
        </div>
      )}

      <SituationBoard />

      <div className="grid grid--command">
        <Panel
          title={featured ? featured.title : t.noMission}
          eyebrow={
            featured ? (
              <span className="mono">
                {t.featured} · {featured.id}
              </span>
            ) : (
              t.featuredMission
            )
          }
          className="span-2"
          actions={
            featured && <MoreLink href={href.mission(featured.id)}>{t.openMission}</MoreLink>
          }
        >
          {featured ? (
            <MissionInstrument mission={featured} size="xl" />
          ) : (
            <EmptyState title={missionsMissing ? t.missionUnavailable : t.allQuiet}>
              {missionsMissing && t.missionUnavailableBody}
            </EmptyState>
          )}
        </Panel>

        <Panel
          title={t.gate}
          eyebrow={t.gateEyebrow(config.governance.humanAuthority)}
          tone={gates.length ? 'warning' : undefined}
          actions={<MoreLink href={href.approvals()}>{t.allGates}</MoreLink>}
        >
          {gates.length === 0 ? (
            resourceUnavailable(snapshot, 'approvals') ? (
              <EmptyState title={t.approvalUnavailable}>{t.approvalUnavailableBody}</EmptyState>
            ) : (
              <EmptyState title={t.noDecisions} />
            )
          ) : (
            <ul className="gate-mini">
              {gates.map((g) => (
                <li key={g.id}>
                  <a href={href.approvals()} className="gate-mini__item" data-risk={g.risk}>
                    <span className="mono small">{g.id}</span>
                    <span className="gate-mini__title">{g.title}</span>
                    <StatusBadge tone={RISK_TONE[g.risk]} size="sm">
                      {m.search.risk(m.status.risk[g.risk])}
                    </StatusBadge>
                    <span className="small muted">{rel(g.requestedAt, now)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="gate-note">
            {gates.length > 0
              ? t.gatesHeld(gates.length, config.governance.humanAuthority)
              : t.gatesNone(config.governance.humanAuthority)}
          </p>
        </Panel>

        {config.features.forgeFloor && (
          <Panel
            title={t.floor}
            className="span-2"
            actions={<MoreLink href={href.floor()}>{t.fullFloor}</MoreLink>}
          >
            <ForgeFloorMap compact selectedId={selected} onSelect={(id) => setSelected(id)} />
            {selected && (
              <p className="small">
                {t.selected}{' '}
                <a href={href.worker(selected)}>
                  {snapshot.workers.find((w) => w.id === selected)?.name}
                </a>{' '}
                — {t.openFocus}
              </p>
            )}
          </Panel>
        )}

        <Panel title={t.alerts} actions={<MoreLink href={href.alerts()}>{t.allAlerts}</MoreLink>}>
          {alerts.length === 0 ? (
            resourceUnavailable(snapshot, 'alerts') ? (
              <EmptyState title={t.alertUnavailable}>{t.alertUnavailableBody}</EmptyState>
            ) : (
              <EmptyState title={t.noAlerts} />
            )
          ) : (
            <div className="stack">
              {alerts.map((a) => (
                <AlertCard key={a.id} alert={a} compact={a.severity !== 'CRITICAL'} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={t.inFlight(allInFlight.length)}
          className="span-2"
          actions={
            <MoreLink href={href.missions()}>
              {allInFlight.length > inFlight.length
                ? t.allInControl(allInFlight.length)
                : t.missionControl}
            </MoreLink>
          }
        >
          {inFlight.length === 0 ? (
            <EmptyState title={missionsMissing ? t.missionUnavailable : t.nothingInFlight} />
          ) : (
            <div className="mission-list">
              {inFlight.map((m) => (
                <MissionCard key={m.id} mission={m} />
              ))}
            </div>
          )}
          {recentlyDone.length > 0 && (
            <>
              <h3 className="subhead">{t.recentlyFinished}</h3>
              <div className="mission-list">
                {recentlyDone.map((m) => (
                  <MissionCard key={m.id} mission={m} />
                ))}
              </div>
            </>
          )}
        </Panel>

        <div className="stack">
          <Panel title={t.health} id="health" tone={health.tone} focusId="health">
            <div className="health">
              <StatusBadge tone={health.tone} size="lg">
                {m.status.health[snapshot.health.status]}
              </StatusBadge>
              <span className="small muted">{t.checked(rel(snapshot.health.checkedAt, now))}</span>
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

          <Panel title={t.crew} actions={<MoreLink href={href.workers()}>{t.roster}</MoreLink>}>
            {snapshot.workers.length === 0 ? (
              resourceUnavailable(snapshot, 'workers') ? (
                <EmptyState title={t.workerUnavailable}>{t.workerUnavailableBody}</EmptyState>
              ) : (
                <EmptyState title={t.noWorkers}>{t.noWorkersBody}</EmptyState>
              )
            ) : (
              <ul className="crew-strip">
                {snapshot.workers.map((w) => (
                  <li key={w.id}>
                    <a
                      href={href.worker(w.id)}
                      title={`${w.name} — ${m.status.worker[w.state]}`}
                      data-tone={WORKER_STATE_META[w.state].tone}
                    >
                      <CharacterAvatar characterId={w.characterId} state={w.state} size={34} />
                      <span className="visually-hidden">
                        {w.name}: {m.status.worker[w.state]}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title={t.activity}
          className="span-3"
          actions={<MoreLink href={href.activity()}>{t.fullLog}</MoreLink>}
        >
          <ActivityStream limit={14} />
        </Panel>
      </div>
    </div>
  );
}
