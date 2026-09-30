import { useContext } from 'react';
import { I18nContext, type I18nContextValue } from './context';
import { en } from './en';
import { formatDurationIn, formatRelativeIn } from './format';
import { intlFormatters } from './intlFormatters';

const FALLBACK: I18nContextValue = {
  locale: 'en',
  pseudo: false,
  preference: 'auto',
  browserLocale: 'en',
  setPreference: () => undefined,
  m: en,
  rel: (iso, now) => formatRelativeIn(en, iso, now),
  duration: (ms) => formatDurationIn(en, ms),
  ...intlFormatters('en', en.time.unknown),
};

/**
 * Active UI messages and formatters. Outside an I18nProvider (isolated
 * component tests) it falls back to English rather than throwing.
 */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext) ?? FALLBACK;
}
