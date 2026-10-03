import { useCallback, useMemo } from 'react';
import { missionLabel, resolveNumbering } from '@/domain/missionNumber';
import type { Mission } from '@/domain/types';
import { useConfig, useDashboard } from '@/store/hooks';

/**
 * How every surface refers to a mission: its lifetime number (with the
 * deployment's prefix) when the data source reported one, otherwise the
 * identifier the source gave it. A bare mission id is resolved through the
 * snapshot, so one mission reads the same everywhere.
 */
export function useMissionLabel(): (ref: string | Pick<Mission, 'id' | 'ordinal'>) => string {
  const config = useConfig();
  const { snapshot } = useDashboard();
  const numbering = useMemo(() => resolveNumbering(config.missionNumbering), [config]);
  const byId = useMemo(
    () => new Map((snapshot?.missions ?? []).map((m) => [m.id, m])),
    [snapshot?.missions],
  );
  return useCallback(
    (ref) =>
      missionLabel(typeof ref === 'string' ? (byId.get(ref) ?? { id: ref }) : ref, numbering),
    [byId, numbering],
  );
}
