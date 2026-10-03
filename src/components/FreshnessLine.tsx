import type { Freshness } from '@/domain/freshness';
import type { Tone } from '@/domain/status';
import { useI18n } from '@/i18n/useI18n';
import { StatusBadge } from './ui';

const MODE_KEY = {
  SIMULATED: 'demo',
  LIVE: 'live',
  DISCONNECTED: 'disconnected',
  REPLAY: 'replay',
} as const;

/** Data source and qualifiers, next to page content (the topbar badge stays the source of truth). */
export function FreshnessLine({ freshness }: { freshness: Freshness }) {
  const { m } = useI18n();
  const tone: Tone =
    freshness.source === 'LIVE'
      ? 'connected'
      : freshness.source === 'DISCONNECTED'
        ? 'danger'
        : 'warning';
  return (
    <div className="brief__freshness" data-freshness={freshness.source}>
      <span className="brief__freshness-label">{m.brief.dataSource}</span>
      <StatusBadge tone={tone} size="sm">
        {m.provenance.mode[MODE_KEY[freshness.source]]}
      </StatusBadge>
      {freshness.qualifiers.map((q) => (
        <StatusBadge key={q} tone="warning" size="sm">
          {m.provenance.qualifier[q]}
        </StatusBadge>
      ))}
    </div>
  );
}
