/**
 * Runtime test server for the browser suites (e2e/phase7.spec.ts). NOT a
 * production server and NOT the Assembly Nexus contract.
 *
 * It serves the `--mode e2e-runtime` bundle and, on the SAME origin, a real
 * HTTP + Server-Sent Events mock backend under `/mockapi` with its bounded
 * TEST/DEMO data control routes under `/__mock/*` (scripts/mock/backend.ts).
 *
 * Isolation: every host name gets its own in-memory mock data, so each test
 * opens the app at a unique `http://<tenant>.localhost:PORT` origin (Chromium
 * resolves `*.localhost` to loopback). Browser storage is per origin too.
 * Binds to 127.0.0.1 only.
 *
 *   npm run build:e2e-runtime && node scripts/mock-runtime-server.ts
 */
import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { MockBackend } from './mock/backend.ts';

const PORT = Number(process.env.PORT ?? 4176);
const ROOT = resolve(process.env.MOCK_RUNTIME_DIST ?? 'dist-e2e-runtime');
const backend = new MockBackend({ heartbeatMs: 1000, environment: 'mock' });

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function serveStatic(pathname: string, res: ServerResponse) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(ROOT, rel || 'index.html');
  // Only files inside ROOT (a sibling such as `dist-e2e-runtime-x` is outside).
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, { error: 'forbidden' });
  let data: Buffer;
  try {
    data = await readFile(file);
  } catch {
    file = join(ROOT, 'index.html');
    data = await readFile(file);
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

createServer(async (req, res) => {
  const host = (req.headers.host ?? 'localhost').split(':')[0]!.toLowerCase().slice(0, 100);
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const reply = (status: number, body: unknown) => send(res, status, body);
  try {
    if (url.pathname.startsWith('/__mock/'))
      return await backend.control(host, url.pathname, req, reply);
    if (url.pathname.startsWith('/mockapi/'))
      return await backend.api(host, url.pathname.slice('/mockapi'.length), req, res, reply);
    return await serveStatic(url.pathname, res);
  } catch {
    if (!res.headersSent) reply(500, { error: 'mock error' });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Mock runtime (app + backend) on http://localhost:${PORT} (environment: mock)`);
});
