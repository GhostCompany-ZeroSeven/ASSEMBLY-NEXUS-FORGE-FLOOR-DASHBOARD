import type { ConnectionStatus } from '@/adapters/types';
import { displayMode } from '@/domain/provenance';
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
  const mode = displayMode(provenance, connection);
  return (
    <div
      className="provenance"
      data-mode={mode}
      title={provenance.note}
      role="status"
      aria-label={`Data source: ${MODE_LABEL[mode]}, ${provenance.adapterLabel}${
        provenance.environment ? `, ${provenance.environment} environment` : ''
      }`}
    >
      <span className="provenance__mode">{MODE_LABEL[mode]}</span>
      {mode === 'live' && provenance.environment && (
        <span className="provenance__env">{provenance.environment.toUpperCase()}</span>
      )}
      <span className="provenance__source" aria-hidden="true">
        {provenance.adapterLabel}
        {mode === 'demo' && ' — local demo data, no backend connected'}
        {connection !== 'connected' && ` (${connection})`}
      </span>
    </div>
  );
}
