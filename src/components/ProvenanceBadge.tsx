import type { ConnectionStatus } from '@/adapters/types';
import { selectFreshness } from '@/domain/freshness';
import { displayMode } from '@/domain/provenance';
import type { DataProvenance } from '@/domain/types';
import { useI18n } from '@/i18n/useI18n';
import { useNow, useSnapshot } from '@/store/hooks';

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
  const { m } = useI18n();
  const MODE_LABEL = m.provenance.mode;
  const TRANSPORT_LABEL = m.provenance.transport;
  const mode = displayMode(provenance, connection);
  // Qualifiers coexist with the source (e.g. LIVE + PARTIAL); see domain/freshness.ts.
  const now = useNow(5000);
  const freshness = selectFreshness(useSnapshot(), connection, now);
  const qualifiers = freshness.qualifiers.filter((q) => q !== 'UNKNOWN');
  const qText = qualifiers.map((q) => m.provenance.qualifier[q]).join(', ');
  return (
    <div
      className="provenance"
      data-mode={mode}
      title={provenance.note}
      role="status"
      data-transport-mode={provenance.transport}
      data-qualifiers={qualifiers.join(' ') || undefined}
      aria-label={`${m.provenance.aria(
        MODE_LABEL[mode],
        provenance.adapterLabel,
        provenance.environment,
        mode !== 'demo' && provenance.transport ? TRANSPORT_LABEL[provenance.transport] : undefined,
      )}${qText ? m.provenance.qualifiersAria(qText) : ''}`}
    >
      <span className="provenance__mode">{MODE_LABEL[mode]}</span>
      {mode === 'live' && provenance.environment && (
        <span className="provenance__env">{provenance.environment.toUpperCase()}</span>
      )}
      {qualifiers.map((q) => (
        <span key={q} className="provenance__qualifier" data-qualifier={q}>
          {m.provenance.qualifier[q]}
        </span>
      ))}
      {mode !== 'demo' && provenance.transport && (
        <span className="provenance__transport" data-transport={provenance.transport}>
          {TRANSPORT_LABEL[provenance.transport]}
        </span>
      )}
      <span className="provenance__source" aria-hidden="true">
        {provenance.adapterLabel}
        {mode === 'demo' && m.provenance.demoSuffix}
        {connection !== 'connected' && ` (${m.connection[connection] ?? connection})`}
      </span>
    </div>
  );
}
