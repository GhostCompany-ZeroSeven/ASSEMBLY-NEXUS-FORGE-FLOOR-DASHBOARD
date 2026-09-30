import type { IconName } from '@/components/Icon';
import type { Worker } from '@/domain/types';

/**
 * One drawn glyph per state so status never relies on colour alone, including
 * for reduced-motion users (who do not see the working animation). SVG icons,
 * not font characters, so they render identically on every platform.
 */
export const STATE_GLYPH: Record<Worker['state'], IconName> = {
  IDLE: 'state-idle',
  PLANNING: 'state-planning',
  WORKING: 'state-working',
  WAITING: 'state-waiting',
  BLOCKED: 'state-blocked',
  REVIEWING: 'state-reviewing',
  CERTIFYING: 'state-certifying',
  COMPLETE: 'state-complete',
  FAILED: 'state-failed',
  STOPPED: 'state-stopped',
  UNKNOWN: 'state-unknown',
};
