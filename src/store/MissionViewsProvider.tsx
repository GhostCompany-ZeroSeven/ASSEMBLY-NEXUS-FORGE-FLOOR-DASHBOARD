import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { selectFreshness } from '@/domain/freshness';
import { createMissionCheckpoint, type MissionCheckpoint } from '@/domain/missionView';
import { canAutoRecord } from './autoRecord';
import { MissionViewsContext } from './contexts';
import { useDashboard } from './hooks';
import {
  boundViews,
  clearMissionViews,
  loadMissionViews,
  MISSION_VIEWS_KEY,
  saveMissionViews,
  type MissionViewsStorage,
} from './missionViews';

export interface MissionViewsContextValue {
  /** The stored "last viewed" record of a mission (null: none, or rejected). */
  get: (missionId: string) => MissionCheckpoint | null;
  /** True when a stored record for this mission was invalid and ignored. */
  rejected: (missionId: string) => boolean;
  storage: MissionViewsStorage;
  /**
   * Record what is on screen for this mission. `auto` records only from
   * complete, connected data (see autoRecord.ts). Local only: no backend call.
   */
  record: (missionId: string, auto: boolean) => MissionCheckpoint | null;
  /** Forget this mission's record (local only). */
  forget: (missionId: string) => void;
  /** Forget every mission record (local only). */
  forgetAll: () => void;
}

/**
 * Owns the per-mission "last viewed" records for this browser. Other tabs'
 * writes are picked up through the `storage` event (last write wins; each
 * record is replaced whole, so a record is never half-merged).
 */
export function MissionViewsProvider({ children }: { children: ReactNode }) {
  const { snapshot, status } = useDashboard();
  const [state, setState] = useState(() => loadMissionViews(Date.now()));
  const live = useRef({ snapshot, status, views: state.views });
  useEffect(() => {
    live.current = { snapshot, status, views: state.views };
  }, [snapshot, status, state.views]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MISSION_VIEWS_KEY || e.key === null) setState(loadMissionViews(Date.now()));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const record = useCallback((missionId: string, auto: boolean) => {
    const { snapshot: s, status: st, views } = live.current;
    if (!s || (auto && !canAutoRecord(s, st))) return null;
    const now = Date.now();
    const cp = createMissionCheckpoint(
      s,
      missionId,
      selectFreshness(s, st, now),
      new Date(now).toISOString(),
    );
    const next = boundViews({ ...views, [missionId]: cp });
    const ok = saveMissionViews(next);
    live.current = { ...live.current, views: next };
    setState((prev) => {
      const rejected = new Set(prev.rejected);
      rejected.delete(missionId);
      return { views: next, rejected, storage: ok ? 'ok' : 'unavailable' };
    });
    return cp;
  }, []);

  const forget = useCallback((missionId: string) => {
    const next = { ...live.current.views };
    delete next[missionId];
    const ok = saveMissionViews(next);
    live.current = { ...live.current, views: next };
    setState((prev) => {
      const rejected = new Set(prev.rejected);
      rejected.delete(missionId);
      return { views: next, rejected, storage: ok ? prev.storage : 'unavailable' };
    });
  }, []);

  const forgetAll = useCallback(() => {
    const ok = clearMissionViews();
    const empty = Object.create(null) as Record<string, MissionCheckpoint>;
    live.current = { ...live.current, views: empty };
    setState({ views: empty, rejected: new Set(), storage: ok ? 'none' : 'unavailable' });
  }, []);

  const value = useMemo<MissionViewsContextValue>(
    () => ({
      get: (id) =>
        Object.prototype.hasOwnProperty.call(state.views, id) ? state.views[id]! : null,
      rejected: (id) => state.rejected.has(id),
      storage: state.storage,
      record,
      forget,
      forgetAll,
    }),
    [state, record, forget, forgetAll],
  );
  return <MissionViewsContext.Provider value={value}>{children}</MissionViewsContext.Provider>;
}
