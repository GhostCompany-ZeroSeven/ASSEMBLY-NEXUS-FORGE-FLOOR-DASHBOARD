import type { AttentionItem, AttentionReason } from './attention';
import type { Freshness } from './freshness';
import { resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';

/**
 * Why an item is in the Founder Attention Queue, from the data alone.
 *
 * Operational explanation, not authority: it states the source fact that
 * triggered the item, what is known, what is unknown, when the evidence was
 * produced (source clock) and received (dashboard clock), how fresh it is,
 * what to inspect, and which surface (if any) can act. It never recommends a
 * decision and never ranks one decision above another.
 *
 * Reason codes (stable, documented in docs/ARCHITECTURE.md):
 *   PENDING_FOUNDER_GATE         gate PENDING/HELD, required authority = the human authority
 *   GATE_AUTHORITY_INVALID       gate open, required authority missing or names a worker
 *   GATE_STATUS_UNRECOGNIZED     gate status UNKNOWN (unrecognized backend value)
 *   ALERT_EXPLICIT_HUMAN_ACTION  alert says human action is required, not acknowledged/resolved
 *   DATA_UNAVAILABLE_AFFECTS_QUEUE  approvals or alerts could not be loaded: queue incomplete
 *   DATA_NOT_CURRENT             disconnected or stale data while items are shown
 * Ordering is transparent: the order above, then oldest source time first, then id.
 * No score, no weight, no prediction.
 */
export type AttentionCode =
  | 'PENDING_FOUNDER_GATE'
  | 'GATE_AUTHORITY_INVALID'
  | 'GATE_STATUS_UNRECOGNIZED'
  | 'ALERT_EXPLICIT_HUMAN_ACTION'
  | 'DATA_UNAVAILABLE_AFFECTS_QUEUE'
  | 'DATA_NOT_CURRENT';

export const ATTENTION_CODE: Record<AttentionReason, AttentionCode> = {
  'gate-open': 'PENDING_FOUNDER_GATE',
  'gate-undecidable': 'GATE_AUTHORITY_INVALID',
  'gate-status-unknown': 'GATE_STATUS_UNRECOGNIZED',
  'alert-human-action': 'ALERT_EXPLICIT_HUMAN_ACTION',
  'data-unavailable': 'DATA_UNAVAILABLE_AFFECTS_QUEUE',
  'data-not-current': 'DATA_NOT_CURRENT',
};

/** A source fact. `value` is raw data (id, enum, authority), shown exactly. */
export type Fact =
  | { key: 'status'; value: string }
  | { key: 'requiredAuthority'; value: string | null }
  | { key: 'requestedBy'; value: string }
  | { key: 'risk'; value: string }
  | { key: 'reversible'; value: boolean }
  | { key: 'humanActionRequired'; value: boolean }
  | { key: 'acknowledged'; value: boolean }
  | { key: 'severity'; value: string }
  | { key: 'resource'; value: string }
  | { key: 'freshness'; value: string };

/** Something the item depends on that the dashboard cannot currently know. */
export type UnknownFact =
  | 'blocked-workers' // workers unavailable: who is blocked on this gate is unknown
  | 'mission-record' // missions unavailable: the gate's mission cannot be shown
  | 'related-alerts' // alerts unavailable: alerts naming this gate are unknown
  | 'queue-completeness' // the queue itself may be missing items
  | 'current-state'; // data is not current: the item may have changed

export type ActionSurface = 'gate-card' | 'alert-card' | 'none';

export interface AttentionExplanation {
  code: AttentionCode;
  trigger: Fact[];
  known: Fact[];
  unknown: UnknownFact[];
  /** When the source says it happened (source clock). */
  sourceTime?: string;
  /** When the dashboard last received data (dashboard clock). */
  receivedAt?: string;
  freshness: string;
  /** Where acting is possible, if anywhere. The queue itself never acts. */
  actionSurface: ActionSurface;
}

export function freshnessLabel(f: Freshness): string {
  return [f.source, ...f.qualifiers].join('+');
}

export function explainAttention(
  item: AttentionItem,
  s: DashboardSnapshot,
  freshness: Freshness,
): AttentionExplanation {
  const code = ATTENTION_CODE[item.reason];
  const receivedAt = s.quality.lastSuccessfulSyncAt ?? s.generatedAt;
  const fresh = freshnessLabel(freshness);
  const notCurrent = freshness.source === 'DISCONNECTED' || freshness.qualifiers.includes('STALE');
  const base = { code, receivedAt, freshness: fresh };

  if (item.source === 'data') {
    return item.reason === 'data-unavailable'
      ? {
          ...base,
          trigger: [{ key: 'resource', value: item.id }],
          known: [],
          unknown: ['queue-completeness'],
          actionSurface: 'none',
        }
      : {
          ...base,
          trigger: [{ key: 'freshness', value: fresh }],
          known: [],
          unknown: ['current-state'],
          actionSurface: 'none',
        };
  }

  if (item.source === 'approval') {
    const a = s.approvals.find((x) => x.id === item.id);
    const unknown: UnknownFact[] = [];
    if (resourceUnavailable(s, 'workers')) unknown.push('blocked-workers');
    if (a?.missionId && resourceUnavailable(s, 'missions')) unknown.push('mission-record');
    if (resourceUnavailable(s, 'alerts')) unknown.push('related-alerts');
    if (notCurrent) unknown.push('current-state');
    const required = typeof a?.requiredAuthority === 'string' ? a.requiredAuthority.trim() : '';
    const trigger: Fact[] =
      item.reason === 'gate-status-unknown'
        ? [{ key: 'status', value: item.state }]
        : item.reason === 'gate-undecidable'
          ? [
              { key: 'status', value: item.state },
              { key: 'requiredAuthority', value: required || null },
            ]
          : [
              { key: 'status', value: item.state },
              { key: 'requiredAuthority', value: required },
            ];
    const known: Fact[] = a
      ? [
          { key: 'requestedBy', value: a.requestedBy },
          { key: 'risk', value: a.risk },
          { key: 'reversible', value: a.reversible },
        ]
      : [];
    return {
      ...base,
      trigger,
      known,
      unknown,
      sourceTime: item.since,
      actionSurface: 'gate-card',
    };
  }

  const al = s.alerts.find((x) => x.id === item.id);
  return {
    ...base,
    trigger: [
      { key: 'humanActionRequired', value: true },
      { key: 'acknowledged', value: false },
    ],
    // Severity is shown as context: it is never, alone, a reason for attention.
    known: al ? [{ key: 'severity', value: al.severity }] : [],
    unknown: notCurrent ? ['current-state'] : [],
    sourceTime: item.since,
    actionSurface: 'alert-card',
  };
}
