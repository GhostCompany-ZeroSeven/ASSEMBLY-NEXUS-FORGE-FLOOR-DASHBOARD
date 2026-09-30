import type { Locale } from './locales';

const rules = new Map<Locale, Intl.PluralRules>();

/** `one` or `other`, by the locale's plural rules (both en and es use these two). */
export function plural(locale: Locale, n: number, one: string, other: string): string {
  let r = rules.get(locale);
  if (!r) {
    r = new Intl.PluralRules(locale);
    rules.set(locale, r);
  }
  return r.select(n) === 'one' ? one : other;
}
