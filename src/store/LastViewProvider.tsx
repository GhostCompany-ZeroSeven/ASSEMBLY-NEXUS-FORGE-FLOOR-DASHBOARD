import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ConnectionStatus } from '@/adapters/types';
import { createCheckpoint, type Checkpoint } from '@/domain/checkpoint';
import { resourceUnavailable } from '@/domain/selectors';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { LastViewContext } from './contexts';
import { useDashboard } from './hooks';
import { clearCheckpoint, loadCheckpoint, saveCheckpoint, type LastViewStorage } from './lastView';

export interface LastViewContextValue {
  /** The baseline the change digest compares against (null = none known). */
  baseline: Checkpoint | null;
  storage: LastViewStorage;
  /** Record what is on screen now as "seen". */
  markSeen: () => void;
  /** Forget the baseline; the digest then says history is UNKNOWN. */
  clear: () => void;
}

/** Hidden at least this long counts as "away": on return, the saved view becomes the baseline. */
export const AWAY_AFTER_MS = 5 * 60_000;

/** An automatic checkpoint is recorded only from complete, connected data. */
function canAutoRecord(
  s: DashboardSnapshot | null,
  status: ConnectionStatus,
): s is DashboardSnapshot {
  if (!s || status !== 'connected') return false;
  return !['missions', 'workers', 'approvals', 'alerts', 'events'].some((r) =>
    resourceUnavailable(s, r),
  );
}

/**
 * Owns the "last looked" checkpoint for this browser.
 *
 * - On load, the stored checkpoint (validated, fail-closed) is the baseline.
 * - When the page is hidden or closed, what was on screen is saved, but only
 *   from complete, connected data; otherwise the older complete checkpoint is kept
 *   (an outage at the moment of leaving must not erase the baseline).
 * - After being away for AWAY_AFTER_MS, the saved view becomes the baseline.
 * - "Mark as seen" and "Clear" are explicit viewer controls.
 *
 * Nothing here grants, records or implies any decision or authority.
 */
export function LastViewProvider({ children }: { children: ReactNode }) {
  const { snapshot, status } = useDashboard();
  const [state, setState] = useState(() => {
    const { checkpoint, storage } = loadCheckpoint(Date.now());
    return { baseline: checkpoint, storage };
  });
  const live = useRef({ snapshot, status });
  useEffect(() => {
    live.current = { snapshot, status };
  }, [snapshot, status]);

  useEffect(() => {
    let hiddenAt: number | null = null;
    let saved: Checkpoint | null = null;
    const record = () => {
      const { snapshot: s, status: st } = live.current;
      if (!canAutoRecord(s, st)) return;
      const cp = createCheckpoint(s, new Date().toISOString());
      if (saveCheckpoint(cp)) saved = cp;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        saved = null;
        record();
      } else if (hiddenAt !== null) {
        const away = Date.now() - hiddenAt >= AWAY_AFTER_MS;
        hiddenAt = null;
        if (away && saved) {
          const next = saved;
          setState({ baseline: next, storage: 'ok' });
        }
      }
    };
    window.addEventListener('pagehide', record);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', record);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const markSeen = useCallback(() => {
    const s = live.current.snapshot;
    if (!s) return;
    const cp = createCheckpoint(s, new Date().toISOString());
    const ok = saveCheckpoint(cp);
    setState({ baseline: cp, storage: ok ? 'ok' : 'unavailable' });
  }, []);

  const clear = useCallback(() => {
    const ok = clearCheckpoint();
    setState({ baseline: null, storage: ok ? 'none' : 'unavailable' });
  }, []);

  const value = useMemo<LastViewContextValue>(
    () => ({ baseline: state.baseline, storage: state.storage, markSeen, clear }),
    [state, markSeen, clear],
  );
  return <LastViewContext.Provider value={value}>{children}</LastViewContext.Provider>;
}
