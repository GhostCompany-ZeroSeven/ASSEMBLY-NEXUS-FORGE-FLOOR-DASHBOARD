import { useEffect, useMemo, useRef, useState } from 'react';
import { DataStatusBanners } from '@/components/DataStatusBanners';
import { Icon, type IconName } from '@/components/Icon';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { SimulationControlsBar } from '@/components/SimulationControlsBar';
import { StatusBadge } from '@/components/ui';
import { selectOverview, redAlertActive } from '@/domain/selectors';
import { HEALTH_STATUS_META } from '@/domain/status';
import { formatTimeOfDay } from '@/domain/time';
import { RedAlertBanner } from '@/features/alerts/RedAlertBanner';
import { buildCommands, resultToCommand } from '@/features/command/commands';
import { buildSearchIndex, searchIndex } from '@/features/search/search';
import { useGlobalShortcuts } from '@/features/command/useGlobalShortcuts';
import { useSimulation } from '@/hooks/useSimulation';
import { useConfig, useDashboard, useNow, usePreferences } from '@/store/hooks';
import { createSurfaces, SURFACE_LABEL, usePrefetchSurfaces } from './surfaces';
import { Suspense, SurfaceErrorBoundary, SurfaceLoading, SurfaceReady } from './SurfaceParts';
import { href, navigate, parseHashQuery, routeKey, useRoute, type Route } from './router';

// Dialogs are small and load eagerly on purpose. If lazy, the frame turns `inert`
// before the dialog mounts, focus falls to <body>, keystrokes typed right after
// Ctrl+K are lost, and focus cannot be restored on close.
import { CommandPalette } from '@/features/command/CommandPalette';
import { ShortcutsDialog } from '@/features/command/ShortcutsDialog';

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
  const { snapshot, status, error, retry } = useDashboard();
  const prefs = usePreferences();
  const simState = useSimulation();
  const [dialog, setDialog] = useState<'palette' | 'shortcuts' | null>(null);
  const route = useRoute();
  const now = useNow(1000);
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to main content on navigation for keyboard/screen-reader users.
  // Not on first load, so Tab still reaches the skip link and header first.
  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    // Deep links (?focus=…) move focus to their target themselves.
    if (parseHashQuery(window.location.hash).focus) return;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey(route)]);

  useGlobalShortcuts({
    enabled: snapshot !== null,
    singleKey: prefs.singleKeyShortcuts,
    dialogOpen: dialog !== null,
    openPalette: () => setDialog('palette'),
    openShortcuts: () => setDialog('shortcuts'),
    navigate,
    toggleSim: simState ? () => simState.sim.setRunning(!simState.running) : undefined,
    stepSim: simState ? () => simState.sim.step() : undefined,
    isFeatureOn: (flag) => !flag || Boolean(config.features[flag as keyof typeof config.features]),
  });

  const commands = useMemo(
    () =>
      snapshot && dialog === 'palette'
        ? buildCommands({
            snapshot,
            config,
            navigate,
            sim: simState ? { controls: simState.sim, running: simState.running } : null,
            openShortcuts: () => setDialog('shortcuts'),
            setTheme: prefs.setThemeId,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dialog, snapshot, config, simState?.running, prefs.setThemeId],
  );

  const search = useMemo(() => {
    if (!snapshot || dialog !== 'palette') return undefined;
    const index = buildSearchIndex(snapshot, config.floor);
    return (q: string) => searchIndex(index, q).map((r) => resultToCommand(r, navigate));
  }, [dialog, snapshot, config.floor]);

  if (!snapshot) {
    return (
      <main className="boot">
        <h1 className="boot__mark">{config.branding.monogram}</h1>
        {status === 'error' ? (
          <div role="alert" className="boot__text">
            <p>
              <strong>Adapter error.</strong> The data source could not be initialised:{' '}
              {error ?? 'unknown error'}
            </p>
            <p className="muted">No data is shown because none has been verified.</p>
            <button type="button" className="btn" onClick={retry}>
              Retry
            </button>
          </div>
        ) : (
          <p className="boot__text" role="status">
            Connecting to data source…
          </p>
        )}
      </main>
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
      <div className="shell__frame" inert={dialog !== null}>
        <a
          className="skip-link"
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            mainRef.current?.focus();
          }}
        >
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

          <button
            type="button"
            className="topbar__palette"
            onClick={() => setDialog('palette')}
            aria-keyshortcuts="Control+K Meta+K"
            title="Command palette (Ctrl/⌘+K)"
          >
            <Icon name="command" size={14} />
            <span className="topbar__palette-label">Commands</span>
            <kbd>Ctrl K</kbd>
          </button>

          <a
            className="topbar__health"
            href={href.command()}
            aria-label={`System health: ${health.label}`}
          >
            <Icon name="health" size={16} />
            <StatusBadge tone={health.tone} size="sm">
              {health.label}
            </StatusBadge>
          </a>
          <div className="topbar__clock" role="timer" aria-label="Local time">
            <Icon name="clock" size={16} />
            <time dateTime={new Date(now).toISOString()}>
              {formatTimeOfDay(new Date(now).toISOString())}
            </time>
          </div>
          <div className="topbar__authority" title="Human authority for approval gates">
            <Icon name="lock" size={14} />
            {config.governance.humanAuthority}
          </div>
        </header>

        {redAlert && <RedAlertBanner />}
        <DataStatusBanners />

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
      {dialog === 'palette' && (
        <CommandPalette commands={commands} search={search} onClose={() => setDialog(null)} />
      )}
      {dialog === 'shortcuts' && (
        <ShortcutsDialog onClose={() => setDialog(null)} hasSimulation={simState !== null} />
      )}
    </div>
  );
}

function RouteView({ route }: { route: Route }) {
  // A new generation of lazy components after a chunk-load failure (see surfaces.tsx).
  const [{ generation, surfaces }, setSurfaces] = useState(() => ({
    generation: 0,
    surfaces: createSurfaces(),
  }));
  usePrefetchSurfaces();

  if (route.name === 'not-found') {
    return (
      <SurfaceReady name="not-found">
        <div className="page">
          <h1 className="page__title">Not found</h1>
          <p>
            No surface at <code>{route.path}</code>.{' '}
            <a href={href.command()}>Return to Command Center</a>.
          </p>
        </div>
      </SurfaceReady>
    );
  }
  const Surface = surfaces[route.name];
  const label = SURFACE_LABEL[route.name];
  const props =
    route.name === 'mission'
      ? { missionId: route.id }
      : route.name === 'worker'
        ? { workerId: route.id }
        : {};
  return (
    <SurfaceErrorBoundary
      key={generation}
      label={label}
      onRetry={() =>
        setSurfaces((cur) => ({ generation: cur.generation + 1, surfaces: createSurfaces() }))
      }
    >
      <Suspense fallback={<SurfaceLoading label={label} />}>
        <SurfaceReady name={route.name}>
          <Surface {...props} />
        </SurfaceReady>
      </Suspense>
    </SurfaceErrorBoundary>
  );
}
