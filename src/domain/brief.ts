import type { AttentionQueue } from './attention';
import type { Digest, DigestCategory } from './digest';
import type { Freshness } from './freshness';
import { resourceUnavailable } from './selectors';
import type { DashboardSnapshot } from './snapshot';

/**
 * Founder morning / return brief: the few numbers that matter, each either a
 * number the data supports or `null` (UNKNOWN). Missing information never
 * becomes zero: "Blocked: UNKNOWN", not "Blocked: 0".
 */
export type BriefCategory =
  'running' | 'completed' | 'blocked' | 'failed' | 'needsFounder' | 'newSinceLastView';

export interface BriefFigure {
  value: number | null;
  /** Resources whose absence made the value UNKNOWN. */
  missing: string[];
}

export type DataProblem =
  | { kind: 'unavailable'; resource: string }
  | { kind: 'disconnected' }
  | { kind: 'stale' }
  | { kind: 'partial' }
  | { kind: 'last-known' }
  | { kind: 'stream-fallback' }
  | { kind: 'issues'; count: number };

export interface Brief {
  figures: Record<BriefCategory, BriefFigure>;
  /** Missions that completed since the last view (null when not comparable). */
  completedSinceLastView: number | null;
  problems: DataProblem[];
}

const RECORD_CATEGORIES: DigestCategory[] = [
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
];

const RUNNING = new Set(['ACTIVE', 'WAITING_REVIEW']);

export function selectBrief(
  s: DashboardSnapshot,
  freshness: Freshness,
  digest: Digest,
  queue: AttentionQueue,
): Brief {
  const down = (rs: string[]) => rs.filter((r) => resourceUnavailable(s, r));
  const figure = (rs: string[], compute: () => number): BriefFigure => {
    const missing = down(rs);
    return { value: missing.length ? null : compute(), missing };
  };

  const recordCounts = RECORD_CATEGORIES.map((c) => digest.counts[c]);
  const newSince = recordCounts.some((c) => c === null)
    ? null
    : recordCounts.reduce<number>((a, c) => a + (c ?? 0), 0);

  const problems: DataProblem[] = [];
  for (const r of ['missions', 'workers', 'approvals', 'alerts', 'events'])
    if (resourceUnavailable(s, r)) problems.push({ kind: 'unavailable', resource: r });
  if (freshness.source === 'DISCONNECTED') problems.push({ kind: 'disconnected' });
  if (freshness.qualifiers.includes('STALE')) problems.push({ kind: 'stale' });
  if (freshness.qualifiers.includes('PARTIAL')) problems.push({ kind: 'partial' });
  if (freshness.qualifiers.includes('LAST_KNOWN')) problems.push({ kind: 'last-known' });
  if (s.provenance.transport === 'polling-fallback') problems.push({ kind: 'stream-fallback' });
  const issues = s.quality.issues.length;
  if (issues > 0) problems.push({ kind: 'issues', count: issues });

  return {
    figures: {
      running: figure(['missions'], () => s.missions.filter((m) => RUNNING.has(m.status)).length),
      completed: figure(
        ['missions'],
        () => s.missions.filter((m) => m.status === 'COMPLETE').length,
      ),
      blocked: figure(
        ['missions', 'workers'],
        () =>
          s.missions.filter((m) => m.status === 'BLOCKED').length +
          s.workers.filter((w) => w.state === 'BLOCKED').length,
      ),
      failed: figure(
        ['missions', 'workers'],
        () =>
          s.missions.filter((m) => m.status === 'FAILED').length +
          s.workers.filter((w) => w.state === 'FAILED').length,
      ),
      needsFounder: {
        value: queue.count,
        missing: down(['approvals', 'alerts']),
      },
      newSinceLastView: {
        value: newSince,
        missing: [],
      },
    },
    completedSinceLastView: digest.counts.missionsCompleted,
    problems,
  };
}
