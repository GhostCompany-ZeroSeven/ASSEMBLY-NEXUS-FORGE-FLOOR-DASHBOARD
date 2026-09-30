import { toMs } from '@/domain/time';

/**
 * Locale-aware number and date formatting (Intl), for DISPLAY only.
 *
 * Never used for identifiers, enum values, authority names or backend
 * strings, which are always shown exactly as received (e.g. "Founder #0007",
 * "AN-0142"). Machine-readable values stay in attributes (`<time dateTime>`).
 * Clock times use a 24-hour cycle in every locale, so operators comparing
 * logs never mix up AM/PM.
 */
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function nf(tag: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${tag}|${JSON.stringify(opts)}`;
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(tag, opts);
    cache.set(key, f);
  }
  return f;
}

function df(tag: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${tag}|${JSON.stringify(opts)}`;
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(tag, opts);
    cache.set(key, f);
  }
  return f;
}

/** Integer/decimal count, e.g. 1,234 (en) / 1234 or 1.234 (es). Non-finite → the fallback. */
export function formatNumberIn(tag: string, n: number, fallback: string): string {
  return Number.isFinite(n) ? nf(tag, { maximumFractionDigits: 1 }).format(n) : fallback;
}

/** Percentage from a 0–100 value, e.g. 42% / 42 %. Non-finite → the fallback. */
export function formatPercentIn(tag: string, pct: number, fallback: string): string {
  return Number.isFinite(pct)
    ? nf(tag, { style: 'percent', maximumFractionDigits: 0 }).format(pct / 100)
    : fallback;
}

/** Absolute date and time, 24-hour, e.g. "30 Sept 2026, 14:05" / "30 sept 2026, 14:05". */
export function formatDateTimeIn(tag: string, iso: string | undefined, fallback: string): string {
  const ms = toMs(iso);
  if (ms === null) return fallback;
  return df(tag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms);
}

/** Clock time with seconds, 24-hour, in the viewer's time zone. */
export function formatTimeIn(tag: string, iso: string | undefined, fallback: string): string {
  const ms = toMs(iso);
  if (ms === null) return fallback;
  return df(tag, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(ms);
}
