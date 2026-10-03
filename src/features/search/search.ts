import { href, withQuery } from '@/app/router';
import type { FloorConfig } from '@/config/types';
import { describeEvent } from '@/domain/describe';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { layoutFloor } from '@/features/forge-floor/layout';
import { en, type Messages } from '@/i18n/en';
import { missionLabel, resolveNumbering, type MissionNumbering } from '@/domain/missionNumber';

export type SearchType =
  'mission' | 'worker' | 'room' | 'alert' | 'approval' | 'artifact' | 'event';

/** English type labels (kept for callers without a locale). */
export const SEARCH_TYPE_LABEL: Record<SearchType, string> = en.search.type;

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
 *
 * Display text is in the active language; English status labels are also
 * indexed so either language finds the same records. A result is navigation
 * only: it carries no authority and cannot decide anything.
 */
export function buildSearchIndex(
  s: DashboardSnapshot,
  floor: FloorConfig,
  m: Messages = en,
  numbering?: Partial<MissionNumbering>,
): Entry[] {
  const resolved = resolveNumbering(numbering);
  const entries: Entry[] = [];
  const t = m.search;
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
        status: m.status.approval[a.status],
        surface: t.surface.approvals,
        context: [
          a.missionId,
          t.requestedBy(workerName(a.requestedBy) ?? a.requestedBy),
          t.risk(m.status.risk[a.risk]),
        ]
          .filter(Boolean)
          .join(' · '),
        href: withQuery(href.approvals(), { focus: a.id }),
        weight: 0,
      },
      `${a.action} ${en.status.approval[a.status]}`,
    );
  }
  for (const al of s.alerts) {
    push(
      {
        type: 'alert',
        id: al.id,
        title: al.title,
        status: `${m.status.severity[al.severity]}${al.resolvedAt ? t.resolved : al.acknowledgedAt ? t.acknowledged : ''}`,
        surface: t.surface.alerts,
        context: al.affected.map((x) => x.label).join(', ') || undefined,
        href: withQuery(href.alerts(), { focus: al.id }),
        weight: 1,
      },
      `${al.whatHappened} ${al.attention} ${en.status.severity[al.severity]}`,
    );
  }
  for (const mission of s.missions) {
    push(
      {
        type: 'mission',
        id: mission.id,
        title: mission.title,
        status: m.status.mission[mission.status],
        surface: t.surface.missionControl,
        context: mission.assignedWorkerIds.map(workerName).join(', ') || t.unassigned,
        href: href.mission(mission.id),
        weight: 2,
      },
      `${missionLabel(mission, resolved)} ${mission.objective} ${mission.priority} ${en.status.mission[mission.status]}`,
    );
    for (const art of mission.artifacts) {
      push({
        type: 'artifact',
        id: art.id,
        title: art.title,
        status: m.status.artifact[art.kind],
        surface: t.surface.mission(mission.id),
        context: [
          mission.title,
          art.producedBy ? m.common.by(workerName(art.producedBy) ?? art.producedBy) : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        href: withQuery(href.mission(mission.id), { focus: art.id }),
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
        status: m.status.worker[w.state],
        surface: t.surface.workerFocus,
        context: [w.role, w.currentMissionId, room ? t.inRoom(room.label) : undefined]
          .filter(Boolean)
          .join(' · '),
        href: href.worker(w.id),
        weight: 3,
      },
      `${w.currentActivity ?? ''} ${w.crewId} ${en.status.worker[w.state]}`,
    );
  }
  for (const r of floor.rooms) {
    const count = [...placements.values()].filter((p) => p.roomId === r.id).length;
    push(
      {
        type: 'room',
        id: r.id,
        title: r.label,
        status: t.workers(count),
        surface: t.surface.floor,
        context: r.description,
        href: withQuery(href.floor(), { room: r.id }),
        weight: 4,
      },
      r.kind,
    );
  }
  for (const e of s.events.slice(-MAX_EVENTS_INDEXED)) {
    const d = describeEvent(e, s, m);
    push({
      type: 'event',
      id: e.id,
      title: d.title,
      status: e.kind,
      surface: t.surface.activity,
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
