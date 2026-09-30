import { href, withQuery } from '@/app/router';
import type { Freshness } from './freshness';
import { isOpenForDecision, isWorkerIdentity } from './governance';
import { resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';

/**
 * Founder Attention Queue: what the data says is waiting on the human
 * authority, and where to go to look at it.
 *
 * INFORMATION AND NAVIGATION ONLY. An entry never approves, denies, holds,
 * dispatches, certifies or grants anything, and appearing in the queue is not
 * evidence of authority (DISPLAYED FOUNDER ATTENTION != FOUNDER APPROVAL).
 * Decisions stay on the approval gate card, behind `checkDecision`.
 *
 * Attention is derived from explicit facts only, never from severity alone:
 * - an OPEN gate (PENDING/HELD) whose required authority is the human authority
 * - an OPEN gate that cannot be decided because its authority is missing or a worker
 * - a gate whose status is UNKNOWN (unrecognised backend status)
 * - an unresolved, unacknowledged alert that says human action is required
 * - resources that could not be loaded (the queue may be incomplete)
 * - data that is not current while items are shown
 */
export type AttentionSource = 'approval' | 'alert' | 'data';

export type AttentionReason =
  | 'data-unavailable'
  | 'data-not-current'
  | 'gate-open'
  | 'gate-undecidable'
  | 'gate-status-unknown'
  | 'alert-human-action';

export interface AttentionRelation {
  kind: 'mission' | 'worker';
  id: string;
  /** Current display name from the data; the id when the record is not present. */
  label: string;
  href: string;
}

export interface AttentionItem {
  key: string;
  source: AttentionSource;
  reason: AttentionReason;
  /** Record id (approval/alert), or the unavailable resource name for data items. */
  id: string;
  /** Title from the data (never generated text). */
  label: string;
  /** Current state as an enum value (approval status, alert phase, freshness source). */
  state: string;
  /** When the source says the item began (requestedAt / raisedAt). */
  since?: string;
  href: string;
  /** Records the data explicitly links to this item. Never inferred. */
  related: AttentionRelation[];
}

export interface AttentionQueue {
  items: AttentionItem[];
  /**
   * False when the approvals or alerts resource could not be loaded: the queue
   * is then INCOMPLETE and an empty list must not be read as "nothing waiting".
   */
  complete: boolean;
  /** Count of record items (gates + alerts); `null` when incomplete. */
  count: number | null;
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

const REASON_ORDER: AttentionReason[] = [
  'data-unavailable',
  'data-not-current',
  'gate-open',
  'gate-undecidable',
  'gate-status-unknown',
  'alert-human-action',
];

export function selectAttentionQueue(
  s: DashboardSnapshot,
  humanAuthority: string,
  freshness: Freshness,
): AttentionQueue {
  const items: AttentionItem[] = [];
  const missionLabel = (id: string) => s.missions.find((m) => m.id === id)?.title ?? id;

  for (const r of ['approvals', 'alerts'] as const) {
    if (!resourceUnavailable(s, r)) continue;
    items.push({
      key: `data:${r}`,
      source: 'data',
      reason: 'data-unavailable',
      id: r,
      label: r,
      state: 'UNKNOWN',
      href: r === 'approvals' ? href.approvals() : href.alerts(),
      related: [],
    });
  }

  for (const a of s.approvals) {
    const open = isOpenForDecision(a);
    let reason: AttentionReason | null = null;
    if (a.status === 'UNKNOWN') reason = 'gate-status-unknown';
    else if (open) {
      const required = typeof a.requiredAuthority === 'string' ? a.requiredAuthority.trim() : '';
      if (!required || isWorkerIdentity(required, s.workers, a.requestedBy))
        reason = 'gate-undecidable';
      else if (norm(required) === norm(humanAuthority)) reason = 'gate-open';
    }
    if (!reason) continue;
    const related: AttentionRelation[] = [];
    if (a.missionId)
      related.push({
        kind: 'mission',
        id: a.missionId,
        label: missionLabel(a.missionId),
        href: href.mission(a.missionId),
      });
    for (const w of s.workers)
      if (w.blockers.some((b) => b.dependsOn?.kind === 'approval' && b.dependsOn.id === a.id))
        related.push({ kind: 'worker', id: w.id, label: w.name, href: href.worker(w.id) });
    items.push({
      key: `approval:${a.id}`,
      source: 'approval',
      reason,
      id: a.id,
      label: a.title,
      state: a.status,
      since: a.requestedAt,
      href: withQuery(href.approvals(), { focus: a.id }),
      related,
    });
  }

  for (const al of s.alerts) {
    if (!al.humanActionRequired || al.resolvedAt || al.acknowledgedAt) continue;
    const related: AttentionRelation[] = [];
    for (const x of al.affected) {
      if (x.kind === 'mission')
        related.push({ kind: 'mission', id: x.id, label: x.label, href: href.mission(x.id) });
      else if (x.kind === 'worker')
        related.push({ kind: 'worker', id: x.id, label: x.label, href: href.worker(x.id) });
    }
    items.push({
      key: `alert:${al.id}`,
      source: 'alert',
      reason: 'alert-human-action',
      id: al.id,
      label: al.title,
      state: 'open',
      since: al.raisedAt,
      href: withQuery(href.alerts(), { focus: al.id }),
      related,
    });
  }

  const recordCount = items.filter((i) => i.source !== 'data').length;
  // Items shown from data that is not current must say so, next to them.
  if (
    recordCount > 0 &&
    (freshness.source === 'DISCONNECTED' || freshness.qualifiers.includes('STALE'))
  ) {
    items.push({
      key: 'data:freshness',
      source: 'data',
      reason: 'data-not-current',
      id: 'freshness',
      label: 'freshness',
      state: freshness.source === 'DISCONNECTED' ? 'DISCONNECTED' : 'STALE',
      href: withQuery(href.settings(), { focus: 'transport' }),
      related: [],
    });
  }

  items.sort(
    (a, b) =>
      REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason) ||
      (a.since ?? '').localeCompare(b.since ?? '') ||
      a.id.localeCompare(b.id),
  );
  const complete = !resourceUnavailable(s, 'approvals') && !resourceUnavailable(s, 'alerts');
  return { items, complete, count: complete ? recordCount : null };
}
