/**
 * Local mock backend speaking the Forge Floor wire format v1, for trying the
 * GenericRESTAdapter end to end. NOT a production server. It binds to
 * 127.0.0.1 only and reports `environment: "mock"` so the UI labels it.
 *
 *   npm run mock:rest          # http://127.0.0.1:8787
 *   VITE_FORGE_ADAPTER=rest VITE_FORGE_REST_BASE_URL=http://127.0.0.1:8787 npm run dev
 *
 * Failure injection for manual testing: GET /__fail?resource=workers&mode=down|http500|malformed|slow|off
 * SSE stream at /stream (heartbeat every 5s, pushes decisions and a periodic progress event).
 * Stream faults: /__fail?resource=stream&mode=down|silent|malformed|off
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { buildSeedSnapshot } from '../src/adapters/demo/seed.ts';

const PORT = Number(process.env.PORT ?? 8787);
const seed = buildSeedSnapshot(Date.now());
const state = {
  health: { ...seed.health, environment: 'mock' },
  workers: { workers: seed.workers },
  missions: { missions: seed.missions },
  approvals: { approvals: seed.approvals },
  alerts: { alerts: seed.alerts },
  events: { events: seed.events },
} as Record<string, unknown>;
const failures = new Map<string, string>();
const streams = new Set<ServerResponse>();
let eventSeq = 0;

function push(kind: string, payload: unknown, extra: Record<string, unknown> = {}) {
  const mode = failures.get('stream');
  const id = `mock-${++eventSeq}`;
  const data =
    mode === 'malformed'
      ? '{"kind": "broken'
      : JSON.stringify({ id, kind, at: new Date().toISOString(), ...extra, payload });
  for (const res of streams) {
    if (mode === 'silent') continue;
    res.write(`id: ${id}\nevent: forge\ndata: ${data}\n\n`);
  }
}

setInterval(() => {
  if (failures.get('stream') === 'silent') return;
  for (const res of streams) res.write('event: heartbeat\ndata: {}\n\n');
}, 5000);

// Periodic progress so the stream is visibly alive.
let tick = 0;
setInterval(() => {
  tick = (tick + 1) % 10;
  push(
    'task.progress',
    { taskId: 'AN-0142-T2', progress: 0.5 + tick / 25 },
    { missionId: 'AN-0142', workerId: 'w-ada' },
  );
}, 7000);

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

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error('too large');
  }
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, '', origin);

  if (url.pathname === '/__fail') {
    const resource = url.searchParams.get('resource') ?? '';
    const mode = url.searchParams.get('mode') ?? 'off';
    if (mode === 'off') failures.delete(resource);
    else failures.set(resource, mode);
    // Like a crashed stream server: drop open connections too, not only new ones.
    if (resource === 'stream' && mode === 'down') {
      for (const s of streams) s.destroy();
      streams.clear();
    }
    return send(res, 200, { failures: Object.fromEntries(failures) }, origin);
  }

  if (url.pathname === '/stream' && req.method === 'GET') {
    if (failures.get('stream') === 'down') return send(res, 503, { error: 'stream down' }, origin);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin':
        origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ? origin : 'null',
    });
    res.write('retry: 60000\n\n');
    streams.add(res);
    req.on('close', () => streams.delete(res));
    return;
  }

  const decide = url.pathname.match(/^\/approvals\/([^/]+)\/decision$/);
  if (decide && req.method === 'POST') {
    const body = await readJson(req).catch(() => null);
    const id = decodeURIComponent(decide[1]!);
    const list = (state.approvals as { approvals: Record<string, unknown>[] }).approvals;
    const a = list.find((x) => x.id === id);
    const decision = String(body?.decision ?? '');
    if (!a || !['APPROVE', 'DENY', 'HOLD'].includes(decision))
      return send(res, 400, { error: 'bad request' }, origin);
    if (a.status !== 'PENDING' && a.status !== 'HELD')
      return send(res, 409, { error: 'already decided' }, origin);
    // A real backend must authenticate the human here. The mock only echoes the claim.
    const record = {
      decision,
      decidedBy: String(body?.decidedBy ?? ''),
      decidedAt: new Date().toISOString(),
      note: body?.note ?? undefined,
    };
    a.status = { APPROVE: 'APPROVED', DENY: 'DENIED', HOLD: 'HELD' }[decision];
    a.decision = record;
    push('approval.decided', { approvalId: id, record }, { missionId: a.missionId });
    return send(res, 200, { record }, origin);
  }
  const ack = url.pathname.match(/^\/alerts\/([^/]+)\/acknowledge$/);
  if (ack && req.method === 'POST') {
    const list = (state.alerts as { alerts: Record<string, unknown>[] }).alerts;
    const a = list.find((x) => x.id === decodeURIComponent(ack[1]!));
    if (!a) return send(res, 404, { error: 'not found' }, origin);
    a.acknowledgedAt ??= new Date().toISOString();
    return send(res, 200, { ok: true }, origin);
  }

  const name = url.pathname.replace(/^\//, '');
  if (req.method !== 'GET' || !(name in state))
    return send(res, 404, { error: 'not found' }, origin);
  const mode = failures.get(name);
  if (mode === 'down') return req.socket.destroy();
  if (mode === 'http500') return send(res, 500, { error: 'injected' }, origin);
  if (mode === 'malformed') return send(res, 200, '{"not":"what you expected"', origin);
  if (mode === 'slow') await new Promise((r) => setTimeout(r, 15_000));
  if (name === 'health')
    (state.health as Record<string, unknown>).checkedAt = new Date().toISOString();
  return send(res, 200, state[name], origin);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Forge Floor backend on http://127.0.0.1:${PORT} (environment: mock)`);
});
