import type { WorkerState } from '@/domain/types';
import type { CharacterPose, ImageCharacter } from './types';

export interface PoseContext {
  /** Worker is currently walking between rooms. */
  moving?: boolean;
  /** Worker is blocked on an open approval gate. */
  waitingForFounder?: boolean;
}

/**
 * Presentation-only pose. Priority: moving → waiting-for-Founder → state.
 * Nothing here affects governance or identity.
 */
export function resolvePose(state: WorkerState, ctx: PoseContext = {}): CharacterPose {
  if (ctx.moving) return 'moving';
  if (ctx.waitingForFounder) return 'waiting-founder';
  switch (state) {
    case 'IDLE':
    case 'STOPPED':
      return 'idle';
    case 'PLANNING':
    case 'WORKING':
    case 'REVIEWING':
    case 'CERTIFYING':
      return 'working';
    case 'WAITING':
    case 'BLOCKED':
      return 'blocked';
    case 'COMPLETE':
      return 'complete';
    case 'FAILED':
      return 'failed';
    case 'UNKNOWN':
      return 'default';
  }
}

/**
 * Pick the best image for a pose. Order: room+pose → room default → pose →
 * legacy per-state → default src. Missing art never breaks rendering.
 */
export function resolveImageSrc(
  def: ImageCharacter,
  pose: CharacterPose,
  state: WorkerState,
  roomId?: string,
): string {
  const room = roomId ? def.rooms?.[roomId] : undefined;
  if (typeof room === 'string') return room;
  return (
    room?.[pose] ??
    room?.default ??
    def.poses?.[pose] ??
    def.stateSrc?.[state] ??
    def.poses?.default ??
    def.src
  );
}
