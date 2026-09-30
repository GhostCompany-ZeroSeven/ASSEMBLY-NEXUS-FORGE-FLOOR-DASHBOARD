import { useEffect, useLayoutEffect, useRef } from 'react';
import { GO_KEYS, isTypingTarget } from './commands';

export interface ShortcutHandlers {
  enabled: boolean;
  singleKey: boolean;
  dialogOpen: boolean;
  openPalette: () => void;
  openShortcuts: () => void;
  navigate: (hash: string) => void;
  toggleSim?: () => void;
  stepSim?: () => void;
  isFeatureOn: (flag: string | undefined) => boolean;
}

const SEQUENCE_TIMEOUT_MS = 1200;

/**
 * Global keyboard layer:
 * - Ctrl/⌘ + K toggles the palette (always on).
 * - Single-key shortcuts (/, ?, G then letter, P, N) only when enabled, never while
 *   typing, never with Ctrl/Alt/Meta held, and never while a dialog is open.
 */
export function useGlobalShortcuts(h: ShortcutHandlers): void {
  const ref = useRef(h);
  useLayoutEffect(() => {
    ref.current = h;
  });

  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      const s = ref.current;
      if (!s.enabled || e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!s.dialogOpen) s.openPalette();
        return;
      }
      if (!s.singleKey || s.dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key;
      if (pendingG && Date.now() - pendingG < SEQUENCE_TIMEOUT_MS) {
        pendingG = 0;
        const go = GO_KEYS.find((g) => g.key === key.toLowerCase());
        if (go && s.isFeatureOn(go.flag)) {
          e.preventDefault();
          s.navigate(go.target());
        }
        return;
      }
      pendingG = 0;
      switch (key) {
        case 'g':
        case 'G':
          pendingG = Date.now();
          break;
        case '/':
          e.preventDefault();
          s.openPalette();
          break;
        case '?':
          e.preventDefault();
          s.openShortcuts();
          break;
        case 'p':
        case 'P':
          if (s.toggleSim) {
            e.preventDefault();
            s.toggleSim();
          }
          break;
        case 'n':
        case 'N':
          if (s.stepSim) {
            e.preventDefault();
            s.stepSim();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
