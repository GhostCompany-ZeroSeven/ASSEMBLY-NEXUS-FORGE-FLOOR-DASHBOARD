import { useEffect, useRef } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { SimulationControlsBar } from '@/components/SimulationControlsBar';
import { StatusBadge } from '@/components/ui';
import { selectOverview, redAlertActive } from '@/domain/selectors';
import { HEALTH_STATUS_META } from '@/domain/status';
import { formatTimeOfDay } from '@/domain/time';
import { RedAlertBanner } from '@/features/alerts/RedAlertBanner';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { ActivityPage } from '@/features/activity/ActivityPage';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { CommandCenter } from '@/features/command-center/CommandCenter';
import { ForgeFloorPage } from '@/features/forge-floor/ForgeFloorPage';
import { MissionDetail } from '@/features/missions/MissionDetail';
import { MissionsPage } from '@/features/missions/MissionsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { WorkerFocus } from '@/features/workers/WorkerFocus';
import { WorkersPage } from '@/features/workers/WorkersPage';
import { useConfig, useDashboard, useNow } from '@/store/hooks';
import { href, useRoute, type Route } from './router';

interface NavItem {
  route: Route['name'];
  label: string;
  icon: IconName;
  href: string;
  count?: number;
  countTone?: 'warning' | 'danger';
}

export function Shell() {
  const config = useConfig();
  const { snapshot, status, error } = useDashboard();
  const route = useRoute();
  const now = useNow(1000);
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to main content on navigation for keyboard/screen-reader users.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
  }, [route.name]);

  if (!snapshot) {
    return (
      <div className="boot" role="status">
        <div className="boot__mark">{config.branding.monogram}</div>
        <div className="boot__text">
          {status === 'error'
            ? `Adapter failed to connect: ${error ?? 'unknown error'}`
            : 'Connecting to data source…'}
        </div>
      </div>
    );
  }

  const stats = selectOverview(snapshot);
  const redAlert = config.features.redAlertMode && redAlertActive(snapshot);
  const health = HEALTH_STATUS_META[snapshot.health.status];

  const nav: NavItem[] = [
    { route: 'command', label: 'Command Center', icon: 'command', href: href.command() },
    ...(config.features.forgeFloor
      ? [
          {
            route: 'floor' as const,
            label: 'Forge Floor',
            icon: 'floor' as const,
            href: href.floor(),
          },
        ]
      : []),
    {
      route: 'missions',
      label: 'Missions',
      icon: 'mission',
      href: href.missions(),
      count: stats.activeMissions,
    },
    {
      route: 'workers',
      label: 'Workers',
      icon: 'workers',
      href: href.workers(),
      count: stats.workersTotal,
    },
    ...(config.features.approvals
      ? [
          {
            route: 'approvals' as const,
            label: 'Approval Gates',
            icon: 'gate' as const,
            href: href.approvals(),
            count: stats.approvalsPending,
            countTone: 'warning' as const,
          },
        ]
      : []),
    ...(config.features.alerts
      ? [
          {
            route: 'alerts' as const,
            label: 'Alerts',
            icon: 'alert' as const,
            href: href.alerts(),
            count: stats.alertsOpen,
            countTone: stats.alertsCritical > 0 ? ('danger' as const) : ('warning' as const),
          },
        ]
      : []),
    { route: 'activity', label: 'Activity', icon: 'activity', href: href.activity() },
    { route: 'settings', label: 'Settings', icon: 'settings', href: href.settings() },
  ];

  const activeNav =
    route.name === 'mission' ? 'missions' : route.name === 'worker' ? 'workers' : route.name;

  return (
    <div className="shell" data-red-alert={redAlert ? 'true' : undefined}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a
          className="brand"
          href={href.command()}
          aria-label={`${config.branding.productName} ${config.branding.surfaceName} home`}
        >
          <span className="brand__mark" aria-hidden="true">
            {config.branding.monogram}
          </span>
          <span className="brand__text">
            <span className="brand__product">{config.branding.productName}</span>
            <span className="brand__surface">{config.branding.surfaceName}</span>
          </span>
        </a>

        <ProvenanceBadge provenance={snapshot.provenance} connection={status} />

        <div className="topbar__spacer" />

        <SimulationControlsBar />

        <a className="topbar__health" href={href.command() + '#health'} title="System health">
          <Icon name="health" size={16} />
          <StatusBadge tone={health.tone} size="sm">
            {health.label}
          </StatusBadge>
        </a>
        <div className="topbar__clock" aria-label="Local time">
          <Icon name="clock" size={16} />
          <span>{formatTimeOfDay(new Date(now).toISOString())}</span>
        </div>
        <div className="topbar__authority" title="Human authority for approval gates">
          <Icon name="lock" size={14} />
          {config.governance.humanAuthority}
        </div>
      </header>

      {redAlert && <RedAlertBanner />}

      <div className="shell__body">
        <nav className="sidenav" aria-label="Primary">
          <ul>
            {nav.map((item) => (
              <li key={item.route}>
                <a
                  href={item.href}
                  className="sidenav__link"
                  aria-current={activeNav === item.route ? 'page' : undefined}
                >
                  <Icon name={item.icon} />
                  <span className="sidenav__label">{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="sidenav__count" data-tone={item.countTone}>
                      {item.count}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          <div className="sidenav__footer">
            {config.branding.hierarchy.length > 0 && (
              <ol className="hierarchy" aria-label="Identity hierarchy">
                {config.branding.hierarchy.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            )}
          </div>
        </nav>

        <main id="main" ref={mainRef} tabIndex={-1} className="main">
          <RouteView route={route} />
        </main>
      </div>
    </div>
  );
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'command':
      return <CommandCenter />;
    case 'floor':
      return <ForgeFloorPage />;
    case 'missions':
      return <MissionsPage />;
    case 'mission':
      return <MissionDetail missionId={route.id} />;
    case 'workers':
      return <WorkersPage />;
    case 'worker':
      return <WorkerFocus workerId={route.id} />;
    case 'approvals':
      return <ApprovalsPage />;
    case 'alerts':
      return <AlertsPage />;
    case 'activity':
      return <ActivityPage />;
    case 'settings':
      return <SettingsPage />;
    case 'not-found':
      return (
        <div className="page">
          <h1 className="page__title">Not found</h1>
          <p>
            No surface at <code>{route.path}</code>.{' '}
            <a href={href.command()}>Return to Command Center</a>.
          </p>
        </div>
      );
  }
}
