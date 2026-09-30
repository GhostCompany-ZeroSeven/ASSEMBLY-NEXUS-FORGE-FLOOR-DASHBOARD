import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Minimal hash router. Hash routing keeps the app deployable as static files
 * on any host without server rewrites. Swap for a full router if needed.
 */
export type Route =
  | { name: 'command' }
  | { name: 'floor' }
  | { name: 'missions' }
  | { name: 'mission'; id: string }
  | { name: 'workers' }
  | { name: 'worker'; id: string }
  | { name: 'approvals' }
  | { name: 'alerts' }
  | { name: 'activity' }
  | { name: 'settings' }
  | { name: 'not-found'; path: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0]!.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [head, id] = parts;
  if (parts.length === 0) return { name: 'command' };
  switch (head) {
    case 'floor':
      return { name: 'floor' };
    case 'missions':
      return id ? { name: 'mission', id } : { name: 'missions' };
    case 'workers':
      return id ? { name: 'worker', id } : { name: 'workers' };
    case 'approvals':
      return { name: 'approvals' };
    case 'alerts':
      return { name: 'alerts' };
    case 'activity':
      return { name: 'activity' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'not-found', path };
  }
}

export const href = {
  command: () => '#/',
  floor: () => '#/floor',
  missions: () => '#/missions',
  mission: (id: string) => `#/missions/${encodeURIComponent(id)}`,
  workers: () => '#/workers',
  worker: (id: string) => `#/workers/${encodeURIComponent(id)}`,
  approvals: () => '#/approvals',
  alerts: () => '#/alerts',
  activity: () => '#/activity',
  settings: () => '#/settings',
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);
  return route;
}

/** Navigate to a hash route (e.g. `href.floor()`). */
export function navigate(hash: string): void {
  window.location.hash = hash;
}

/* ------------------------------------------------------------------------ */
/* Hash query (?focus=…, ?room=…, ?worker=…) for deep links and search       */
/* ------------------------------------------------------------------------ */

export type HashQuery = Record<string, string>;

export function parseHashQuery(hash: string): HashQuery {
  const i = hash.indexOf('?');
  if (i < 0) return {};
  const out: HashQuery = {};
  new URLSearchParams(hash.slice(i + 1)).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

/** Append a query to a hash route, e.g. `withQuery(href.alerts(), { focus: 'ALR-7' })`. */
export function withQuery(hash: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, v);
  const qs = params.toString();
  return qs ? `${hash.split('?')[0]}?${qs}` : hash.split('?')[0]!;
}

/** Stable key for the route path only (query changes do not count as navigation). */
export function routeKey(r: Route): string {
  return 'id' in r ? `${r.name}:${r.id}` : r.name;
}

// Back/forward across pushState entries fires popstate; listen to both.
const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
};

/** Reactive view of the current hash query string. */
export function useHashQuery(): HashQuery {
  const raw = useSyncExternalStore(subscribeHash, () => window.location.hash.split('?')[1] ?? '');
  return parseHashQuery(`?${raw}`);
}

/**
 * Replace the current hash query without adding a history entry (for
 * selections such as the floor's selected worker).
 */
export function replaceHashQuery(query: Record<string, string | undefined>): void {
  const next = withQuery(window.location.hash || '#/', query);
  if (next === window.location.hash) return;
  history.replaceState(history.state, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
