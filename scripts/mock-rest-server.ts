/**
 * Local mock backend speaking the Forge Floor wire format v1, for trying the
 * GenericRESTAdapter end to end. NOT a production server and NOT the Assembly
 * Nexus contract. It binds to 127.0.0.1 only and reports `environment: "mock"`
 * so the UI labels it.
 *
 *   npm run mock:rest          # http://127.0.0.1:8787
 *   VITE_FORGE_ADAPTER=rest VITE_FORGE_REST_BASE_URL=http://127.0.0.1:8787 VITE_FORGE_REST_STREAM=/stream npm run dev
 *
 * Failure injection for manual testing (kept for compatibility):
 *   GET /__fail?resource=workers&mode=down|http500|malformed|slow|empty|off
 *   GET /__fail?resource=stream&mode=down|silent|malformed|off
 * Bounded mock data control (events, faults, fixtures): see scripts/mock/backend.ts.
 */
import { createServer, type ServerResponse } from 'node:http';
import { MockBackend } from './mock/backend.ts';

const PORT = Number(process.env.PORT ?? 8787);
const backend = new MockBackend({ autoEvents: true, heartbeatMs: 5000, environment: 'mock' });
const TENANT = 'default';

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Local development only: allow the Vite dev/preview origins.
    'Access-Control-Allow-Origin':
      origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const reply = (status: number, body: unknown) => send(res, status, body, origin);
  if (req.method === 'OPTIONS') return reply(204, '');
  try {
    if (url.pathname === '/__fail') {
      // Legacy GET form of POST /__mock/fault.
      const resource = url.searchParams.get('resource') ?? '';
      const mode = url.searchParams.get('mode') ?? 'off';
      const fake = Object.assign(
        (async function* () {
          yield JSON.stringify({ resource, mode });
        })(),
        { method: 'POST' },
      );
      return await backend.control(TENANT, '/__mock/fault', fake as never, reply);
    }
    if (url.pathname.startsWith('/__mock/'))
      return await backend.control(TENANT, url.pathname, req, reply);
    if (url.pathname === '/stream') {
      // The SSE response needs CORS for the dev origin as well.
      if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    return await backend.api(TENANT, url.pathname, req, res, reply);
  } catch {
    if (!res.headersSent) reply(500, { error: 'mock error' });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Forge Floor backend on http://127.0.0.1:${PORT} (environment: mock)`);
});
