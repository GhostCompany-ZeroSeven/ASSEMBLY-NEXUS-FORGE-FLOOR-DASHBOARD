import { en, type Messages } from './en';
import type { Locale } from './locales';

/**
 * Catalog loading. English (the default and fallback) is bundled; other
 * locales are separate chunks loaded on demand, so English users do not
 * download Spanish text (measured: ~30 kB raw).
 */
const loaded = new Map<Locale, Messages>([['en', en]]);
const loaders: Record<Exclude<Locale, 'en'>, () => Promise<Messages>> = {
  es: () => import('./es').then((mod) => mod.es),
};

export function getCatalog(locale: Locale): Messages | undefined {
  return loaded.get(locale);
}

export async function loadCatalog(locale: Locale): Promise<Messages> {
  const have = loaded.get(locale);
  if (have) return have;
  const m = await loaders[locale as Exclude<Locale, 'en'>]();
  loaded.set(locale, m);
  return m;
}
