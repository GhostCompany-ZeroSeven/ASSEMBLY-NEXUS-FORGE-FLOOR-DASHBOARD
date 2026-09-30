import { useEffect, useRef, useState } from 'react';
import type { MissionCheckpoint } from '@/domain/missionView';
import { AWAY_AFTER_MS } from '@/store/LastViewProvider';
import { useMissionViews } from '@/store/hooks';

/**
 * The baseline for "what changed in this mission since I last viewed it".
 *
 * - On opening a mission, its stored record (if valid) becomes the baseline for
 *   this visit. It does NOT fall back to the global last view: a mission that
 *   was never viewed says so.
 * - Leaving the mission view, hiding the tab or closing the page records what
 *   was shown (complete, connected data only; see autoRecord.ts).
 * - After at least AWAY_AFTER_MS hidden, the saved view becomes the baseline.
 * - "Mark mission as seen" / "Forget" are explicit, local-only controls.
 *
 * Callers must key the component by mission id so each mission starts fresh.
 */
export function useMissionBaseline(missionId: string) {
  const views = useMissionViews();
  const [baseline, setBaseline] = useState<MissionCheckpoint | null>(() => views.get(missionId));
  const [rejectedAtOpen] = useState(() => views.rejected(missionId));
  const api = useRef(views);
  useEffect(() => {
    api.current = views;
  }, [views]);

  useEffect(() => {
    let hiddenAt: number | null = null;
    let saved: MissionCheckpoint | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        saved = api.current.record(missionId, true);
      } else if (hiddenAt !== null) {
        const away = Date.now() - hiddenAt >= AWAY_AFTER_MS;
        hiddenAt = null;
        if (away && saved) setBaseline(saved);
      }
    };
    const onPageHide = () => api.current.record(missionId, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      // Leaving this mission's view is "having looked at it".
      api.current.record(missionId, true);
    };
  }, [missionId]);

  return {
    baseline,
    rejected: rejectedAtOpen && baseline === null,
    storage: views.storage,
    markSeen: () => setBaseline(api.current.record(missionId, false)),
    forget: () => {
      api.current.forget(missionId);
      setBaseline(null);
    },
  };
}
