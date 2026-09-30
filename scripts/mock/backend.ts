/**
 * MOCK backend core: the Forge Floor wire format v1 served from demo seed data,
 * for local manual testing and the browser runtime suites. NOT a production
 * server and NOT the Assembly Nexus contract. Nothing here authenticates,
 * authorizes or reaches any real system.
 *
 * TEST/DEMO DATA CONTROL (never ANN authority control). The `/__mock/*` control
 * routes change only this process's in-memory mock data, through a closed set
 * of bounded operations:
 *
 *   POST /__mock/events   {deliver, events[] | raw}  inject events (stream, listing, or both)
 *   POST /__mock/bulk     {count, deliver, ...}      generate many synthetic progress events
 *   POST /__mock/fault    {resource, mode}           make one resource or the stream fail
 *   POST /__mock/fixture  {op, ...}                  allowlisted record edits (see FIXTURE_OPS)
 *   GET  /__mock/state                               counts, for test assertions
 *
 * There is no eval, no file or shell access, no proxying and no arbitrary
 * path or field writes. Every body is size-capped and every list is bounded.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildSeedSnapshot } from '../../src/adapters/demo/seed.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export const MAX_BODY_CHARS = 64_000;
export const MAX_EVENT_CHARS = 8_000;
export const MAX_INJECT_EVENTS = 50;
export const MAX_BULK_EVENTS = 2_000;
export const MAX_LISTED_EVENTS = 5_000;
export const MAX_TEXT = 4_000;
export const MAX_ARTIFACTS = 20;

export const RESOURCES = [
  'health',
  'workers',
  'missions',
  'approvals',
  'alerts',
  'events',
] as const;
type Resource = (typeof RESOURCES)[number];
const RESOURCE_MODES = ['down', 'http500', 'malformed', 'slow', 'empty'] as const;
const STREAM_MODES = ['down', 'silent', 'malformed'] as const;
const DELIVERY = ['stream', 'list', 'both'] as const;
type Delivery = (typeof DELIVERY)[number];

/** The complete set of fixture operations. Anything else is refused. */
export const FIXTURE_OPS = [
  'mission.hide',
  'mission.restore',
  'mission.patch',
  'artifacts.set',
  'approval.add',
  'alert.add',
  'events.window',
  'events.clear',
  'reset',
] as const;

export interface TenantOptions {
  /** Seed clock origin (defaults to the time the tenant is created). */
  seedNowMs?: number;
  /** Emit a periodic progress event (manual demo only; off for tests). */
  autoEvents?: boolean;
  environment?: string;
}

class Tenant {
  seedNowMs: number;
  environment: string;
  health: Obj = {};
  workers: unknown[] = [];
  missions: Obj[] = [];
  approvals: unknown[] = [];
  alerts: unknown[] = [];
  /** The listing. Entries are raw wire objects: malformed ones are allowed on purpose. */
  events: unknown[] = [];
  hidden = new Set<string>();
  window: number | null = null;
  failures = new Map<string, string>();
  streams = new Set<ServerResponse>();
  seq = 0;

  constructor(opts: TenantOptions) {
    this.seedNowMs = opts.seedNowMs ?? Date.now();
    this.environment = opts.environment ?? 'mock';
    this.reset();
  }

  reset() {
    const s = buildSeedSnapshot(this.seedNowMs);
    this.health = { ...s.health, environment: this.environment } as unknown as Obj;
    this.workers = s.workers;
    this.missions = s.missions as unknown as Obj[];
    this.approvals = s.approvals;
    this.alerts = s.alerts;
    // Seed events as a backend would list them (no dashboard ingest fields).
    this.events = s.events.map(({ via: _v, receivedAt: _r, ...e }) => e);
    this.hidden.clear();
    this.window = null;
    this.failures.clear();
  }

  listed(): unknown[] {
    return this.window === null ? this.events : this.events.slice(-this.window);
  }

  body(name: Resource): unknown {
    switch (name) {
      case 'health':
        return { ...this.health, checkedAt: new Date().toISOString() };
      case 'workers':
        return { workers: this.workers };
      case 'missions':
        return { missions: this.missions.filter((m) => !this.hidden.has(String(m.id))) };
      case 'approvals':
        return { approvals: this.approvals };
      case 'alerts':
        return { alerts: this.alerts };
      case 'events':
        return { events: this.listed() };
    }
  }

  writeStream(frame: string) {
    const mode = this.failures.get('stream');
    if (mode === 'silent' || mode === 'down') return;
    for (const res of this.streams) res.write(frame);
  }

  pushEvent(event: Obj) {
    const id = sseSafe(String(event.id ?? `mock-${++this.seq}`));
    const data =
      this.failures.get('stream') === 'malformed' ? '{"kind": "broken' : JSON.stringify(event);
    this.writeStream(`id: ${id}\nevent: forge\ndata: ${data}\n\n`);
  }

  pushRaw(raw: string) {
    this.writeStream(`event: forge\ndata: ${sseSafe(raw)}\n\n`);
  }

  appendListed(events: unknown[]) {
    this.events.push(...events);
    if (this.events.length > MAX_LISTED_EVENTS) this.events = this.events.slice(-MAX_LISTED_EVENTS);
  }
}

/** One SSE line: no CR/LF, so injected text can never add SSE fields. */
function sseSafe(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').slice(0, MAX_EVENT_CHARS);
}

export class BadRequest extends Error {}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], what: string): T {
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  throw new BadRequest(`${what} must be one of ${allowed.join(', ')}`);
}

function text(v: unknown, what: string, max = MAX_TEXT): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max)
    throw new BadRequest(`${what} must be a string of 1..${max} characters`);
  return v;
}

function int(v: unknown, what: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi)
    throw new BadRequest(`${what} must be an integer in ${lo}..${hi}`);
  return v;
}

/** `atOffsetMs` (relative to the server clock) → `at`; anything else is passed through as is. */
function resolveTimes(e: Obj, nowMs: number): Obj {
  if (typeof e.atOffsetMs !== 'number') return e;
  const { atOffsetMs, ...rest } = e;
  return { ...rest, at: new Date(nowMs + (atOffsetMs as number)).toISOString() };
}

export class MockBackend {
  private tenants = new Map<string, Tenant>();
  private heartbeat: ReturnType<typeof setInterval>;
  private auto: ReturnType<typeof setInterval> | undefined;
  private readonly opts: TenantOptions & { heartbeatMs?: number; maxTenants?: number };

  constructor(opts: TenantOptions & { heartbeatMs?: number; maxTenants?: number } = {}) {
    this.opts = opts;
    this.heartbeat = setInterval(() => {
      for (const t of this.tenants.values()) t.writeStream('event: heartbeat\ndata: {}\n\n');
    }, opts.heartbeatMs ?? 5000);
    if (opts.autoEvents) {
      let tick = 0;
      this.auto = setInterval(() => {
        tick = (tick + 1) % 10;
        for (const t of this.tenants.values())
          t.pushEvent({
            id: `mock-${++t.seq}`,
            kind: 'task.progress',
            at: new Date().toISOString(),
            missionId: 'AN-0142',
            workerId: 'w-ada',
            payload: { taskId: 'AN-0142-T2', progress: 0.5 + tick / 25 },
          });
      }, 7000);
    }
  }

  close() {
    clearInterval(this.heartbeat);
    if (this.auto) clearInterval(this.auto);
    for (const t of this.tenants.values()) for (const s of t.streams) s.destroy();
  }

  tenant(key: string): Tenant {
    let t = this.tenants.get(key);
    if (!t) {
      if (this.tenants.size >= (this.opts.maxTenants ?? 500)) {
        // Bounded: evict the oldest tenant.
        const [oldest] = this.tenants.keys();
        for (const s of this.tenants.get(oldest!)!.streams) s.destroy();
        this.tenants.delete(oldest!);
      }
      t = new Tenant(this.opts);
      this.tenants.set(key, t);
    }
    return t;
  }

  /** Wire-format API (`/health`, `/missions`, …, `/stream`, decisions). */
  async api(
    tenantKey: string,
    path: string,
    req: IncomingMessage,
    res: ServerResponse,
    send: (status: number, body: unknown) => void,
  ): Promise<void> {
    const t = this.tenant(tenantKey);
    if (path === '/stream' && req.method === 'GET') {
      if (t.failures.get('stream') === 'down') return send(503, { error: 'stream down' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      t.streams.add(res);
      req.on('close', () => t.streams.delete(res));
      return;
    }

    const decide = path.match(/^\/approvals\/([^/]+)\/decision$/);
    if (decide && req.method === 'POST') {
      const body = await readJson(req).catch(() => null);
      const id = decodeURIComponent(decide[1]!);
      const a = (t.approvals as Obj[]).find((x) => x.id === id);
      const decision = String(body?.decision ?? '');
      if (!a || !['APPROVE', 'DENY', 'HOLD'].includes(decision))
        return send(400, { error: 'bad request' });
      if (a.status !== 'PENDING' && a.status !== 'HELD')
        return send(409, { error: 'already decided' });
      // A real backend must authenticate the human here. The mock only echoes the claim.
      const record = {
        decision,
        decidedBy: String(body?.decidedBy ?? '').slice(0, 200),
        decidedAt: new Date().toISOString(),
        note: typeof body?.note === 'string' ? body.note.slice(0, 2000) : undefined,
      };
      a.status = { APPROVE: 'APPROVED', DENY: 'DENIED', HOLD: 'HELD' }[decision];
      a.decision = record;
      t.pushEvent({
        id: `mock-${++t.seq}`,
        kind: 'approval.decided',
        at: record.decidedAt,
        missionId: a.missionId,
        payload: { approvalId: id, record },
      });
      return send(200, { record });
    }
    const ack = path.match(/^\/alerts\/([^/]+)\/acknowledge$/);
    if (ack && req.method === 'POST') {
      const a = (t.alerts as Obj[]).find((x) => x.id === decodeURIComponent(ack[1]!));
      if (!a) return send(404, { error: 'not found' });
      a.acknowledgedAt ??= new Date().toISOString();
      return send(200, { ok: true });
    }

    const name = path.replace(/^\//, '');
    if (req.method !== 'GET' || !(RESOURCES as readonly string[]).includes(name))
      return send(404, { error: 'not found' });
    const mode = t.failures.get(name);
    if (mode === 'down') return void req.socket.destroy();
    if (mode === 'http500') return send(500, { error: 'injected' });
    if (mode === 'malformed') return send(200, '{"not":"what you expected"');
    if (mode === 'empty') return send(200, { [name]: [] });
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 15_000));
    return send(200, t.body(name as Resource));
  }

  /** Mock control routes (`/__mock/*`). Bounded TEST/DEMO data control only. */
  async control(
    tenantKey: string,
    path: string,
    req: IncomingMessage,
    send: (status: number, body: unknown) => void,
  ): Promise<void> {
    const t = this.tenant(tenantKey);
    if (path === '/__mock/state' && req.method === 'GET')
      return send(200, {
        listed: t.listed().length,
        stored: t.events.length,
        streams: t.streams.size,
        hidden: [...t.hidden],
        window: t.window,
        failures: Object.fromEntries(t.failures),
      });
    if (req.method !== 'POST') return send(405, { error: 'POST only' });
    let body: Obj;
    try {
      body = await readJson(req);
    } catch (e) {
      return send(400, { error: e instanceof SyntaxError ? 'invalid JSON' : (e as Error).message });
    }
    try {
      const now = Date.now();
      switch (path) {
        case '/__mock/events': {
          const deliver = oneOf(body.deliver, DELIVERY, 'deliver');
          if (body.raw !== undefined) {
            // A raw (possibly malformed) stream message. Stream only.
            if (deliver !== 'stream') throw new BadRequest('raw is stream-only');
            t.pushRaw(text(body.raw, 'raw', MAX_EVENT_CHARS));
            return send(200, { delivered: 1 });
          }
          if (!Array.isArray(body.events) || body.events.length > MAX_INJECT_EVENTS)
            throw new BadRequest(`events must be an array of at most ${MAX_INJECT_EVENTS}`);
          const events = body.events.map((e, i) => {
            if (!isObj(e)) throw new BadRequest(`events[${i}] must be an object`);
            if (JSON.stringify(e).length > MAX_EVENT_CHARS)
              throw new BadRequest(`events[${i}] exceeds ${MAX_EVENT_CHARS} characters`);
            return resolveTimes(e, now);
          });
          deliverEvents(t, events, deliver);
          return send(200, { delivered: events.length, at: new Date(now).toISOString() });
        }
        case '/__mock/bulk': {
          const count = int(body.count, 'count', 1, MAX_BULK_EVENTS);
          const deliver = oneOf(body.deliver, DELIVERY, 'deliver');
          const missionId =
            body.missionId === undefined ? undefined : text(body.missionId, 'missionId', 64);
          const prefix = text(body.prefix ?? 'bulk', 'prefix', 32);
          const startOffsetMs = int(
            body.startOffsetMs ?? -count * 1000,
            'startOffsetMs',
            -864e5,
            864e5,
          );
          const stepMs = int(body.stepMs ?? 1000, 'stepMs', 0, 3_600_000);
          const events = Array.from({ length: count }, (_, i) => ({
            id: `${prefix}-${i + 1}`,
            kind: 'task.progress',
            at: new Date(now + startOffsetMs + i * stepMs).toISOString(),
            ...(missionId ? { missionId } : {}),
            payload: { taskId: missionId ? `${missionId}-T1` : 'T1', progress: (i % 100) / 100 },
          }));
          deliverEvents(t, events, deliver);
          return send(200, { delivered: count });
        }
        case '/__mock/fault': {
          const resource = oneOf(body.resource, [...RESOURCES, 'stream'] as const, 'resource');
          if (body.mode === 'off') t.failures.delete(resource);
          else if (resource === 'stream') {
            const mode = oneOf(body.mode, STREAM_MODES, 'mode');
            t.failures.set('stream', mode);
            // Like a crashed stream server: drop open connections too.
            if (mode === 'down') {
              for (const s of t.streams) s.destroy();
              t.streams.clear();
            }
          } else t.failures.set(resource, oneOf(body.mode, RESOURCE_MODES, 'mode'));
          return send(200, { failures: Object.fromEntries(t.failures) });
        }
        case '/__mock/fixture': {
          fixture(t, body, now);
          return send(200, { ok: true });
        }
      }
      return send(404, { error: 'unknown control route' });
    } catch (e) {
      if (e instanceof BadRequest) return send(400, { error: e.message });
      throw e;
    }
  }
}

function deliverEvents(t: Tenant, events: Obj[], deliver: Delivery) {
  if (deliver !== 'stream') t.appendListed(events);
  if (deliver !== 'list') for (const e of events) t.pushEvent(e);
}

function fixture(t: Tenant, body: Obj, now: number) {
  const op = oneOf(body.op, FIXTURE_OPS, 'op');
  const mission = () => {
    const id = text(body.id, 'id', 64);
    const m = t.missions.find((x) => x.id === id);
    if (!m) throw new BadRequest(`unknown mission ${id}`);
    return m;
  };
  switch (op) {
    case 'reset':
      return t.reset();
    case 'mission.hide':
      return void t.hidden.add(String(mission().id));
    case 'mission.restore':
      return void t.hidden.delete(String(mission().id));
    case 'mission.patch': {
      // Only these fields, only as bounded strings. Unknown enum values are allowed
      // on purpose: the dashboard must show them as UNKNOWN, never guess.
      const m = mission();
      for (const f of ['status', 'title', 'summary'] as const)
        if (body[f] !== undefined) m[f] = text(body[f], f);
      if (body.updatedAtOffsetMs !== undefined)
        m.updatedAt = new Date(
          now + int(body.updatedAtOffsetMs, 'updatedAtOffsetMs', -864e5, 864e5),
        ).toISOString();
      return;
    }
    case 'artifacts.set': {
      const m = mission();
      if (!Array.isArray(body.artifacts) || body.artifacts.length > MAX_ARTIFACTS)
        throw new BadRequest(`artifacts must be an array of at most ${MAX_ARTIFACTS}`);
      m.artifacts = body.artifacts.map((a, i) => {
        if (!isObj(a)) throw new BadRequest(`artifacts[${i}] must be an object`);
        return {
          id: text(a.id, 'artifact id', 64),
          title: text(a.title, 'artifact title'),
          kind: 'document',
          // Passed through untouched: the adapter and UI must refuse unsafe schemes.
          ...(a.uri !== undefined ? { uri: text(a.uri, 'artifact uri', 2000) } : {}),
          createdAt: new Date(now).toISOString(),
        };
      });
      return;
    }
    case 'approval.add': {
      // A PENDING request record only (it asks for authority; it decides nothing).
      // `status` and `requiredAuthority` are bounded strings so tests can send
      // unrecognized or invalid values; the dashboard must not trust them.
      if (t.approvals.length >= 200) throw new BadRequest('too many approvals');
      t.approvals.push({
        id: text(body.id, 'id', 64),
        title: text(body.title, 'title'),
        action: 'Mock gate (test data)',
        rationale: '',
        risk: 'low',
        reversible: true,
        missionId: body.missionId === undefined ? undefined : text(body.missionId, 'missionId', 64),
        requestedBy: 'w-ada',
        requestedAt: new Date(now).toISOString(),
        status: body.status === undefined ? 'PENDING' : text(body.status, 'status', 64),
        requiredAuthority:
          body.requiredAuthority === undefined
            ? 'Founder #0007'
            : typeof body.requiredAuthority === 'string'
              ? body.requiredAuthority.slice(0, 64)
              : '',
      });
      return;
    }
    case 'alert.add': {
      if (t.alerts.length >= 200) throw new BadRequest('too many alerts');
      const missionId =
        body.missionId === undefined ? undefined : text(body.missionId, 'missionId', 64);
      t.alerts.push({
        id: text(body.id, 'id', 64),
        severity: text(body.severity ?? 'WARNING', 'severity', 32),
        title: text(body.title, 'title'),
        whatHappened: 'Mock alert (test data)',
        affected: missionId ? [{ kind: 'mission', id: missionId, label: missionId }] : [],
        attention: '',
        humanActionRequired: body.humanActionRequired === true,
        raisedAt: new Date(now).toISOString(),
      });
      return;
    }
    case 'events.window':
      t.window = body.size === null ? null : int(body.size, 'size', 0, MAX_LISTED_EVENTS);
      return;
    case 'events.clear':
      t.events = [];
      return;
  }
}

export async function readJson(req: IncomingMessage): Promise<Obj> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY_CHARS) throw new Error('body too large');
  }
  if (!raw) return {};
  const v = JSON.parse(raw) as unknown;
  if (!isObj(v)) throw new Error('body must be a JSON object');
  return v;
}
