import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigContext } from '@/store/contexts';
import { useConfig, usePreferences } from '@/store/hooks';
import { getCatalog, loadCatalog } from './catalogs';
import { I18nContext, type I18nContextValue } from './context';
import { formatDurationIn, formatRelativeIn, localizeConfig } from './format';
import { browserLocale, navigatorLanguages, resolveLocale, type Locale } from './locales';

/**
 * Supplies the active locale's messages and formatters, keeps `<html lang>` in
 * sync, and re-provides the config with its optional per-locale display text.
 *
 * Switching locale re-renders in place: no reload, no adapter reconnect, and
 * the dashboard snapshot, filters and URL are untouched. A catalog that is not
 * loaded yet keeps the current language on screen until it arrives (and on a
 * load failure the current language simply stays).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const prefs = usePreferences();
  const config = useConfig();
  const browser = useMemo(() => browserLocale(navigatorLanguages()), []);
  const wanted = resolveLocale(prefs.locale, navigatorLanguages());
  const [shown, setShown] = useState<Locale>(() => (getCatalog(wanted) ? wanted : 'en'));

  useEffect(() => {
    if (getCatalog(wanted)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(wanted);
      return;
    }
    let cancelled = false;
    loadCatalog(wanted)
      .then(() => {
        if (!cancelled) setShown(wanted);
      })
      .catch(() => {
        /* chunk failed to load: keep the language already on screen */
      });
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const locale = getCatalog(shown) ? shown : 'en';
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const m = getCatalog(locale)!;
    return {
      locale,
      preference: prefs.locale,
      browserLocale: browser,
      setPreference: prefs.setLocale,
      m,
      rel: (iso, now) => formatRelativeIn(m, iso, now),
      duration: (ms) => formatDurationIn(m, ms),
    };
  }, [locale, prefs.locale, prefs.setLocale, browser]);

  const localized = useMemo(() => localizeConfig(config, locale), [config, locale]);

  return (
    <I18nContext.Provider value={value}>
      <ConfigContext.Provider value={localized}>{children}</ConfigContext.Provider>
    </I18nContext.Provider>
  );
}
