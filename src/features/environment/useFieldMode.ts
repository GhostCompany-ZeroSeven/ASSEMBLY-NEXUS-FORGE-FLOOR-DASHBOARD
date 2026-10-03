import { useHashQuery } from '@/app/router';
import { useConfig, usePreferences } from '@/store/hooks';
import type { FieldMode } from './dotField';

/**
 * The ambient dot field's effective mode. Nexus Signature ships it ON for a
 * deployment that enables it (`environment.ambientField`); a deployment
 * without it never shows the field. A reduced-motion preference (system or
 * Settings) turns FULL into REDUCED: a stationary lattice whose colour cycle
 * and exit fade are frozen (a Forge Floor adaptation; C5 has none).
 * `?field=off` / `?field=reduced` remain as review overrides.
 */
export function useFieldMode(): FieldMode {
  const { environment } = useConfig();
  const { reducedMotion } = usePreferences();
  const requested = useHashQuery().field;
  if (!environment?.ambientField) return 'off';
  if (requested === 'off') return 'off';
  if (requested === 'reduced') return 'reduced';
  return reducedMotion ? 'reduced' : 'full';
}
