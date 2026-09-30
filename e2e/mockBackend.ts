import type { Page, Route } from '@playwright/test';
import { buildSeedSnapshot } from '../src/adapters/demo/seed';

/**
 * In-browser mock of the Forge Floor wire format (v1) for the REST e2e build.
 * Requests to MOCK_BASE are intercepted by Playwright. Nothing leaves the machine.
 * This is a LOCAL MOCK BACKEND: it reports `environment: "e2e"`, so the UI labels it.
 */
export const MOCK_BASE = 'http://mock-backend.test/api';
export const REST_APP = 'http://localhost:4175';

export type MockMode = 'healthy' | 'partial' | 'down';

export interface MockBackend {
  mode: MockMode;
  decisions: { id: string; body: unknown }[];
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

export async function installMockBackend(
  page: Page,
  mode: MockMode,
  nowMs: number,
): Promise<MockBackend> {
  const s = buildSeedSnapshot(nowMs);
  const data: Record<string, unknown> = {
    health: { ...s.health, checkedAt: new Date(nowMs).toISOString(), environment: 'e2e' },
    workers: { workers: s.workers },
    missions: { missions: s.missions },
    approvals: { approvals: s.approvals },
    alerts: { alerts: s.alerts },
    events: { events: s.events },
  };
  const backend: MockBackend = { mode, decisions: [] };

  await page.route(`${MOCK_BASE}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname.replace('/api', '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    if (backend.mode === 'down') return route.fulfill({ status: 503, headers: CORS, body: 'down' });

    const decide = path.match(/^\/approvals\/([^/]+)\/decision$/);
    if (decide && req.method() === 'POST') {
      const body = req.postDataJSON() as { decision: string; decidedBy: string; note?: string };
      backend.decisions.push({ id: decide[1]!, body });
      return json({ record: { ...body, decidedAt: new Date(nowMs).toISOString() } });
    }
    const name = path.slice(1);
    if (backend.mode === 'partial' && name === 'workers') return json({ unexpected: 'shape' });
    if (backend.mode === 'partial' && name === 'missions')
      return route.fulfill({ status: 500, headers: CORS, body: 'boom' });
    if (name in data) return json(data[name]);
    return json({ error: 'not found' }, 404);
  });
  return backend;
}
