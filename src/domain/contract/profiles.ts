import type { DataProvenance } from '../types';
import { HISTORY_TRUTH_RULES, RULE_IDS, RULES, type RuleId } from './rules';

/**
 * Contract profiles: what a data source is stated to guarantee, and on whose
 * authority. A profile is DECLARED BY THE BUILD (adapter configuration), never
 * by backend data, so a backend cannot promote itself.
 *
 * MOCK_PROFILE != REAL ANN CONTRACT. RUNTIME OBSERVATION != GUARANTEE.
 * CONFORMANCE PASS != AUTHORITY, CERTIFICATION or FOUNDER APPROVAL.
 */

/** Where a profile's statements come from. */
export type ProfileProvenance =
  | 'MOCK_PROFILE' // read from this repository's own mock implementation
  | 'FOUNDER_APPROVED_CONTRACT' // reserved: no profile carries it until the Founder approves one
  | 'UNKNOWN';

/** What the profile states about a source property. */
export type Guarantee =
  'GUARANTEED' | 'NOT_GUARANTEED' | 'UNKNOWN' | 'UNSPECIFIED' | 'NOT_APPLICABLE';
/** For capability rules (resume, explicit truncation signal). */
export type Capability = 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNKNOWN';

export interface ProfileClause {
  guarantee: Guarantee;
  capability?: Capability;
  /** Display note key (`contract.note.<key>`), or none. */
  note?: ContractNote;
}

export type ContractNote =
  | 'mockGenerated' // holds for events the mock generates; test injection may break it on purpose
  | 'insertionOrder' // listing order is insertion order, not event-time order
  | 'suffixWindow' // the listing is the newest N in insertion order
  | 'streamAtMostOnce' // stream events emitted while disconnected are lost; the listing may recover them
  | 'noReplay' // no Last-Event-ID/cursor replay; the adapter recovers by REST re-sync
  | 'noTruncationSignal' // the source never says history was truncated; the adapter infers gaps
  | 'duplicatesPossible' // the same event may arrive more than once
  | 'noConflictRule' // the source defines no rule for one id with different facts
  | 'missionSubrecords' // crew, tasks, dependencies and artifacts come inside missions
  | 'handledByAdapter'; // behaviour of this dashboard, verified by the conformance runner

export type ProfileKind = 'MOCK' | 'REAL_ANN_PLACEHOLDER' | 'UNDECLARED' | 'SIMULATED';

export interface ContractProfile {
  id: string;
  kind: ProfileKind;
  provenance: ProfileProvenance;
  /** Always false here: nothing in this repository is a Founder-approved contract. */
  founderApproved: false;
  clauses: Readonly<Record<RuleId, ProfileClause>>;
  /** Transport-level facts; UNSPECIFIED unless stated by the profile's source. */
  transport: {
    endpoints: 'UNSPECIFIED' | 'WIRE_FORMAT_V1';
    stream: 'UNSPECIFIED' | 'SSE_MOCK_CONTRACT';
    authentication: 'UNSPECIFIED' | 'NONE_MOCK';
  };
}

const handling: ProfileClause = { guarantee: 'NOT_APPLICABLE', note: 'handledByAdapter' };

/**
 * The Phase 7 mock backend (the local runtime mock and the in-browser e2e mock).
 * Every statement is read from that implementation. It is NOT the Assembly
 * Nexus contract, not production, and not Founder approved.
 */
export const MOCK_PROFILE: ContractProfile = {
  id: 'forge-floor-mock-v1',
  kind: 'MOCK',
  provenance: 'MOCK_PROFILE',
  founderApproved: false,
  transport: {
    endpoints: 'WIRE_FORMAT_V1',
    stream: 'SSE_MOCK_CONTRACT',
    authentication: 'NONE_MOCK',
  },
  clauses: {
    EVENT_ID_UNIQUENESS: { guarantee: 'GUARANTEED', note: 'mockGenerated' },
    EVENT_ID_STABILITY: { guarantee: 'GUARANTEED' },
    LISTING_WINDOW_CONTIGUITY: { guarantee: 'GUARANTEED', note: 'suffixWindow' },
    LISTING_ORDERING: { guarantee: 'GUARANTEED', note: 'insertionOrder' },
    DUPLICATE_DELIVERY: { ...handling, note: 'duplicatesPossible' },
    AT_LEAST_ONCE_DELIVERY: { guarantee: 'NOT_GUARANTEED', note: 'streamAtMostOnce' },
    SAME_ID_CONFLICT_SEMANTICS: { ...handling, note: 'noConflictRule' },
    RECONNECT_RESUME_SEMANTICS: {
      guarantee: 'NOT_GUARANTEED',
      capability: 'NOT_SUPPORTED',
      note: 'noReplay',
    },
    REST_SSE_RECONCILIATION: handling,
    EVENT_TIME_SEMANTICS: handling,
    RECEIVED_TIME_SEMANTICS: handling,
    HISTORY_TRUNCATION_SIGNAL: {
      ...handling,
      capability: 'NOT_SUPPORTED',
      note: 'noTruncationSignal',
    },
    RESOURCE_PARTIAL_FAILURE: { ...handling, note: 'missionSubrecords' },
    MALFORMED_RECORD_HANDLING: handling,
  },
};

function unknownClauses(): Record<RuleId, ProfileClause> {
  const out = {} as Record<RuleId, ProfileClause>;
  for (const id of RULE_IDS)
    out[id] =
      RULES[id].kind === 'source-property'
        ? {
            guarantee: 'UNKNOWN',
            ...(id === 'RECONNECT_RESUME_SEMANTICS' ? { capability: 'UNKNOWN' as const } : {}),
          }
        : {
            guarantee: 'NOT_APPLICABLE',
            ...(id === 'HISTORY_TRUNCATION_SIGNAL' ? { capability: 'UNKNOWN' as const } : {}),
          };
  return out;
}

/**
 * Placeholder for a FUTURE, Founder-approved Assembly Nexus profile. Every
 * source property is UNKNOWN and every transport fact UNSPECIFIED: no URL,
 * no authentication, no credential and no event semantics are assumed. It
 * becomes meaningful only when the Founder approves a real contract.
 */
export const REAL_ANN_PLACEHOLDER_PROFILE: ContractProfile = {
  id: 'assembly-nexus-unapproved',
  kind: 'REAL_ANN_PLACEHOLDER',
  provenance: 'UNKNOWN',
  founderApproved: false,
  transport: { endpoints: 'UNSPECIFIED', stream: 'UNSPECIFIED', authentication: 'UNSPECIFIED' },
  clauses: unknownClauses(),
};

/** A REST backend whose build declared no profile: nothing is guaranteed. */
export const UNDECLARED_PROFILE: ContractProfile = {
  ...REAL_ANN_PLACEHOLDER_PROFILE,
  id: 'undeclared',
  kind: 'UNDECLARED',
};

/**
 * The local simulation generates its own events inside the dashboard, so a
 * source contract does not apply. Shown as SIMULATED, never as a guarantee.
 */
export const SIMULATED_PROFILE: ContractProfile = {
  ...REAL_ANN_PLACEHOLDER_PROFILE,
  id: 'simulated',
  kind: 'SIMULATED',
  clauses: Object.fromEntries(
    RULE_IDS.map((id) => [id, { guarantee: 'NOT_APPLICABLE' } satisfies ProfileClause]),
  ) as Record<RuleId, ProfileClause>,
};

/** Profiles a build may declare, by id. Anything else is UNDECLARED. */
export const DECLARABLE_PROFILES: Readonly<Record<string, ContractProfile>> = {
  mock: MOCK_PROFILE,
};

/** The profile for a snapshot's provenance (declared by the adapter's build config). */
export function activeProfile(
  p: Pick<DataProvenance, 'mode' | 'contractProfile'>,
): ContractProfile {
  if (p.mode === 'demo') return SIMULATED_PROFILE;
  const id = p.contractProfile;
  return (
    (id !== undefined && Object.hasOwn(DECLARABLE_PROFILES, id) && DECLARABLE_PROFILES[id]) ||
    UNDECLARED_PROFILE
  );
}

/**
 * EXACT event coverage is allowed only when the active profile GUARANTEES
 * every history-truth rule (or the data is generated locally). Otherwise
 * contract uncertainty would inflate coverage confidence.
 */
export function historyAssured(p: Pick<DataProvenance, 'mode' | 'contractProfile'>): boolean {
  return profileAssuresHistory(activeProfile(p));
}

/** A profile GUARANTEES every history-truth rule (locally simulated data always qualifies). */
export function profileAssuresHistory(profile: ContractProfile): boolean {
  if (profile.kind === 'SIMULATED') return true;
  return HISTORY_TRUTH_RULES.every((id) => profile.clauses[id].guarantee === 'GUARANTEED');
}
