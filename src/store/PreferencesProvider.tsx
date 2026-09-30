import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PreferencesContext } from './contexts';

export type MotionPreference = 'system' | 'reduced' | 'full';
export type Density = 'comfortable' | 'compact';

export interface Preferences {
  themeId: string;
  motion: MotionPreference;
  density: Density;
}

export interface PreferencesContextValue extends Preferences {
  setThemeId: (id: string) => void;
  setMotion: (m: MotionPreference) => void;
  setDensity: (d: Density) => void;
  /** Resolved: true when animations should be minimised. */
  reducedMotion: boolean;
}

const STORAGE_KEY = 'forge-floor:preferences';

function load(defaults: Preferences): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return defaults;
  }
}

function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** Per-viewer UI preferences (theme, motion, density), persisted locally. */
export function PreferencesProvider({
  defaultThemeId,
  children,
}: {
  defaultThemeId: string;
  children: ReactNode;
}) {
  const [prefs, setPrefs] = useState<Preferences>(() =>
    load({ themeId: defaultThemeId, motion: 'system', density: 'comfortable' }),
  );
  const [systemReduced, setSystemReduced] = useState(systemPrefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystemReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — preferences stay in memory */
    }
    const root = document.documentElement;
    root.dataset.theme = prefs.themeId;
    root.dataset.density = prefs.density;
  }, [prefs]);

  const reducedMotion = prefs.motion === 'reduced' || (prefs.motion === 'system' && systemReduced);

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full';
  }, [reducedMotion]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...prefs,
      reducedMotion,
      setThemeId: (themeId) => setPrefs((p) => ({ ...p, themeId })),
      setMotion: (motion) => setPrefs((p) => ({ ...p, motion })),
      setDensity: (density) => setPrefs((p) => ({ ...p, density })),
    }),
    [prefs, reducedMotion],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
