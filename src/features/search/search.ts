import { href, withQuery } from '@/app/router';
import type { FloorConfig } from '@/config/types';
import { describeEvent } from '@/domain/describe';
import type { DashboardSnapshot } from '@/domain/snapshot';
import {
  ALERT_SEVERITY_META,
  APPROVAL_STATUS_META,
  MISSION_STATUS_META,
  WORKER_STATE_META,
} from '@/domain/status';
import { layoutFloor } from '@/features/forge-floor/layout';

export type SearchType =
  'mission' | 'worker' | 'room' | 'alert' | 'approval' | 'artifact' | 'event';

export const SEARCH_TYPE_LABEL: Record<SearchType, string> = {
  mission: 'Mission',
  worker: 'Worker',
  room: 'Room',
  alert: 'Alert',
  approval: 'Approval gate',
  artifact: 'Artifact',
  event: 'Event',
};

export interface SearchResult {
  type: SearchType;
  id: string;
  title: string;
  status: string;
  /** Where selecting the result takes you. */
  surface: string;
  context?: string;
  href: string;
}

interface Entry extends SearchResult {
  hay: string;
  /** Lower ranks first when scores tie (founder-relevant types first). */
  weight: number;
}

const MAX_EVENTS_INDEXED = 200;

/**
 * Builds a flat, typed index over everything searchable. Only relationships that
 * exist in the data model are shown as context; nothing is inferred.
 */
export function buildSearchIndex(s: DashboardSnapshot, floor: FloorConfig): Entry[] {
  const entries: Entry[] = [];
  const workerName = (id?: string) =>
    id ? (s.workers.find((w) => w.id === id)?.name ?? id) : undefined;
  const push = (e: Omit<Entry, 'hay'>, extra = '') =>
    entries.push({
      ...e,
      hay: `${e.id} ${e.title} ${e.status} ${e.context ?? ''} ${extra}`.toLowerCase(),
    });

  for (const a of s.approvals) {
    push(
      {
        type: 'approval',
        id: a.id,
        title: a.title,
        status: APPROVAL_STATUS_META[a.status].label,
        surface: 'Approval Gates',
        context: [a.missionId, `requested by ${workerName(a.requestedBy)}`, `${a.risk} risk`]
          .filter(Boolean)
          .join(' · '),
        href: withQuery(href.approvals(), { focus: a.id }),
        weight: 0,
      },
      a.action,
    );
  }
  for (const al of s.alerts) {
    push(
      {
        type: 'alert',
        id: al.id,
        title: al.title,
        status: `${ALERT_SEVERITY_META[al.severity].label}${al.resolvedAt ? ' · resolved' : al.acknowledgedAt ? ' · acknowledged' : ''}`,
        surface: 'Alerts',
        context: al.affected.map((x) => x.label).join(', ') || undefined,
        href: withQuery(href.alerts(), { focus: al.id }),
        weight: 1,
      },
      `${al.whatHappened} ${al.attention}`,
    );
  }
  for (const m of s.missions) {
    push(
      {
        type: 'mission',
        id: m.id,
        title: m.title,
        status: MISSION_STATUS_META[m.status].label,
        surface: 'Mission Control',
        context: m.assignedWorkerIds.map(workerName).join(', ') || 'unassigned',
        href: href.mission(m.id),
        weight: 2,
      },
      `${m.objective} ${m.priority}`,
    );
    for (const art of m.artifacts) {
      push({
        type: 'artifact',
        id: art.id,
        title: art.title,
        status: art.kind,
        surface: `Mission ${m.id}`,
        context: [m.title, art.producedBy ? `by ${workerName(art.producedBy)}` : undefined]
          .filter(Boolean)
          .join(' · '),
        href: withQuery(href.mission(m.id), { focus: art.id }),
        weight: 5,
      });
    }
  }
  const placements = layoutFloor(s.workers, floor);
  for (const w of s.workers) {
    const room = floor.rooms.find((r) => r.id === placements.get(w.id)?.roomId);
    push(
      {
        type: 'worker',
        id: w.id,
        title: w.name,
        status: WORKER_STATE_META[w.state].label,
        surface: 'Worker focus',
        context: [w.role, w.currentMissionId, room ? `in ${room.label}` : undefined]
          .filter(Boolean)
          .join(' · '),
        href: href.worker(w.id),
        weight: 3,
      },
      `${w.currentActivity ?? ''} ${w.crewId}`,
    );
  }
  for (const r of floor.rooms) {
    const count = [...placements.values()].filter((p) => p.roomId === r.id).length;
    push(
      {
        type: 'room',
        id: r.id,
        title: r.label,
        status: `${count} worker${count === 1 ? '' : 's'}`,
        surface: 'Forge Floor',
        context: r.description,
        href: withQuery(href.floor(), { room: r.id }),
        weight: 4,
      },
      r.kind,
    );
  }
  for (const e of s.events.slice(-MAX_EVENTS_INDEXED)) {
    const d = describeEvent(e, s);
    push({
      type: 'event',
      id: e.id,
      title: d.title,
      status: e.kind,
      surface: 'Activity',
      context: [e.at.slice(11, 19), e.missionId, d.detail].filter(Boolean).join(' · '),
      href: withQuery(href.activity(), { focus: e.id }),
      weight: 6,
    });
  }
  return entries;
}

/** All terms must match. Exact id > title prefix > title substring > context. */
export function searchIndex(index: readonly Entry[], query: string, limit = 40): SearchResult[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const q = query.trim().toLowerCase();
  return index
    .filter((e) => terms.every((t) => e.hay.includes(t)))
    .map((e) => {
      const id = e.id.toLowerCase();
      const title = e.title.toLowerCase();
      const score =
        id === q
          ? 0
          : title.startsWith(q) || id.startsWith(q)
            ? 1
            : title.includes(terms[0]!)
              ? 2
              : 3;
      return { e, score };
    })
    .sort((a, b) => a.score - b.score || a.e.weight - b.e.weight)
    .slice(0, limit)
    .map(({ e }) => ({
      type: e.type,
      id: e.id,
      title: e.title,
      status: e.status,
      surface: e.surface,
      context: e.context,
      href: e.href,
    }));
}
