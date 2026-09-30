import { createContext } from 'react';
import type { Messages } from './en';
import type { Locale, LocalePreference } from './locales';

export interface I18nContextValue {
  locale: Locale;
  /** Diagnostic pseudo-locale active (`?pseudo=1`); text is derived from English. */
  pseudo: boolean;
  /** The stored preference (`auto` follows the browser). */
  preference: LocalePreference;
  /** Locale the browser asks for (shown next to "Automatic"). */
  browserLocale: Locale;
  setPreference: (p: LocalePreference) => void;
  m: Messages;
  /** Locale-aware relative time, e.g. "18m ago" / "hace 18min". */
  rel: (iso: string, nowMs: number) => string;
  duration: (ms: number) => string;
  /** Locale-aware number (display only; never for ids or enum values). */
  num: (n: number) => string;
  /** Locale-aware percentage from a 0–100 value. */
  pct: (value: number) => string;
  /** Absolute date + 24-hour time. Invalid input shows "unknown", never a guess. */
  dateTime: (iso: string | undefined) => string;
  /** 24-hour clock time with seconds. */
  time: (iso: string | undefined) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
