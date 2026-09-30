import type { Freshness } from '@/domain/freshness';
import type { Messages } from './en';

const MODE_KEY = {
  SIMULATED: 'demo',
  LIVE: 'live',
  DISCONNECTED: 'disconnected',
  REPLAY: 'replay',
} as const;

/** Localized "SOURCE · QUALIFIER · …" text for a freshness value. */
export function freshnessText(m: Messages, f: Pick<Freshness, 'source' | 'qualifiers'>): string {
  return [
    m.provenance.mode[MODE_KEY[f.source]],
    ...f.qualifiers.map((q) => m.provenance.qualifier[q]),
  ].join(' · ');
}

/** Localized text for a stored "SOURCE+QUALIFIER" code (see attentionExplain.freshnessLabel). */
export function freshnessCodeText(m: Messages, code: string): string {
  const [source, ...qualifiers] = code.split('+');
  if (!source || !(source in MODE_KEY)) return code;
  return freshnessText(m, {
    source: source as Freshness['source'],
    qualifiers: qualifiers.filter((q): q is Freshness['qualifiers'][number] =>
      ['STALE', 'PARTIAL', 'UNKNOWN', 'LAST_KNOWN'].includes(q),
    ),
  });
}
