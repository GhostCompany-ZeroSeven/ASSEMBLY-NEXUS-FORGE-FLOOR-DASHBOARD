import { useCallback, useMemo } from 'react';
import { parseHashQuery, useHashQuery, withQuery } from './router';

/**
 * URL-persisted view state (filters, sorting, search text) for list surfaces.
 *
 * - Human-readable, bounded parameters (`?group=blocked&sort=priority&q=runner`).
 * - Parsing is fail-safe: unknown, malformed or oversized values fall back to the
 *   default. Nothing in the URL can crash a surface.
 * - URL state is VIEW state only. It never creates backend facts (an unknown
 *   worker id filters to nothing; it does not create a worker) and it never
 *   carries or implies authority. See governance.phase4.test.ts.
 */

export interface Codec<T> {
  parse: (raw: string | undefined) => T | undefined;
  format: (v: T) => string;
}

export const MAX_TEXT = 100;
export const MAX_ID = 80;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:#-]*$/;

/** One of a fixed set of values; anything else is rejected. */
export function oneOf<T extends string>(values: readonly T[]): Codec<T> {
  return {
    parse: (raw) =>
      raw !== undefined && (values as readonly string[]).includes(raw) ? (raw as T) : undefined,
    format: (v) => v,
  };
}

/** Free text, trimmed of control characters and bounded in length. */
export const text: Codec<string> = {
  parse: (raw) =>
    raw === undefined
      ? undefined
      : raw
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .slice(0, MAX_TEXT),
  format: (v) => v,
};

/** An identifier-shaped value (or the literal `all`); never trusted as existing data. */
export const idOrAll: Codec<string> = {
  parse: (raw) =>
    raw === 'all' || (raw !== undefined && raw.length <= MAX_ID && ID_RE.test(raw))
      ? raw
      : undefined,
  format: (v) => v,
};

export const flag: Codec<boolean> = {
  parse: (raw) => (raw === '1' ? true : raw === '0' ? false : undefined),
  format: (v) => (v ? '1' : '0'),
};

export type Schema<F> = { [K in keyof F]: { key: string; codec: Codec<F[K]> } };

/** Pure: read state from a query object (exported for tests). */
export function readState<F extends object>(
  query: Record<string, string>,
  defaults: F,
  schema: Schema<F>,
): F {
  const out = { ...defaults };
  for (const k of Object.keys(schema) as (keyof F)[]) {
    const { key, codec } = schema[k];
    const v = codec.parse(query[key]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Pure: the query for a state. Defaults are omitted so URLs stay short. */
export function writeQuery<F extends object>(
  state: F,
  defaults: F,
  schema: Schema<F>,
): Record<string, string | undefined> {
  const q: Record<string, string | undefined> = {};
  for (const k of Object.keys(schema) as (keyof F)[]) {
    const { key, codec } = schema[k];
    q[key] = state[k] === defaults[k] ? undefined : codec.format(state[k]);
  }
  return q;
}

export type HistoryMode = 'push' | 'replace';

/**
 * Filter state stored in the hash query. Discrete choices (`push`) create a
 * history entry so Back undoes them; typing (`replace`) does not flood history.
 * Parameters owned by other features (except the one-shot `focus` deep link)
 * are preserved.
 */
export function useUrlState<F extends object>(
  defaults: F,
  schema: Schema<F>,
): [F, (patch: Partial<F>, mode?: HistoryMode) => void] {
  const query = useHashQuery();
  const raw = JSON.stringify(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => readState(query, defaults, schema), [raw, defaults, schema]);

  const set = useCallback(
    (patch: Partial<F>, mode: HistoryMode = 'push') => {
      const current = parseHashQuery(window.location.hash);
      const next = { ...readState(current, defaults, schema), ...patch };
      const owned = new Set(Object.values(schema).map((s) => (s as { key: string }).key));
      const others = Object.fromEntries(
        Object.entries(current).filter(([k]) => !owned.has(k) && k !== 'focus'),
      );
      const url = withQuery(window.location.hash || '#/', {
        ...others,
        ...writeQuery(next, defaults, schema),
      });
      if (url === window.location.hash) return;
      if (mode === 'push') history.pushState(history.state, '', url);
      else history.replaceState(history.state, '', url);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    [defaults, schema],
  );

  return [state, set];
}
