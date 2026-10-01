import type { WorkerState } from '@/domain/types';
import { SnowWolfBandit, type BanditActivity } from './forge/SnowWolfBandit';
import type { WolfAppearance } from './types';

/**
 * Snow Wolf crew avatar: the Snow Wolf Bandit (small, ski-masked, gold chain)
 * fitted into the shared 64 x 80 avatar box. Founder correction (Phase 9):
 * never a silver/gray realistic wolf. State is always also stated in text by
 * the surrounding UI; the pose is decoration only.
 */
export function WolfFigure({
  appearance: a,
  state,
}: {
  appearance: WolfAppearance;
  state: WorkerState;
}) {
  const activity: BanditActivity =
    state === 'WORKING' ? 'console' : state === 'REVIEWING' ? 'inspect' : 'idle';
  return (
    <g transform="translate(1 4) scale(0.62)">
      <SnowWolfBandit fur="snow" hoodie={a.coat} accent={a.accent} headphones activity={activity} />
    </g>
  );
}
