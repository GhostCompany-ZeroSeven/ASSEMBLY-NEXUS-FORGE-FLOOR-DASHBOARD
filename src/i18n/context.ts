import { createContext } from 'react';
import type { Messages } from './en';
import type { Locale, LocalePreference } from './locales';

export interface I18nContextValue {
  locale: Locale;
  /** The stored preference (`auto` follows the browser). */
  preference: LocalePreference;
  /** Locale the browser asks for (shown next to "Automatic"). */
  browserLocale: Locale;
  setPreference: (p: LocalePreference) => void;
  m: Messages;
  /** Locale-aware relative time, e.g. "18m ago" / "hace 18min". */
  rel: (iso: string, nowMs: number) => string;
  duration: (ms: number) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
