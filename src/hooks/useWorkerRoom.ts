import { useMemo } from 'react';
import type { RoomDefinition } from '@/config/types';
import { layoutFloor } from '@/features/forge-floor/layout';
import { useConfig, useSnapshot } from '@/store/hooks';

/**
 * Where each worker currently stands on the floor. Room position is derived
 * from state routing (layout.ts). It is presentation, never authority.
 */
export function useWorkerRoom(): (workerId: string) => RoomDefinition | undefined {
  const { floor } = useConfig();
  const { workers } = useSnapshot();
  const placements = useMemo(() => layoutFloor(workers, floor), [workers, floor]);
  return (id) => floor.rooms.find((r) => r.id === placements.get(id)?.roomId);
}
