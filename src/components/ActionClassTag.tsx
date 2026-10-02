import type { ActionClassification } from '@/domain/operational';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from './Icon';

/**
 * Visible statement of what a control really does (Phase 12 action safety).
 * Shown next to every state-changing control that is a simulation, Founder
 * gated or unavailable, so no control looks more real than it is.
 */
export function ActionClassTag({ c }: { c: ActionClassification }) {
  const { m } = useI18n();
  if (c.cls !== 'DEMO_SIMULATION' && c.cls !== 'FOUNDER_GATED_OPERATION' && c.cls !== 'UNAVAILABLE')
    return null;
  return (
    <span className="action-class" data-action-class={c.cls}>
      <Icon name={c.cls === 'FOUNDER_GATED_OPERATION' ? 'shield' : 'lock'} size={11} />
      {m.ops.action[c.cls]}
      {c.founderGated && c.cls === 'DEMO_SIMULATION' && (
        <span className="action-class__gate"> · {m.ops.action.FOUNDER_GATED_OPERATION}</span>
      )}
    </span>
  );
}
