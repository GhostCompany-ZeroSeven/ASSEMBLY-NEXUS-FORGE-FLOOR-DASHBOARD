/**
 * Adapter contract rules: the assumptions the dashboard's event and history
 * truth depend on, made explicit and testable.
 *
 * A rule is NOT a guarantee. Whether a data source guarantees it is stated by
 * a contract PROFILE (profiles.ts), and whether it held in a given run is a
 * RUNTIME OBSERVATION (runner.ts). The three are kept apart everywhere.
 *
 * Kinds:
 * - `source-property`: something the data source does or promises (ids,
 *   listing windows, delivery, resume). A test run can only observe it in
 *   that run; it cannot prove a promise.
 * - `adapter-handling`: what this dashboard's adapter does with what it
 *   receives (duplicates, conflicts, time, partial failure, malformed data).
 *
 * Names, descriptions, procedures and expected behaviour are display text in
 * the i18n catalogs (`contract.rule.<ID>`); ids are stable and untranslated.
 */
export const RULE_IDS = [
  'EVENT_ID_UNIQUENESS',
  'EVENT_ID_STABILITY',
  'LISTING_WINDOW_CONTIGUITY',
  'LISTING_ORDERING',
  'DUPLICATE_DELIVERY',
  'AT_LEAST_ONCE_DELIVERY',
  'SAME_ID_CONFLICT_SEMANTICS',
  'RECONNECT_RESUME_SEMANTICS',
  'REST_SSE_RECONCILIATION',
  'EVENT_TIME_SEMANTICS',
  'RECEIVED_TIME_SEMANTICS',
  'HISTORY_TRUNCATION_SIGNAL',
  'RESOURCE_PARTIAL_FAILURE',
  'MALFORMED_RECORD_HANDLING',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export type RuleKind = 'source-property' | 'adapter-handling';

/**
 * How much the DASHBOARD needs the property (not whether anyone provides it):
 * REQUIRED for full event-history truth, OPTIONAL (degrades gracefully when
 * absent), UNKNOWN (not yet known whether a real contract needs it).
 */
export type Requirement = 'REQUIRED' | 'OPTIONAL' | 'UNKNOWN';

export interface RuleDefinition {
  id: RuleId;
  kind: RuleKind;
  requirement: Requirement;
  /**
   * EXACT event coverage depends on this rule being GUARANTEED by the active
   * profile (see `historyAssured`). Contract uncertainty must never inflate
   * coverage confidence.
   */
  historyTruth: boolean;
}

export const RULES: Readonly<Record<RuleId, RuleDefinition>> = {
  EVENT_ID_UNIQUENESS: {
    id: 'EVENT_ID_UNIQUENESS',
    kind: 'source-property',
    requirement: 'REQUIRED',
    historyTruth: true,
  },
  EVENT_ID_STABILITY: {
    id: 'EVENT_ID_STABILITY',
    kind: 'source-property',
    requirement: 'REQUIRED',
    historyTruth: true,
  },
  LISTING_WINDOW_CONTIGUITY: {
    id: 'LISTING_WINDOW_CONTIGUITY',
    kind: 'source-property',
    requirement: 'REQUIRED',
    historyTruth: true,
  },
  LISTING_ORDERING: {
    id: 'LISTING_ORDERING',
    kind: 'source-property',
    requirement: 'OPTIONAL',
    historyTruth: false,
  },
  DUPLICATE_DELIVERY: {
    id: 'DUPLICATE_DELIVERY',
    kind: 'adapter-handling',
    requirement: 'REQUIRED',
    historyTruth: false,
  },
  AT_LEAST_ONCE_DELIVERY: {
    id: 'AT_LEAST_ONCE_DELIVERY',
    kind: 'source-property',
    requirement: 'OPTIONAL',
    historyTruth: false,
  },
  SAME_ID_CONFLICT_SEMANTICS: {
    id: 'SAME_ID_CONFLICT_SEMANTICS',
    kind: 'adapter-handling',
    requirement: 'REQUIRED',
    historyTruth: false,
  },
  RECONNECT_RESUME_SEMANTICS: {
    id: 'RECONNECT_RESUME_SEMANTICS',
    kind: 'source-property',
    requirement: 'UNKNOWN',
    historyTruth: false,
  },
  REST_SSE_RECONCILIATION: {
    id: 'REST_SSE_RECONCILIATION',
    kind: 'adapter-handling',
    requirement: 'REQUIRED',
    historyTruth: false,
  },
  EVENT_TIME_SEMANTICS: {
    id: 'EVENT_TIME_SEMANTICS',
    kind: 'adapter-handling',
    requirement: 'REQUIRED',
    historyTruth: false,
  },
  RECEIVED_TIME_SEMANTICS: {
    id: 'RECEIVED_TIME_SEMANTICS',
    kind: 'adapter-handling',
    requirement: 'REQUIRED',
    historyTruth: false,
  },
  HISTORY_TRUNCATION_SIGNAL: {
    id: 'HISTORY_TRUNCATION_SIGNAL',
    kind: 'adapter-handling',
    requirement: 'OPTIONAL',
    historyTruth: false,
  },
  RESOURCE_PARTIAL_FAILURE: {
    id: 'RESOURCE_PARTIAL_FAILURE',
    kind: 'adapter-handling',
    requirement: 'REQUIRED',
    historyTruth: false,
  },
  MALFORMED_RECORD_HANDLING: {
    id: 'MALFORMED_RECORD_HANDLING',
    kind: 'adapter-handling',
    requirement: 'REQUIRED',
    historyTruth: false,
  },
};

/** Rules EXACT event coverage relies on. */
export const HISTORY_TRUTH_RULES: readonly RuleId[] = RULE_IDS.filter(
  (id) => RULES[id].historyTruth,
);
