import type { DataProvenance } from './types';

/** Connection states an adapter can report (mirrors the adapter contract). */
export type ConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed';

/**
 * LIVE requires all of: live mode, a verified backend, a connected transport,
 * and a non-demo adapter. Moving demo data can never produce LIVE.
 */
export function displayMode(
  provenance: DataProvenance,
  connection: ConnectionState,
): DataProvenance['mode'] {
  if (provenance.adapterId === 'demo' || provenance.mode === 'demo') return 'demo';
  if (provenance.mode === 'live') {
    return provenance.verifiedBackend && connection === 'connected' ? 'live' : 'disconnected';
  }
  return provenance.mode;
}
