/** Time helpers. All inputs are epoch ms or ISO strings; no locale surprises. */

export function toMs(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Formats a duration as HH:MM:SS (hours may exceed 24). Negative → 00:00:00.
 * A non-finite input is not a duration: it renders as dashes, never "NaN".
 */
export function formatClock(durationMs: number): string {
  if (!Number.isFinite(durationMs)) return '--:--:--';
  const total = Math.max(0, Math.floor(durationMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Compact human duration: `45s`, `12m`, `3h 04m`, `2d 5h`. */
export function formatDuration(durationMs: number): string {
  const total = Math.max(0, Math.floor(durationMs / 1000));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${String(mins % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function formatRelative(iso: string, nowMs: number): string {
  const ms = toMs(iso);
  if (ms === null) return 'unknown';
  const delta = nowMs - ms;
  if (delta < 5_000 && delta > -5_000) return 'just now';
  return delta >= 0 ? `${formatDuration(delta)} ago` : `in ${formatDuration(-delta)}`;
}

export interface MissionTiming {
  /** Elapsed ms since start (frozen at completion), or null when not knowable. */
  elapsedMs: number | null;
  /** Remaining ms from the backend estimate, or null when no estimate exists. */
  remainingMs: number | null;
  /** True when elapsed has exceeded the estimate. */
  overrun: boolean;
  /**
   * Why a started mission has no elapsed time: its timestamps contradict each
   * other (ends before it starts, starts in the future), or it is finished
   * but its end time was not reported. Never rendered as a fake 00:00:00.
   */
  anomaly?: 'inconsistent' | 'end-unreported';
}

/** Clock skew tolerated between the backend and this browser before a time is distrusted. */
export const CLOCK_SKEW_MS = 60_000;

export function missionTiming(
  m: { startedAt?: string; completedAt?: string; estimate?: { durationMs: number } },
  nowMs: number,
  opts: { finished?: boolean } = {},
): MissionTiming {
  const none = { elapsedMs: null, remainingMs: null, overrun: false } as const;
  const start = toMs(m.startedAt);
  if (start === null) return none;
  const reportedEnd = toMs(m.completedAt);
  // A finished mission's duration needs its end time; "now" would keep it ticking.
  if (reportedEnd === null && (opts.finished || m.completedAt))
    return { ...none, anomaly: 'end-unreported' };
  const end = reportedEnd ?? nowMs;
  if (end < start - CLOCK_SKEW_MS) return { ...none, anomaly: 'inconsistent' };
  const elapsedMs = Math.max(0, end - start);
  const estimateMs = m.estimate?.durationMs;
  const estimated = typeof estimateMs === 'number' && Number.isFinite(estimateMs) && estimateMs > 0;
  if (!estimated || reportedEnd !== null) return { elapsedMs, remainingMs: null, overrun: false };
  const remaining = estimateMs - elapsedMs;
  return { elapsedMs, remainingMs: Math.max(0, remaining), overrun: remaining < 0 };
}
