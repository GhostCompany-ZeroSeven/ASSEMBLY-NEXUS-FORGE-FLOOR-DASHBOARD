import { classifyIssue } from '../dataQuality';
import { resourceUnavailable } from '../selectors';
import type { DashboardSnapshot } from '../snapshot';
import { RULE_IDS, type RuleId } from './rules';

/**
 * What the CURRENT DATA shows about each rule, read passively from the
 * snapshot (no probing, no network). Data-quality issues describe the latest
 * sync, so a duplicate that has left the listing is no longer counted; the
 * history-gap time is kept for the adapter's lifetime. It is a RUNTIME
 * OBSERVATION: it never becomes a guarantee, and "none observed" is not a PASS.
 */
export type SessionObservation =
  | { status: 'violation-observed'; count: number }
  | { status: 'observed'; count: number }
  | { status: 'none-observed' }
  | { status: 'not-observable' }
  | { status: 'not-applicable' };

const count = (n: number, kind: 'violation-observed' | 'observed'): SessionObservation =>
  n > 0 ? { status: kind, count: n } : { status: 'none-observed' };

/** A source time this far ahead of the dashboard clock counts as future-skewed. */
export const FUTURE_SKEW_MS = 60_000;

export function observeSession(
  s: DashboardSnapshot,
  nowMs: number,
  /** Events flagged ARRIVED LATE by the timeline (computed by the caller). */
  arrivedLate: number,
): Record<RuleId, SessionObservation> {
  const na: SessionObservation = { status: 'not-applicable' };
  if (s.provenance.mode === 'demo') {
    return Object.fromEntries(RULE_IDS.map((id) => [id, na])) as Record<RuleId, SessionObservation>;
  }
  let conflicts = 0;
  let duplicates = 0;
  let gaps = 0;
  let records = 0;
  for (const i of s.quality.issues) {
    const c = classifyIssue(i);
    if (c === 'event-conflict') conflicts += 1;
    else if (c === 'duplicate-delivery') duplicates += 1;
    else if (c === 'history-gap') gaps += 1;
    else if (c === 'record-dropped' || c === 'record-repaired') records += 1;
  }
  if (gaps === 0 && s.quality.eventHistoryGapAt) gaps = 1;
  let future = 0;
  let streamed = 0;
  for (const e of s.events) {
    if (Date.parse(e.at) > nowMs + FUTURE_SKEW_MS) future += 1;
    if (e.via === 'stream') streamed += 1;
  }
  return {
    // One id reported with different facts contradicts uniqueness or stability.
    EVENT_ID_UNIQUENESS: count(conflicts, 'violation-observed'),
    EVENT_ID_STABILITY: count(conflicts, 'violation-observed'),
    // A gap is consistent with a contiguous window moving on; contiguity itself
    // cannot be checked without knowing what the source emitted.
    LISTING_WINDOW_CONTIGUITY: { status: 'not-observable' },
    LISTING_ORDERING: { status: 'not-observable' },
    DUPLICATE_DELIVERY: count(duplicates, 'observed'),
    AT_LEAST_ONCE_DELIVERY: { status: 'not-observable' },
    SAME_ID_CONFLICT_SEMANTICS: count(conflicts, 'observed'),
    RECONNECT_RESUME_SEMANTICS: { status: 'not-observable' },
    REST_SSE_RECONCILIATION: count(streamed, 'observed'),
    EVENT_TIME_SEMANTICS: count(future, 'observed'),
    RECEIVED_TIME_SEMANTICS: count(arrivedLate, 'observed'),
    HISTORY_TRUNCATION_SIGNAL: count(gaps, 'observed'),
    RESOURCE_PARTIAL_FAILURE: count(
      ['missions', 'workers', 'approvals', 'alerts', 'events'].filter((r) =>
        resourceUnavailable(s, r),
      ).length,
      'observed',
    ),
    MALFORMED_RECORD_HANDLING: count(records, 'observed'),
  };
}
