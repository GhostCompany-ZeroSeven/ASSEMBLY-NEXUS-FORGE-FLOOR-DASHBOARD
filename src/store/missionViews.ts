import {
  MISSION_VIEW_VERSION,
  parseMissionCheckpoint,
  type MissionCheckpoint,
} from '@/domain/missionView';
import { readStoredJson, removeStored, writeStoredJson } from './storage';

/**
 * Browser storage for per-mission "last viewed" checkpoints. Local to this
 * browser, bounded, and never authority: marking a mission as seen changes
 * nothing in the backend and acknowledges nothing.
 */
export const MISSION_VIEWS_KEY = 'forge-floor:mission-views';
/** Most recently viewed missions kept; older ones are dropped. */
export const MAX_MISSION_VIEWS = 50;
export const MAX_MISSION_VIEWS_CHARS = 1_000_000;

export type MissionViewsStorage = 'none' | 'ok' | 'outdated' | 'rejected' | 'unavailable';

export interface LoadedMissionViews {
  views: Record<string, MissionCheckpoint>;
  storage: MissionViewsStorage;
  /** Mission ids whose stored entry was invalid and ignored. */
  rejected: Set<string>;
}

const nullMap = () => Object.create(null) as Record<string, MissionCheckpoint>;

export function loadMissionViews(nowMs: number): LoadedMissionViews {
  const r = readStoredJson(MISSION_VIEWS_KEY, MAX_MISSION_VIEWS_CHARS);
  const empty = { views: nullMap(), rejected: new Set<string>() };
  if (r.kind === 'none') return { ...empty, storage: 'none' };
  if (r.kind === 'unavailable') return { ...empty, storage: 'unavailable' };
  if (r.kind !== 'value') return { ...empty, storage: 'rejected' };
  const v = r.value;
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    return { ...empty, storage: 'rejected' };
  const o = v as Record<string, unknown>;
  if (o.v !== MISSION_VIEW_VERSION)
    return { ...empty, storage: typeof o.v === 'number' ? 'outdated' : 'rejected' };
  const missions = o.missions;
  if (typeof missions !== 'object' || missions === null || Array.isArray(missions))
    return { ...empty, storage: 'rejected' };
  const entries = Object.entries(missions as Record<string, unknown>);
  if (entries.length > MAX_MISSION_VIEWS) return { ...empty, storage: 'rejected' };
  const views = nullMap();
  const rejected = new Set<string>();
  for (const [id, raw] of entries) {
    if (id.length > 200) continue;
    const cp = parseMissionCheckpoint(raw, id, nowMs);
    if (cp) views[id] = cp;
    else rejected.add(id);
  }
  return { views, rejected, storage: 'ok' };
}

/** Keep the most recently viewed missions only (by view time). */
export function boundViews(
  views: Record<string, MissionCheckpoint>,
): Record<string, MissionCheckpoint> {
  const kept = Object.values(views)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_MISSION_VIEWS);
  const out = nullMap();
  for (const cp of kept) out[cp.missionId] = cp;
  return out;
}

export function saveMissionViews(views: Record<string, MissionCheckpoint>): boolean {
  return writeStoredJson(MISSION_VIEWS_KEY, { v: MISSION_VIEW_VERSION, missions: views });
}

export function clearMissionViews(): boolean {
  return removeStored(MISSION_VIEWS_KEY);
}
