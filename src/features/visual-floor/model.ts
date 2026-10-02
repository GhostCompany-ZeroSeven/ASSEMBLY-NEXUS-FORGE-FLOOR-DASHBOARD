import { selectAttentionQueue, type AttentionItem } from '@/domain/attention';
import { displayMode } from '@/domain/provenance';
import { redAlertActive, resourceUnavailable } from '@/domain/selectors';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type { Mission, MissionStatus, WorkerState } from '@/domain/types';
import type { Freshness } from '@/domain/freshness';

/**
 * Presentation model for the VISUAL Forge Floor preview.
 *
 * This is a bounded, read-only mapping from EXISTING dashboard abstractions
 * (the normalized snapshot) to what the scene shows. It invents no Assembly
 * Nexus state: anything the data model does not carry is UNKNOWN, and preview
 * presets are labelled as presets, never as data.
 *
 * VISUAL PREVIEW != OPERATIONAL TRUTH. The factual dashboard stays authoritative.
 */

/** Where the visual state comes from. */
export type VisualSource =
  | 'data' // mapped from the current snapshot (demo, mock or backend data, as labelled)
  | 'preset'; // an explicit preview preset: NOT from data

export type PreviewPreset = 'countdown' | 'countdown-critical' | 'accomplished' | 'red-alert';
export const PREVIEW_PRESETS: readonly PreviewPreset[] = [
  'countdown',
  'countdown-critical',
  'accomplished',
  'red-alert',
];

export type VisualMode = 'countdown' | 'accomplished' | 'red-alert';

export const STAGES = ['plan', 'build', 'test', 'review', 'certify', 'founder'] as const;
export type StageKey = (typeof STAGES)[number];
export type StageStatus = 'done' | 'active' | 'pending' | 'blocked' | 'unknown' | 'not-required';

export interface MissionBoardState {
  /** Mission id when bound to data; undefined for a preset. */
  missionId?: string;
  title?: string;
  /** Raw mission status when bound to data. */
  status?: MissionStatus;
  stages: { key: StageKey; status: StageStatus }[];
  timer:
    | { kind: 'time-left'; ms: number; critical: boolean }
    | { kind: 'overdue'; ms: number }
    | { kind: 'done' }
    | { kind: 'unknown' };
}

/** Rows of the system status board. Display states only; never a connection claim. */
export const SYSTEM_ROWS = ['ann', 'floor', 'memory', 'associates', 'deployment'] as const;
export type SystemRow = (typeof SYSTEM_ROWS)[number];
export type SystemState = 'ONLINE' | 'STANDBY' | 'UNKNOWN' | 'BLOCKED';
export type SystemBasis =
  | 'not-connected' // no Assembly Nexus connection exists in this build
  | 'dashboard' // the dashboard itself is running
  | 'not-reported' // the data model carries no such signal
  | 'data' // derived from the snapshot
  | 'not-authorized'; // deployment is not authorized

export interface SystemStatus {
  row: SystemRow;
  state: SystemState;
  basis: SystemBasis;
}

export interface AlertBoardState {
  /** Counts from mission statuses; null when missions are unavailable (UNKNOWN, not 0). */
  requiresReview: number | null;
  blocked: number | null;
  inProgress: number | null;
  queued: number | null;
}

/** Character classes of the scene. */
export type StationKind = 'scientist' | 'bandit' | 'wisp';

export interface StationBinding {
  stationId: string;
  kind: StationKind;
}

/** Associates named on the preview roster. Presence is never asserted: UNKNOWN. */
export const ROSTER = ['Charles', 'Cipher', 'Winter', 'ADA'] as const;

export interface VisualState {
  source: VisualSource;
  preset?: PreviewPreset;
  /** Display provenance: demo / mock / backend / disconnected. */
  provenance: 'DEMO' | 'MOCK' | 'BACKEND' | 'DISCONNECTED' | 'REPLAY';
  mode: VisualMode;
  board: MissionBoardState;
  systems: SystemStatus[];
  alerts: AlertBoardState;
  /** Founder-attention items (explicit facts only), for the red-alert board. */
  attention: Pick<AttentionItem, 'key' | 'id' | 'source' | 'label' | 'state' | 'href'>[];
  attentionIncomplete: boolean;
  stations: StationBinding[];
  crew: { forge: number | null; snowWolf: number | null };
}

/** Countdown at or below this is critical (red). */
export const CRITICAL_MS = 15 * 60_000;

const PRESET_COUNTDOWN_MS = (2 * 3600 + 43 * 60 + 17) * 1000;
const PRESET_CRITICAL_MS = (7 * 60 + 42) * 1000;

/* ------------------------------------------------------------------------ */

/** Stage statuses from mission facts only. Unknown facts stay unknown. */
export function missionStages(m: Mission, s: DashboardSnapshot): MissionBoardState['stages'] {
  const st = m.status;
  const terminal = st === 'COMPLETE' || st === 'FAILED' || st === 'CANCELLED';
  const after = (statuses: MissionStatus[]) => statuses.includes(st);
  const plan: StageStatus = st === 'UNKNOWN' ? 'unknown' : st === 'QUEUED' ? 'active' : 'done';
  const build: StageStatus =
    st === 'UNKNOWN'
      ? 'unknown'
      : st === 'QUEUED'
        ? 'pending'
        : st === 'ACTIVE'
          ? 'active'
          : st === 'BLOCKED' || st === 'FAILED'
            ? 'blocked'
            : after(['WAITING_REVIEW', 'WAITING_APPROVAL', 'COMPLETE'])
              ? 'done'
              : 'unknown';
  // The data model has no test signal: TEST is never guessed.
  const test: StageStatus = 'unknown';
  const r = m.review.status;
  const review: StageStatus =
    r === 'PASSED'
      ? 'done'
      : r === 'FAILED'
        ? 'blocked'
        : r === 'REQUESTED' || r === 'IN_REVIEW'
          ? 'active'
          : r === 'NOT_REQUESTED'
            ? terminal
              ? 'not-required'
              : 'pending'
            : 'unknown';
  const c = m.certification;
  const certify: StageStatus =
    c === 'CERTIFIED'
      ? 'done'
      : c === 'REJECTED'
        ? 'blocked'
        : c === 'IN_PROGRESS'
          ? 'active'
          : c === 'PENDING'
            ? 'pending'
            : c === 'NOT_REQUIRED'
              ? 'not-required'
              : 'unknown';
  let founder: StageStatus = 'not-required';
  if (m.approvalIds.length) {
    if (resourceUnavailable(s, 'approvals')) founder = 'unknown';
    else {
      const gates = s.approvals.filter((a) => m.approvalIds.includes(a.id));
      if (gates.length < m.approvalIds.length) founder = 'unknown';
      else if (gates.some((a) => a.status === 'DENIED')) founder = 'blocked';
      else if (gates.some((a) => a.status === 'PENDING' || a.status === 'HELD')) founder = 'active';
      else if (gates.every((a) => a.status === 'APPROVED')) founder = 'done';
      else founder = 'unknown';
    }
  }
  return [
    { key: 'plan', status: plan },
    { key: 'build', status: build },
    { key: 'test', status: test },
    { key: 'review', status: review },
    { key: 'certify', status: certify },
    { key: 'founder', status: founder },
  ];
}

/** Time left from the mission's own start and estimate; UNKNOWN otherwise. */
export function missionTimer(m: Mission, nowMs: number): MissionBoardState['timer'] {
  if (m.status === 'COMPLETE') return { kind: 'done' };
  const start = m.startedAt ? Date.parse(m.startedAt) : NaN;
  const dur = m.estimate?.durationMs;
  if (m.status !== 'ACTIVE' || Number.isNaN(start) || typeof dur !== 'number')
    return { kind: 'unknown' };
  const left = start + dur - nowMs;
  return left < 0
    ? { kind: 'overdue', ms: -left }
    : { kind: 'time-left', ms: left, critical: left <= CRITICAL_MS };
}

/** The mission the board features: explicit id, else a timed active one, else the most advanced. */
export function featuredMission(s: DashboardSnapshot, id?: string): Mission | undefined {
  if (id) {
    const m = s.missions.find((x) => x.id === id);
    if (m) return m;
  }
  const timed = s.missions.find((m) => m.status === 'ACTIVE' && m.estimate && m.startedAt);
  if (timed) return timed;
  for (const st of ['WAITING_REVIEW', 'WAITING_APPROVAL', 'ACTIVE', 'BLOCKED', 'QUEUED'] as const) {
    const m = s.missions.find((x) => x.status === st);
    if (m) return m;
  }
  return s.missions[0];
}

function provenanceOf(
  s: DashboardSnapshot,
  connection: Parameters<typeof displayMode>[1],
): VisualState['provenance'] {
  const mode = displayMode(s.provenance, connection);
  if (mode === 'demo') return 'DEMO';
  if (mode === 'replay') return 'REPLAY';
  if (mode === 'disconnected') return 'DISCONNECTED';
  const env = s.provenance.environment?.toLowerCase();
  return env && /mock|e2e|test/.test(env) ? 'MOCK' : 'BACKEND';
}

function systems(s: DashboardSnapshot, state: Freshness): SystemStatus[] {
  const workersDown = resourceUnavailable(s, 'workers');
  const busy: WorkerState[] = ['WORKING', 'PLANNING', 'REVIEWING', 'CERTIFYING', 'WAITING'];
  const associates: SystemStatus = workersDown
    ? { row: 'associates', state: 'UNKNOWN', basis: 'data' }
    : {
        row: 'associates',
        state: s.workers.some((w) => busy.includes(w.state)) ? 'ONLINE' : 'STANDBY',
        basis: 'data',
      };
  return [
    // This build has no Assembly Nexus connection, whatever the data source is.
    { row: 'ann', state: 'UNKNOWN', basis: 'not-connected' },
    {
      row: 'floor',
      state: state.source === 'DISCONNECTED' ? 'UNKNOWN' : 'ONLINE',
      basis: 'dashboard',
    },
    { row: 'memory', state: 'UNKNOWN', basis: 'not-reported' },
    associates,
    { row: 'deployment', state: 'BLOCKED', basis: 'not-authorized' },
  ];
}

function alerts(s: DashboardSnapshot): AlertBoardState {
  if (resourceUnavailable(s, 'missions'))
    return { requiresReview: null, blocked: null, inProgress: null, queued: null };
  const n = (f: (m: Mission) => boolean) => s.missions.filter(f).length;
  return {
    requiresReview: n((m) => m.status === 'WAITING_REVIEW'),
    blocked: n((m) => m.status === 'BLOCKED'),
    inProgress: n((m) => m.status === 'ACTIVE'),
    queued: n((m) => m.status === 'QUEUED'),
  };
}

/** Crown-Top scientist stations (eight; role/station labelled). */
export const SCIENTIST_STATIONS = [
  'sci-1',
  'sci-2',
  'sci-3',
  'sci-4',
  'sci-5',
  'sci-6',
  'sci-7',
  'sci-8',
] as const;
/** Snow Wolf Crew role personas (Coder, Hauler, Lookout, Snack Guard). */
export const CREW_ROLE_STATIONS = ['ban-1', 'ban-2', 'ban-3', 'ban-4'] as const;
/** Named Snow Wolf Crew personas (Boxer, DJ, Wild Paw, Chuy). */
export const CREW_NAMED_STATIONS = ['ban-5', 'ban-6', 'ban-7', 'ban-8'] as const;
/** Small blue 07 Ghost Sprites: decorative and distinct from Baby Ghost. */
export const WISP_STATIONS = ['wisp-1', 'wisp-2'] as const;

/**
 * The scene's stations. Phase 11 (Founder decision): visual characters are
 * kept SEPARATE from factual worker records. No station is bound to a worker,
 * so a demo worker name is never shown as a physical character; workers stay
 * in the factual views (where e.g. a worker without a station, such as
 * Juniper, is fully shown). Characters carry no identity or authority.
 */
export function bindStations(): StationBinding[] {
  return [
    ...SCIENTIST_STATIONS.map((id) => ({ stationId: id, kind: 'scientist' as const })),
    ...CREW_ROLE_STATIONS.map((id) => ({ stationId: id, kind: 'bandit' as const })),
    ...CREW_NAMED_STATIONS.map((id) => ({ stationId: id, kind: 'bandit' as const })),
    ...WISP_STATIONS.map((id) => ({ stationId: id, kind: 'wisp' as const })),
  ];
}

function presetBoard(preset: PreviewPreset): MissionBoardState {
  const st = (statuses: StageStatus[]) => STAGES.map((key, i) => ({ key, status: statuses[i]! }));
  switch (preset) {
    case 'countdown':
      return {
        stages: st(['done', 'done', 'done', 'active', 'pending', 'pending']),
        timer: { kind: 'time-left', ms: PRESET_COUNTDOWN_MS, critical: false },
      };
    case 'countdown-critical':
      return {
        stages: st(['done', 'done', 'done', 'done', 'active', 'pending']),
        timer: { kind: 'time-left', ms: PRESET_CRITICAL_MS, critical: true },
      };
    case 'accomplished':
      return {
        stages: st(['done', 'done', 'done', 'done', 'done', 'done']),
        timer: { kind: 'done' },
      };
    case 'red-alert':
      return {
        stages: st(['done', 'done', 'done', 'blocked', 'pending', 'active']),
        timer: { kind: 'time-left', ms: PRESET_CRITICAL_MS, critical: true },
      };
  }
}

/**
 * The scene's state. `preset` overrides only the mission board and mode, and
 * is always reported as a preset. Everything else (systems, alerts, crew,
 * stations, attention) is mapped from the snapshot.
 */
export function buildVisualState(
  s: DashboardSnapshot,
  freshness: Freshness,
  connection: Parameters<typeof displayMode>[1],
  nowMs: number,
  options: { preset?: PreviewPreset; missionId?: string; presetElapsedMs?: number } = {},
): VisualState {
  const queue = selectAttentionQueue(s, 'Founder #0007', freshness);
  const attention = queue.items.slice(0, 6).map((i) => ({
    key: i.key,
    id: i.id,
    source: i.source,
    label: i.label,
    state: i.state,
    href: i.href,
  }));
  const workersDown = resourceUnavailable(s, 'workers');
  const base = {
    provenance: provenanceOf(s, connection),
    systems: systems(s, freshness),
    alerts: alerts(s),
    attention,
    attentionIncomplete: !queue.complete,
    stations: bindStations(),
    crew: workersDown
      ? { forge: null, snowWolf: null }
      : {
          forge: s.workers.filter((w) => w.crewId !== 'snow-wolf').length,
          snowWolf: s.workers.filter((w) => w.crewId === 'snow-wolf').length,
        },
  };

  if (options.preset) {
    const board = presetBoard(options.preset);
    if (board.timer.kind === 'time-left') {
      const ms = Math.max(0, board.timer.ms - (options.presetElapsedMs ?? 0));
      board.timer = { kind: 'time-left', ms, critical: ms <= CRITICAL_MS };
    }
    return {
      ...base,
      source: 'preset',
      preset: options.preset,
      mode:
        options.preset === 'accomplished'
          ? 'accomplished'
          : options.preset === 'red-alert'
            ? 'red-alert'
            : 'countdown',
      board,
    };
  }

  const m = resourceUnavailable(s, 'missions') ? undefined : featuredMission(s, options.missionId);
  const board: MissionBoardState = m
    ? {
        missionId: m.id,
        title: m.title,
        status: m.status,
        stages: missionStages(m, s),
        timer: missionTimer(m, nowMs),
      }
    : {
        stages: STAGES.map((key) => ({ key, status: 'unknown' as const })),
        timer: { kind: 'unknown' },
      };
  return {
    ...base,
    source: 'data',
    mode: redAlertActive(s) ? 'red-alert' : m?.status === 'COMPLETE' ? 'accomplished' : 'countdown',
    board,
  };
}

/** HH:MM:SS (hours may exceed 24). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const mnt = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return [h, mnt, sec].map((n) => String(n).padStart(2, '0')).join(':');
}
