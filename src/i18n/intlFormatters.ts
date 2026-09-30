import type { I18nContextValue } from './context';
import { formatDateTimeIn, formatNumberIn, formatPercentIn, formatTimeIn } from './intl';

export function intlFormatters(
  locale: string,
  unknown: string,
): Pick<I18nContextValue, 'num' | 'pct' | 'dateTime' | 'time'> {
  const tag = locale;
  return {
    num: (n) => formatNumberIn(tag, n, unknown),
    pct: (v) => formatPercentIn(tag, v, unknown),
    dateTime: (iso) => formatDateTimeIn(tag, iso, unknown),
    time: (iso) => formatTimeIn(tag, iso, unknown),
  };
}
