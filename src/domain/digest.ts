import { href, withQuery } from '@/app/router';
import { alertPhase, type Checkpoint } from './checkpoint';
import { eventCoverage, type CoverageState } from './eventCoverage';
import { resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';
import type { ApprovalStatus, MissionStatus } from './types';

/**
 * "What changed since I last looked": a comparison between the stored
 * checkpoint and what the dashboard shows now, plus events observed since.
 *
 * Truth rules:
 * - Only observable data is used. Nothing is reconstructed.
 * - A category is a number only when BOTH sides are known. Otherwise it is
 *   `null` (UNKNOWN) with a reason. UNKNOWN is never shown as "nothing changed".
 * - A record missing from the current data is "no longer reported", never
 *   "deleted" or "completed".
 * - The digest is information/navigation only; it carries no authority.
 */
export type DigestCategory =
  | 'missionsNew'
  | 'missionsStarted'
  | 'missionsCompleted'
  | 'missionsFailed'
  | 'workersChanged'
  | 'approvalsNew'
  | 'approvalsResolved'
  | 'alertsOpened'
  | 'alertsResolved'
  | 'artifactsNew'
  | 'statusBecameUnknown'
  | 'noLongerReported'
  | 'events';

export const DIGEST_CATEGORIES: readonly DigestCategory[] = [
  'missionsNew',
  'missionsStarted',
  'missionsCompleted',
  'missionsFailed',
  'workersChanged',
  'approvalsNew',
  'approvalsResolved',
  'alertsOpened',
  'alertsResolved',
  'artifactsNew',
  'statusBecameUnknown',
  'noLongerReported',
  'events',
];

export type UnknownReason =
  | 'no-baseline'
  | 'different-source'
  | 'unavailable-then'
  | 'unavailable-now'
  | 'history-truncated'
  | 'baseline-truncated';

export type DigestEntity = 'mission' | 'worker' | 'approval' | 'alert' | 'artifact';

export interface DigestItem {
  category: DigestCategory;
  entity: DigestEntity;
  id: string;
  /** Display name from the CURRENT data (title/name), or the id if gone. */
  label: string;
  /** Enum values (localized by the UI), never display text. */
  from?: string;
  to?: string;
  href: string;
}

export interface Digest {
  baseline: 'none' | 'different-source' | 'ok';
  since?: string;
  /** Source/verification at the checkpoint vs now (evidence of transport change). */
  sourceThen?: Checkpoint['mode'];
  sourceNow: Checkpoint['mode'];
  counts: Record<DigestCategory, number | null>;
  unknown: Partial<Record<DigestCategory, UnknownReason>>;
  /**
   * Retained events timestamped after the checkpoint. Equals `counts.events`
   * when that is known; otherwise a LOWER BOUND (never presented as a total).
   */
  eventsObserved: number;
  /** How far the event count can be trusted (see eventCoverage.ts). */
  eventCoverage: CoverageState;
  items: DigestItem[];
  /** Items beyond the display cap (counts stay exact). */
  moreItems: number;
}

export const MAX_DIGEST_ITEMS = 150;
const OPEN: readonly ApprovalStatus[] = ['PENDING', 'HELD'];
const RESOLVED: readonly ApprovalStatus[] = ['APPROVED', 'DENIED', 'EXPIRED', 'WITHDRAWN'];
const NOT_STARTED: readonly MissionStatus[] = ['QUEUED'];

const allUnknown = (reason: UnknownReason) => ({
  counts: Object.fromEntries(DIGEST_CATEGORIES.map((c) => [c, null])) as Record<
    DigestCategory,
    null
  >,
  unknown: Object.fromEntries(DIGEST_CATEGORIES.map((c) => [c, reason])) as Record<
    DigestCategory,
    UnknownReason
  >,
});

/** Own-property lookup: record ids such as "constructor" must not hit the prototype. */
function own<T>(map: Record<string, T>, id: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : undefined;
}

export function computeDigest(s: DashboardSnapshot, cp: Checkpoint | null): Digest {
  const sourceNow = s.provenance.mode;
  if (!cp) {
    return {
      baseline: 'none',
      sourceNow,
      eventsObserved: 0,
      eventCoverage: 'not-applicable',
      items: [],
      moreItems: 0,
      ...allUnknown('no-baseline'),
    };
  }
  if (cp.adapterId !== s.provenance.adapterId) {
    return {
      baseline: 'different-source',
      since: cp.at,
      sourceThen: cp.mode,
      sourceNow,
      eventsObserved: 0,
      eventCoverage: 'not-applicable',
      items: [],
      moreItems: 0,
      ...allUnknown('different-source'),
    };
  }

  const counts = {} as Record<DigestCategory, number | null>;
  const unknown: Partial<Record<DigestCategory, UnknownReason>> = {};
  const items: DigestItem[] = [];
  const add = (item: DigestItem) => items.push(item);
  const known = (cats: DigestCategory[], then: unknown, nowResource: string) => {
    const reason: UnknownReason | undefined =
      then === undefined
        ? 'unavailable-then'
        : resourceUnavailable(s, nowResource)
          ? 'unavailable-now'
          : cp.truncated
            ? 'baseline-truncated'
            : undefined;
    for (const c of cats) {
      if (reason) {
        counts[c] = null;
        unknown[c] = reason;
      } else counts[c] ??= 0;
    }
    return !reason;
  };
  const bump = (c: DigestCategory) => {
    if (counts[c] !== null) counts[c] = (counts[c] ?? 0) + 1;
  };
  // Categories fed by several resources start at 0 and are nulled if any input is unknown.
  counts.statusBecameUnknown = 0;
  counts.noLongerReported = 0;
  const mark = (c: DigestCategory, reason: UnknownReason) => {
    counts[c] = null;
    unknown[c] ??= reason;
  };

  /* Missions */
  if (
    known(
      ['missionsNew', 'missionsStarted', 'missionsCompleted', 'missionsFailed'],
      cp.missions,
      'missions',
    )
  ) {
    const then = cp.missions!;
    const seen = new Set<string>();
    for (const m of s.missions) {
      seen.add(m.id);
      const prev = own(then, m.id);
      const it = { entity: 'mission' as const, id: m.id, label: m.title, href: href.mission(m.id) };
      if (prev === undefined) {
        bump('missionsNew');
        add({ ...it, category: 'missionsNew', to: m.status });
        continue;
      }
      if (prev === m.status) continue;
      if (m.status === 'UNKNOWN') {
        bump('statusBecameUnknown');
        add({ ...it, category: 'statusBecameUnknown', from: prev, to: m.status });
      } else if (m.status === 'COMPLETE') {
        bump('missionsCompleted');
        add({ ...it, category: 'missionsCompleted', from: prev, to: m.status });
      } else if (m.status === 'FAILED') {
        bump('missionsFailed');
        add({ ...it, category: 'missionsFailed', from: prev, to: m.status });
      } else if (NOT_STARTED.includes(prev) && m.status !== 'CANCELLED') {
        bump('missionsStarted');
        add({ ...it, category: 'missionsStarted', from: prev, to: m.status });
      }
    }
    for (const id of Object.keys(then)) {
      if (seen.has(id)) continue;
      bump('noLongerReported');
      add({
        category: 'noLongerReported',
        entity: 'mission',
        id,
        label: id,
        from: then[id],
        href: href.mission(id),
      });
    }
  } else {
    mark('statusBecameUnknown', unknown.missionsNew!);
    mark('noLongerReported', unknown.missionsNew!);
  }

  /* Workers */
  if (known(['workersChanged'], cp.workers, 'workers')) {
    const then = cp.workers!;
    const seen = new Set<string>();
    for (const w of s.workers) {
      seen.add(w.id);
      const prev = own(then, w.id);
      if (prev === undefined || prev === w.state) continue;
      const it = { entity: 'worker' as const, id: w.id, label: w.name, href: href.worker(w.id) };
      if (w.state === 'UNKNOWN') {
        bump('statusBecameUnknown');
        add({ ...it, category: 'statusBecameUnknown', from: prev, to: w.state });
      } else {
        bump('workersChanged');
        add({ ...it, category: 'workersChanged', from: prev, to: w.state });
      }
    }
    for (const id of Object.keys(then)) {
      if (seen.has(id)) continue;
      bump('noLongerReported');
      add({
        category: 'noLongerReported',
        entity: 'worker',
        id,
        label: id,
        from: then[id],
        href: href.worker(id),
      });
    }
  } else {
    mark('statusBecameUnknown', unknown.workersChanged!);
    mark('noLongerReported', unknown.workersChanged!);
  }

  /* Approvals: observed state changes only. A resolved approval is a CURRENT
     fact from the data source, not a decision made here. */
  if (known(['approvalsNew', 'approvalsResolved'], cp.approvals, 'approvals')) {
    const then = cp.approvals!;
    const seen = new Set<string>();
    for (const a of s.approvals) {
      seen.add(a.id);
      const prev = own(then, a.id);
      const it = {
        entity: 'approval' as const,
        id: a.id,
        label: a.title,
        href: withQuery(href.approvals(), { focus: a.id }),
      };
      if (prev === undefined) {
        bump('approvalsNew');
        add({ ...it, category: 'approvalsNew', to: a.status });
      } else if (prev !== a.status && a.status === 'UNKNOWN') {
        bump('statusBecameUnknown');
        add({ ...it, category: 'statusBecameUnknown', from: prev, to: a.status });
      } else if (OPEN.includes(prev) && RESOLVED.includes(a.status)) {
        bump('approvalsResolved');
        add({ ...it, category: 'approvalsResolved', from: prev, to: a.status });
      }
    }
    for (const id of Object.keys(then)) {
      if (seen.has(id)) continue;
      bump('noLongerReported');
      add({
        category: 'noLongerReported',
        entity: 'approval',
        id,
        label: id,
        from: then[id],
        href: withQuery(href.approvals(), { focus: id }),
      });
    }
  } else {
    mark('statusBecameUnknown', unknown.approvalsNew!);
    mark('noLongerReported', unknown.approvalsNew!);
  }

  /* Alerts */
  if (known(['alertsOpened', 'alertsResolved'], cp.alerts, 'alerts')) {
    const then = cp.alerts!;
    const seen = new Set<string>();
    for (const al of s.alerts) {
      seen.add(al.id);
      const prev = own(then, al.id);
      const phase = alertPhase(al);
      const it = {
        entity: 'alert' as const,
        id: al.id,
        label: al.title,
        href: withQuery(href.alerts(), { focus: al.id }),
      };
      if (prev === undefined && phase !== 'resolved') {
        bump('alertsOpened');
        add({ ...it, category: 'alertsOpened', to: al.severity });
      } else if (prev !== undefined && prev !== 'resolved' && phase === 'resolved') {
        bump('alertsResolved');
        add({ ...it, category: 'alertsResolved', from: prev, to: phase });
      }
    }
    for (const id of Object.keys(then)) {
      if (seen.has(id)) continue;
      bump('noLongerReported');
      add({
        category: 'noLongerReported',
        entity: 'alert',
        id,
        label: id,
        from: then[id],
        href: withQuery(href.alerts(), { focus: id }),
      });
    }
  } else {
    mark('noLongerReported', unknown.alertsOpened!);
  }

  /* Artifacts */
  if (known(['artifactsNew'], cp.artifacts, 'missions')) {
    const then = new Set(cp.artifacts);
    for (const m of s.missions)
      for (const a of m.artifacts) {
        if (then.has(a.id)) continue;
        bump('artifactsNew');
        add({
          category: 'artifactsNew',
          entity: 'artifact',
          id: a.id,
          label: a.title,
          to: a.kind,
          href: withQuery(href.mission(m.id), { focus: a.id }),
        });
      }
  }

  /* Events not observed at the checkpoint (identity), with coverage proven only
     from source times (see eventCoverage.ts). Never compares the source clock
     with the browser clock. */
  const cov = eventCoverage(s.events, cp.events, !resourceUnavailable(s, 'events'));
  const eventsObserved = cov.observedNew;
  if (cov.state === 'exact') counts.events = cov.count;
  else
    mark(
      'events',
      cov.reason === 'events-unavailable-now'
        ? 'unavailable-now'
        : cov.reason === 'events-unavailable-then'
          ? 'unavailable-then'
          : 'history-truncated',
    );

  // Newest-meaningful first: Founder-relevant categories lead.
  const ORDER: DigestCategory[] = [
    'approvalsNew',
    'approvalsResolved',
    'alertsOpened',
    'missionsFailed',
    'statusBecameUnknown',
    'missionsCompleted',
    'missionsStarted',
    'missionsNew',
    'alertsResolved',
    'workersChanged',
    'artifactsNew',
    'noLongerReported',
  ];
  items.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  return {
    baseline: 'ok',
    since: cp.at,
    sourceThen: cp.mode,
    sourceNow,
    counts,
    unknown,
    eventsObserved,
    eventCoverage: cov.state,
    items: items.slice(0, MAX_DIGEST_ITEMS),
    moreItems: Math.max(0, items.length - MAX_DIGEST_ITEMS),
  };
}
