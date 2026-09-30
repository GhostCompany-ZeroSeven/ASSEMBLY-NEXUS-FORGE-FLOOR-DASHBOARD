import type { ConnectionStatus } from '@/adapters/types';
import { displayMode } from './provenance';
import { isStale, resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';

/**
 * Data freshness model: ONE source state plus independent qualifiers that may
 * coexist, so the UI can say exactly what is true without collapsing states.
 *
 *   source      SIMULATED | LIVE | DISCONNECTED | REPLAY   (from displayMode)
 *   qualifiers  STALE, PARTIAL, UNKNOWN (some resources could not be loaded),
 *               LAST KNOWN DATA (disconnected, but earlier verified data is shown)
 *
 * Valid combinations include LIVE + PARTIAL, LIVE + STALE, and
 * DISCONNECTED + LAST KNOWN DATA. SIMULATED never carries LIVE.
 *
 * TRANSPORT LIVE ≠ COMPLETE DATA: `complete` is true only when the source is
 * LIVE and no qualifier applies. A connected stream never implies completeness.
 *
 * Founder decision (open, deliberately NOT decided here): whether LIVE should
 * require a complete first sync. This model only describes the current rule
 * (verified backend + connected transport) and shows the qualifiers next to it.
 */
export type FreshnessSource = 'SIMULATED' | 'LIVE' | 'DISCONNECTED' | 'REPLAY';
export type FreshnessQualifier = 'STALE' | 'PARTIAL' | 'UNKNOWN' | 'LAST_KNOWN';

export interface Freshness {
  source: FreshnessSource;
  qualifiers: FreshnessQualifier[];
  /** Resources whose latest fetch failed (their answers are UNKNOWN). */
  unknownResources: ('workers' | 'missions' | 'approvals' | 'alerts')[];
  /** LIVE and nothing stale, partial or unknown. Never inferred from transport alone. */
  complete: boolean;
}

const SOURCE: Record<ReturnType<typeof displayMode>, FreshnessSource> = {
  demo: 'SIMULATED',
  live: 'LIVE',
  disconnected: 'DISCONNECTED',
  replay: 'REPLAY',
};

export function selectFreshness(
  s: DashboardSnapshot,
  connection: ConnectionStatus,
  nowMs: number,
): Freshness {
  const source = SOURCE[displayMode(s.provenance, connection)];
  if (source === 'SIMULATED') {
    // Simulated data is never "fresh" or "stale" in a backend sense: it is simulated.
    return { source, qualifiers: [], unknownResources: [], complete: false };
  }
  const unknownResources = (['workers', 'missions', 'approvals', 'alerts'] as const).filter((r) =>
    resourceUnavailable(s, r),
  );
  const qualifiers: FreshnessQualifier[] = [];
  if (isStale(s, nowMs)) qualifiers.push('STALE');
  if (s.quality.partial) qualifiers.push('PARTIAL');
  if (unknownResources.length) qualifiers.push('UNKNOWN');
  if (source === 'DISCONNECTED' && s.quality.lastSuccessfulSyncAt) qualifiers.push('LAST_KNOWN');
  return {
    source,
    qualifiers,
    unknownResources: [...unknownResources],
    complete: source === 'LIVE' && qualifiers.length === 0,
  };
}
