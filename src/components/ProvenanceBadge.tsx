import type { ConnectionStatus } from '@/adapters/types';
import type { DataProvenance } from '@/domain/types';

const MODE_LABEL: Record<DataProvenance['mode'], string> = {
  demo: 'DEMO · SIMULATED',
  live: 'LIVE',
  replay: 'REPLAY',
  disconnected: 'DISCONNECTED',
};

/**
 * Always-visible data provenance. A "LIVE" label is only shown when the
 * adapter reports a verified backend; anything else is visibly not live.
 */
export function ProvenanceBadge({
  provenance,
  connection,
}: {
  provenance: DataProvenance;
  connection: ConnectionStatus;
}) {
  const mode =
    provenance.mode === 'live' && !provenance.verifiedBackend ? 'disconnected' : provenance.mode;
  return (
    <div className="provenance" data-mode={mode} title={provenance.note}>
      <span className="provenance__mode">{MODE_LABEL[mode]}</span>
      <span className="provenance__source">
        {provenance.adapterLabel}
        {mode === 'demo' && ' — local demo data, no backend connected'}
        {connection !== 'connected' && ` (${connection})`}
      </span>
    </div>
  );
}
