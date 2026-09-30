import { lazy, useEffect, type ComponentType } from 'react';

/**
 * Route-level code splitting. Each major surface is its own chunk; the shell,
 * providers, adapters and banners stay in the entry chunk so the frame, data
 * provenance and Red Alert are always available immediately.
 */
export const SURFACE_LOADERS = {
  command: () =>
    import('@/features/command-center/CommandCenter').then((m) => ({ default: m.CommandCenter })),
  floor: () =>
    import('@/features/forge-floor/ForgeFloorPage').then((m) => ({ default: m.ForgeFloorPage })),
  missions: () =>
    import('@/features/missions/MissionsPage').then((m) => ({ default: m.MissionsPage })),
  mission: () =>
    import('@/features/missions/MissionDetail').then((m) => ({ default: m.MissionDetail })),
  workers: () => import('@/features/workers/WorkersPage').then((m) => ({ default: m.WorkersPage })),
  worker: () => import('@/features/workers/WorkerFocus').then((m) => ({ default: m.WorkerFocus })),
  approvals: () =>
    import('@/features/approvals/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })),
  alerts: () => import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })),
  activity: () =>
    import('@/features/activity/ActivityPage').then((m) => ({ default: m.ActivityPage })),
  brief: () => import('@/features/brief/BriefPage').then((m) => ({ default: m.BriefPage })),
  quality: () => import('@/features/quality/QualityPage').then((m) => ({ default: m.QualityPage })),
  settings: () =>
    import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
} as const;

export type SurfaceName = keyof typeof SURFACE_LOADERS;

export const SURFACE_LABEL: Record<SurfaceName, string> = {
  command: 'Command Center',
  floor: 'Forge Floor',
  missions: 'Missions',
  mission: 'Mission',
  workers: 'Workers',
  worker: 'Worker focus',
  approvals: 'Approval Gates',
  alerts: 'Alerts',
  activity: 'Activity',
  brief: 'Founder brief',
  quality: 'Data quality',
  settings: 'Settings',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

/**
 * Fresh set of lazy components. React caches a rejected lazy import forever, so
 * "Retry" after a chunk-load failure creates a new generation.
 */
export function createSurfaces(): Record<SurfaceName, AnyComponent> {
  return Object.fromEntries(
    Object.entries(SURFACE_LOADERS).map(([k, load]) => [
      k,
      lazy(load as () => Promise<{ default: AnyComponent }>),
    ]),
  ) as unknown as Record<SurfaceName, AnyComponent>;
}

/** Warm the other chunks when the browser is idle so navigation stays instant. */
export function usePrefetchSurfaces(): void {
  useEffect(() => {
    const run = () => {
      for (const load of Object.values(SURFACE_LOADERS)) void load().catch(() => undefined);
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(run);
      return () => w.cancelIdleCallback?.(h);
    }
    const t = setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, []);
}
