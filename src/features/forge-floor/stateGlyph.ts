import type { Worker } from '@/domain/types';

/**
 * One glyph per state so status never relies on colour alone, including for
 * reduced-motion users (who do not see the working animation).
 */
export const STATE_GLYPH: Record<Worker['state'], string> = {
  IDLE: 'z',
  PLANNING: '✎',
  WORKING: '⚒',
  WAITING: '…',
  BLOCKED: '!',
  REVIEWING: '◎',
  CERTIFYING: '✦',
  COMPLETE: '✓',
  FAILED: '✕',
  STOPPED: '■',
  UNKNOWN: '?',
};
