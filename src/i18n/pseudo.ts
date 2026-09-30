import type { DashboardConfig } from '@/config/types';
import { en, type Messages } from './en';

/**
 * Pseudo-locale (DIAGNOSTIC ONLY; never offered to users, never persisted).
 *
 * Generated from the English catalog so it is always complete:
 * - every letter is replaced by an accented look-alike, so any plain-ASCII
 *   UI text left on screen is hard-coded (untranslated) English or data;
 * - text is padded by ~40% and wrapped in `[!! … !!]`, so truncation (a
 *   missing `!!]`) and overflow show up immediately.
 *
 * Interpolated arguments (ids, names, authority values, numbers) are inserted
 * UNCHANGED: "Founder #0007" and "AN-0142" stay exact. Only the catalog's own
 * words are transformed. Enabled with `?pseudo=1` in the page URL.
 *
 * All replacement glyphs are covered by the bundled fonts (glyphs.test.ts).
 */
export const PSEUDO_OPEN = '[!! ';
export const PSEUDO_CLOSE = ' !!]';
const PAD = '·';

const LOWER = 'åƀçđéƒĝĥîĵķļɱñöƥʠŕšţüʋŵẋýž';
const UPPER = 'ÅƁÇĐÉƑĜĤÎĴĶĻṀÑÖƤǪŔŠŢÜṼŴẌÝŽ';
const MAP = new Map<string, string>();
for (let i = 0; i < 26; i++) {
  MAP.set(String.fromCharCode(97 + i), [...LOWER][i]!);
  MAP.set(String.fromCharCode(65 + i), [...UPPER][i]!);
}

// Placeholders for interpolated arguments: control characters never appear in
// catalog text and are left alone by the letter mapping.
// eslint-disable-next-line no-control-regex -- deliberate: placeholders are control characters
const TOKEN = /\u0001(\d+)\u0002/g;
const token = (i: number) => `\u0001${i}\u0002`;

function accent(s: string): string {
  let out = '';
  let inToken = false;
  for (const ch of s) {
    if (ch === '\u0001') inToken = true;
    else if (ch === '\u0002') inToken = false;
    out += inToken ? ch : (MAP.get(ch) ?? ch);
  }
  return out;
}

/** Pseudo-localize one piece of display text (no-op for text without letters). */
export function pseudoText(s: string): string {
  const letters = s.replace(TOKEN, '').match(/[A-Za-z]/g)?.length ?? 0;
  if (letters === 0) return s;
  const pad = PAD.repeat(Math.max(1, Math.ceil(letters * 0.4)));
  return `${PSEUDO_OPEN}${accent(s)}${pad}${PSEUDO_CLOSE}`;
}

function wrapFn(fn: (...a: unknown[]) => unknown): (...a: unknown[]) => unknown {
  const wrapped = (...args: unknown[]) => {
    const strings: string[] = [];
    const tokenized = args.map((a) => {
      if (typeof a !== 'string') return a;
      strings.push(a);
      return token(strings.length - 1);
    });
    const out = fn(...tokenized);
    if (typeof out !== 'string') return out;
    return pseudoText(out).replace(TOKEN, (_, i: string) => strings[Number(i)] ?? '');
  };
  // Keep the declared arity (tests and helpers call messages by their length).
  Object.defineProperty(wrapped, 'length', { value: fn.length });
  return wrapped;
}

function transform(v: unknown): unknown {
  if (typeof v === 'string') return pseudoText(v);
  if (typeof v === 'function') return wrapFn(v as (...a: unknown[]) => unknown);
  if (Array.isArray(v)) return v.map(transform);
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, transform(x)]));
  return v;
}

let cached: Messages | null = null;

/** The pseudo catalog (derived from English once). */
export function pseudoMessages(): Messages {
  cached ??= transform(en) as Messages;
  return cached;
}

/** Pseudo-localize the config's display text (labels, descriptions, mottos only). */
export function pseudoConfig(config: DashboardConfig): DashboardConfig {
  return {
    ...config,
    themes: config.themes.map((t) => ({
      ...t,
      label: pseudoText(t.label),
      description: pseudoText(t.description),
    })),
    crews: config.crews.map((c) => ({
      ...c,
      label: pseudoText(c.label),
      motto: c.motto === undefined ? undefined : pseudoText(c.motto),
    })),
    floor: {
      ...config.floor,
      rooms: config.floor.rooms.map((r) => ({
        ...r,
        label: pseudoText(r.label),
        description: pseudoText(r.description),
      })),
    },
  };
}
