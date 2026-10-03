import { lazy, Suspense } from 'react';
import type { FieldMode } from './dotField';

/**
 * Optional environmental layer (Visual DNA Wave B prototype).
 *
 * OFF by default (see useFieldMode). When off, nothing is rendered and the
 * renderer module and its styles are never loaded.
 */
const FieldCanvas = lazy(() => import('./NexusFieldCanvas'));

export function NexusField({ mode }: { mode: FieldMode }) {
  if (mode === 'off') return null;
  return (
    <Suspense fallback={null}>
      <FieldCanvas mode={mode} />
    </Suspense>
  );
}
