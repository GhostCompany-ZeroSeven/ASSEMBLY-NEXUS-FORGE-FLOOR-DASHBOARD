/** Time helpers. All inputs are epoch ms or ISO strings; no locale surprises. */

export function toMs(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Formats a duration as HH:MM:SS (hours may exceed 24). Negative → 00:00:00. */
export function formatClock(durationMs: number): string {
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
  /** Elapsed ms since start (frozen at completion), or null if not started. */
  elapsedMs: number | null;
  /** Remaining ms from the backend estimate, or null when no estimate exists. */
  remainingMs: number | null;
  /** True when elapsed has exceeded the estimate. */
  overrun: boolean;
}

export function missionTiming(
  m: { startedAt?: string; completedAt?: string; estimate?: { durationMs: number } },
  nowMs: number,
): MissionTiming {
  const start = toMs(m.startedAt);
  if (start === null) return { elapsedMs: null, remainingMs: null, overrun: false };
  const end = toMs(m.completedAt) ?? nowMs;
  const elapsedMs = Math.max(0, end - start);
  if (!m.estimate || m.completedAt) return { elapsedMs, remainingMs: null, overrun: false };
  const remaining = m.estimate.durationMs - elapsedMs;
  return { elapsedMs, remainingMs: Math.max(0, remaining), overrun: remaining < 0 };
}
