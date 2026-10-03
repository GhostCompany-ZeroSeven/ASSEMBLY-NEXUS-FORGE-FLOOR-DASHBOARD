import { useEffect, useMemo, useRef, useState } from 'react';
import { DataStatusBanners } from '@/components/DataStatusBanners';
import { Icon, type IconName } from '@/components/Icon';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { SimulationControlsBar } from '@/components/SimulationControlsBar';
import { StatusBadge } from '@/components/ui';
import { selectFreshness } from '@/domain/freshness';
import { isStale, selectOverview, redAlertActive } from '@/domain/selectors';
import { selectHealthReport } from '@/domain/operational';
import { healthTone } from '@/domain/status';
import { useI18n } from '@/i18n/useI18n';
import { RedAlertBanner } from '@/features/alerts/RedAlertBanner';
import { buildCommands, resultToCommand } from '@/features/command/commands';
import { buildSearchIndex, searchIndex } from '@/features/search/search';
import { useGlobalShortcuts } from '@/features/command/useGlobalShortcuts';
import { useSimulation } from '@/hooks/useSimulation';
import { useConfig, useDashboard, useNow, usePreferences } from '@/store/hooks';
import { createSurfaces, usePrefetchSurfaces } from './surfaces';
import { Suspense, SurfaceErrorBoundary, SurfaceLoading, SurfaceReady } from './SurfaceParts';
import {
  href,
  navigate,
  parseHashQuery,
  routeKey,
  useRoute,
  withQuery,
  type Route,
} from './router';

// Dialogs are small and load eagerly on purpose. If lazy, the frame turns `inert`
// before the dialog mounts, focus falls to <body>, keystrokes typed right after
// Ctrl+K are lost, and focus cannot be restored on close.
import { CommandPalette } from '@/features/command/CommandPalette';
import { ShortcutsDialog } from '@/features/command/ShortcutsDialog';
import { BrandHierarchy } from '@/components/BrandHierarchy';

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
  const i18n = useI18n();
  const { m } = i18n;

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
            m,
            locale: i18n.locale,
            setLocale: i18n.setPreference,
            hash: window.location.hash,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dialog, snapshot, config, simState?.running, prefs.setThemeId, m, i18n.locale],
  );

  // Every search result carries the data's provenance when it is not LIVE and
  // current (SEARCH MATCH ≠ CURRENTNESS). A string, so the index is not rebuilt per tick.
  const f = snapshot ? selectFreshness(snapshot, status, now) : null;
  const searchProvenance = !f
    ? undefined
    : f.source === 'SIMULATED' || f.source === 'REPLAY' || f.source === 'DISCONNECTED'
      ? m.search.provenance[f.source]
      : f.qualifiers.includes('STALE')
        ? m.search.provenance.STALE
        : // Some resources failed: their results are last known, not current.
          f.qualifiers.includes('PARTIAL') || f.qualifiers.includes('UNKNOWN')
          ? m.search.provenance.PARTIAL
          : undefined;

  // One index per palette opening (rebuilt only when the data or language changes).
  const search = useMemo(() => {
    if (!snapshot || dialog !== 'palette') return undefined;
    const index = buildSearchIndex(snapshot, config.floor, m, config.missionNumbering);
    return (q: string) =>
      searchIndex(index, q).map((r) => resultToCommand(r, navigate, m, searchProvenance));
  }, [dialog, snapshot, config.floor, config.missionNumbering, m, searchProvenance]);

  if (!snapshot) {
    return (
      <main className="boot">
        <h1 className="boot__mark">{config.branding.monogram}</h1>
        {status === 'error' ? (
          <div role="alert" className="boot__text">
            <p>
              <strong>{m.shell.adapterError}</strong>{' '}
              {m.shell.adapterErrorBody(error ?? m.common.unknown)}
            </p>
            <p className="muted">{m.shell.noVerifiedData}</p>
            <button type="button" className="btn" onClick={retry}>
              {m.common.retry}
            </button>
          </div>
        ) : (
          <p className="boot__text" role="status">
            {m.shell.connecting}
          </p>
        )}
      </main>
    );
  }

  const stats = selectOverview(snapshot);
  const redAlert = config.features.redAlertMode && redAlertActive(snapshot);
  // The global badge follows the same rule as every other health surface.
  const healthBadgeTone = healthTone({
    status: snapshot.health.status,
    connection: status,
    stale: isStale(snapshot, now),
    partial: snapshot.quality.partial,
    simulated: selectHealthReport(snapshot).simulated,
  });

  const nav: NavItem[] = [
    { route: 'command', label: m.nav.command, icon: 'command', href: href.command() },
    { route: 'brief', label: m.nav.brief, icon: 'info', href: href.brief() },
    ...(config.features.forgeFloor
      ? [
          {
            route: 'floor' as const,
            label: m.nav.floor,
            icon: 'floor' as const,
            href: href.floor(),
          },
        ]
      : []),
    {
      route: 'missions',
      label: m.nav.missions,
      icon: 'mission',
      href: href.missions(),
      count: stats.activeMissions,
    },
    {
      route: 'workers',
      label: m.nav.workers,
      icon: 'workers',
      href: href.workers(),
      count: stats.workersTotal,
    },
    ...(config.features.approvals
      ? [
          {
            route: 'approvals' as const,
            label: m.nav.approvals,
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
            label: m.nav.alerts,
            icon: 'alert' as const,
            href: href.alerts(),
            count: stats.alertsOpen,
            countTone: stats.alertsCritical > 0 ? ('danger' as const) : ('warning' as const),
          },
        ]
      : []),
    { route: 'activity', label: m.nav.activity, icon: 'activity', href: href.activity() },
    { route: 'settings', label: m.nav.settings, icon: 'settings', href: href.settings() },
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
          {m.nav.skip}
        </a>
        <header className="topbar">
          <a
            className="brand"
            href={href.command()}
            aria-label={m.nav.home(config.branding.productName, config.branding.surfaceName)}
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
            title={m.shell.paletteTitle}
          >
            <Icon name="command" size={14} />
            <span className="topbar__palette-label">{m.shell.commands}</span>
            <kbd>Ctrl K</kbd>
          </button>

          <a
            className="topbar__health"
            href={withQuery(href.command(), { focus: 'health' })}
            aria-label={m.shell.health(m.status.health[snapshot.health.status])}
          >
            <Icon name="health" size={16} />
            <StatusBadge tone={healthBadgeTone} size="sm">
              {m.status.health[snapshot.health.status]}
            </StatusBadge>
          </a>
          <div className="topbar__clock" role="timer" aria-label={m.shell.localTime}>
            <Icon name="clock" size={16} />
            <time dateTime={new Date(now).toISOString()}>
              {i18n.time(new Date(now).toISOString())}
            </time>
          </div>
          <div className="topbar__authority" title={m.shell.authorityTitle}>
            <Icon name="lock" size={14} />
            {config.governance.humanAuthority}
          </div>
        </header>

        {redAlert && <RedAlertBanner />}
        <DataStatusBanners />

        <div className="shell__body">
          <nav className="sidenav" aria-label={m.nav.primary}>
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
                <BrandHierarchy
                  lines={config.branding.hierarchy}
                  layout={config.branding.hierarchyLayout}
                  label={m.nav.identityHierarchy}
                />
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
  const { m } = useI18n();

  if (route.name === 'not-found') {
    return (
      <SurfaceReady name="not-found">
        <div className="page">
          <h1 className="page__title">{m.shell.notFound}</h1>
          <p>
            {m.shell.notFoundBody(route.path)} <a href={href.command()}>{m.shell.returnHome}</a>.
          </p>
        </div>
      </SurfaceReady>
    );
  }
  const Surface = surfaces[route.name];
  const label = m.surface.label[route.name];
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
