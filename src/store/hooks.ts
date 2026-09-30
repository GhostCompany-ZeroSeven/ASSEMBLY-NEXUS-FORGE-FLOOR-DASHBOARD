import { useContext, useEffect, useState } from 'react';
import { ConfigContext, DashboardContext, PreferencesContext } from './contexts';
import type { DashboardSnapshot } from '@/domain/snapshot';

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return ctx;
}

/** Snapshot accessor for components rendered only after the first snapshot. */
export function useSnapshot(): DashboardSnapshot {
  const { snapshot } = useDashboard();
  if (!snapshot) throw new Error('Snapshot not loaded yet');
  return snapshot;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used inside <ConfigProvider>');
  return ctx;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}

/** Wall clock that re-renders every `intervalMs`. Drives timers. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
