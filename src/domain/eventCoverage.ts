import type { DashboardEvent } from './events';

/**
 * Event coverage: how much the dashboard can honestly say about events since a
 * checkpoint.
 *
 * Evidence used, and nothing else:
 * - Event IDENTITY (`id`) is opaque. It answers "did we observe this before?"
 *   and never "which came first". No ordering is read from ids.
 * - Event TIME (`at`) is the source's clock. It is compared only with other
 *   source times (the checkpoint stores the newest source time it had seen),
 *   never with the browser clock, so source/browser clock skew cannot fake an
 *   exact count.
 * - Arrival (`receivedAt`) is the dashboard's clock and is not used here.
 *
 * States:
 * - `exact`: the retained history provably reaches back to what the checkpoint
 *   had seen, so every event since then that the source still lists is here.
 * - `lower-bound`: some new events were observed, but earlier ones may have been
 *   dropped from the retained window. "At least N", never "N".
 * - `unknown`: nothing can be said (events unavailable now or then, or no new
 *   event observed while coverage is unproven). Never shown as zero.
 * - `not-applicable`: there is no comparable checkpoint.
 */
export type CoverageState = 'exact' | 'lower-bound' | 'unknown' | 'not-applicable';

export type CoverageReason =
  | 'no-baseline'
  | 'events-unavailable-now'
  | 'events-unavailable-then'
  | 'history-starts-after-checkpoint'
  | 'no-history-at-checkpoint'
  | 'history-gap';

export interface EventWatermark {
  /** Ids of the events retained at the checkpoint (bounded). */
  ids: string[];
  /** Newest source event time seen at the checkpoint (display/context only). */
  newestAt?: string;
  /** Id of that newest event: coverage is proven when it is still retained. */
  newestId?: string;
  /** True when more ids existed than could be stored. */
  truncated?: boolean;
}

export const MAX_WATERMARK_IDS = 600;

export interface EventCoverage {
  state: CoverageState;
  /** Exact count when `exact`; the observed count (a floor) when `lower-bound`; else null. */
  count: number | null;
  /** Distinct events not seen at the checkpoint (always reported, for context). */
  observedNew: number;
  /** Ids of those events (for "new since your view" tags). */
  newIds: Set<string>;
  reason?: CoverageReason;
  /** Oldest retained source event time now (the retained-history boundary). */
  retainedFrom?: string;
}

/** Build a watermark from the events that are relevant to a checkpoint. */
export function createWatermark(events: readonly DashboardEvent[]): EventWatermark {
  const ids = [...new Set(events.map((e) => e.id))];
  let newest: DashboardEvent | undefined;
  for (const e of events) if (!newest || e.at > newest.at) newest = e;
  return {
    ids: ids.slice(-MAX_WATERMARK_IDS),
    newestAt: newest?.at,
    newestId: newest?.id,
    truncated: ids.length > MAX_WATERMARK_IDS || undefined,
  };
}

/**
 * Compare current retained events (already scoped by the caller, e.g. to one
 * mission) with a checkpoint watermark.
 *
 * @param availableNow  the events resource loaded in the latest sync
 * @param watermark     undefined when events were unavailable at the checkpoint
 * @param gapSinceCheckpoint  a break in event-history continuity was detected
 *   after the checkpoint (see `historyGapSince`): events may have been missed
 *   even though the checkpoint's newest event is still retained.
 */
export function eventCoverage(
  events: readonly DashboardEvent[],
  watermark: EventWatermark | undefined,
  availableNow: boolean,
  hasBaseline = true,
  gapSinceCheckpoint = false,
): EventCoverage {
  const empty = new Set<string>();
  if (!hasBaseline)
    return {
      state: 'not-applicable',
      count: null,
      observedNew: 0,
      newIds: empty,
      reason: 'no-baseline',
    };
  if (!availableNow)
    return {
      state: 'unknown',
      count: null,
      observedNew: 0,
      newIds: empty,
      reason: 'events-unavailable-now',
    };
  let retainedFrom: string | undefined;
  for (const e of events)
    if (retainedFrom === undefined || e.at < retainedFrom) retainedFrom = e.at;
  if (!watermark)
    return {
      state: 'unknown',
      count: null,
      observedNew: 0,
      newIds: empty,
      reason: 'events-unavailable-then',
      retainedFrom,
    };

  const seen = new Set(watermark.ids);
  const newIds = new Set<string>();
  for (const e of events) if (!seen.has(e.id)) newIds.add(e.id);
  const observedNew = newIds.size;

  // Coverage is proven by IDENTITY overlap: the newest event the checkpoint
  // had seen is still retained. The retained log drops its oldest entries first
  // (reducer, REST window), so every event listed after that one is still here.
  // No clock is compared with another clock.
  let proven: boolean;
  let reason: CoverageReason | undefined;
  if (watermark.newestId === undefined) {
    // Nothing was retained then: we cannot tell whether events were dropped since.
    proven = false;
    reason = 'no-history-at-checkpoint';
  } else {
    proven = events.some((e) => e.id === watermark.newestId) && !watermark.truncated;
    if (!proven) reason = 'history-starts-after-checkpoint';
    else if (gapSinceCheckpoint) {
      proven = false;
      reason = 'history-gap';
    }
  }
  if (proven) return { state: 'exact', count: observedNew, observedNew, newIds, retainedFrom };
  if (observedNew > 0)
    return { state: 'lower-bound', count: observedNew, observedNew, newIds, reason, retainedFrom };
  return { state: 'unknown', count: null, observedNew, newIds, reason, retainedFrom };
}

/**
 * Whether the adapter detected an event-history gap after a checkpoint. Both
 * times are THIS dashboard's clock (the checkpoint's recording time and the
 * adapter's detection time); no source time is involved.
 */
export function historyGapSince(
  quality: { eventHistoryGapAt?: string },
  checkpointAt: string,
): boolean {
  const gap = quality.eventHistoryGapAt ? Date.parse(quality.eventHistoryGapAt) : NaN;
  const cp = Date.parse(checkpointAt);
  // An unreadable checkpoint time cannot rule a gap out.
  return !Number.isNaN(gap) && (Number.isNaN(cp) || gap >= cp);
}

/** Validate an untrusted stored watermark. Throws on any malformed field. */
export function parseWatermark(v: unknown): EventWatermark | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('bad watermark');
  const o = v as Record<string, unknown>;
  if (
    !Array.isArray(o.ids) ||
    o.ids.length > MAX_WATERMARK_IDS ||
    !o.ids.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 200)
  )
    throw new Error('bad watermark ids');
  if (
    o.newestAt !== undefined &&
    (typeof o.newestAt !== 'string' || Number.isNaN(Date.parse(o.newestAt)))
  )
    throw new Error('bad watermark time');
  if (o.newestId !== undefined && (typeof o.newestId !== 'string' || o.newestId.length > 200))
    throw new Error('bad watermark newest id');
  return {
    ids: o.ids as string[],
    newestAt: o.newestAt as string | undefined,
    newestId: o.newestId as string | undefined,
    truncated: o.truncated === true || undefined,
  };
}
