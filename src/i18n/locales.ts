/**
 * Supported UI locales. English is the source language and the default.
 *
 * Locale affects PRESENTATION ONLY. Identifiers, enum values (states, statuses,
 * decisions), backend strings, and authority values are never translated and
 * never derived from translated text.
 */
export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
/** `auto` follows the browser language (as an initial preference only). */
export type LocalePreference = Locale | 'auto';

export const DEFAULT_LOCALE: Locale = 'en';

/** Each locale's own name for itself (shown in the language picker). */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

export function isLocalePreference(v: unknown): v is LocalePreference {
  return v === 'auto' || isLocale(v);
}

/** First supported language in the browser's list, else the default. */
export function browserLocale(languages: readonly string[] | undefined): Locale {
  for (const tag of languages ?? []) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function resolveLocale(
  pref: LocalePreference,
  languages: readonly string[] | undefined,
): Locale {
  return pref === 'auto' ? browserLocale(languages) : pref;
}

export function navigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** Where viewer preferences (including the language) are stored in this browser. */
export const PREFERENCES_KEY = 'forge-floor:preferences';

/** The stored language preference, validated (anything unknown means `auto`). */
export function storedLocalePreference(): LocalePreference {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    const v = raw ? (JSON.parse(raw) as { locale?: unknown }).locale : undefined;
    return isLocalePreference(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}
