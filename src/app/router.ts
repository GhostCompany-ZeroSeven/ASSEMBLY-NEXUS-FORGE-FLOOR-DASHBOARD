import { useEffect, useState } from 'react';

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
  const path = hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
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
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Navigate to a hash route (e.g. `href.floor()`). */
export function navigate(hash: string): void {
  window.location.hash = hash;
}
