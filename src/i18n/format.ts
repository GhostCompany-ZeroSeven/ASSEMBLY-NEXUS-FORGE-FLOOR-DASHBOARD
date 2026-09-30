import type { DashboardConfig } from '@/config/types';
import { toMs } from '@/domain/time';
import type { Messages } from './en';
import type { Locale } from './locales';

/** Locale-aware compact duration: `45s`, `12m` / `12min`, `3h 04m`, `2d 5h`. */
export function formatDurationIn(m: Messages, durationMs: number): string {
  const u = m.time.unit;
  const total = Math.max(0, Math.floor(durationMs / 1000));
  if (total < 60) return `${total}${u.s}`;
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins}${u.m}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${u.h} ${String(mins % 60).padStart(2, '0')}${u.m}`;
  return `${Math.floor(hours / 24)}${u.d} ${hours % 24}${u.h}`;
}

export function formatRelativeIn(m: Messages, iso: string, nowMs: number): string {
  const ms = toMs(iso);
  if (ms === null) return m.time.unknown;
  const delta = nowMs - ms;
  if (delta < 5_000 && delta > -5_000) return m.time.justNow;
  return delta >= 0
    ? m.time.ago(formatDurationIn(m, delta))
    : m.time.in(formatDurationIn(m, -delta));
}

/** Upper-cases the first character (for option labels built from lower-case enums). */
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Applies the config's optional per-locale display text. Only `label`,
 * `description` and `motto` change; every id, kind, route and authority value
 * is returned untouched (see LocalizedText in config/types.ts).
 */
export function localizeConfig(config: DashboardConfig, locale: Locale): DashboardConfig {
  const hasAny =
    config.floor.rooms.some((r) => r.i18n?.[locale]) ||
    config.crews.some((c) => c.i18n?.[locale]) ||
    config.themes.some((t) => t.i18n?.[locale]);
  if (!hasAny) return config;
  return {
    ...config,
    themes: config.themes.map((t) => ({ ...t, ...t.i18n?.[locale] })),
    crews: config.crews.map((c) => ({ ...c, ...c.i18n?.[locale] })),
    floor: {
      ...config.floor,
      rooms: config.floor.rooms.map((r) => ({ ...r, ...r.i18n?.[locale] })),
    },
  };
}
