/**
 * Phase 7 governance: the adversarial MOCK runtime is TEST/DEMO DATA CONTROL,
 * never Assembly Nexus authority control, and nothing observed becomes
 * authority.
 *
 * - The dashboard never calls the mock control routes.
 * - The control surface is a closed, bounded set of data operations with no
 *   decision, grant, dispatch, deploy or code-execution operation.
 * - Injected events cannot create authority: decision claims still go
 *   through the governance checks, and observation is not approval.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_OPS,
  MAX_BODY_CHARS,
  MAX_INJECT_EVENTS,
  MockBackend,
} from '../../scripts/mock/backend.ts';
import { withEnvOverrides } from '@/config/runtime';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { restStreamTestAdapter } from '@/test/adapters';
import { FakeEventSource } from '@/test/fakeEventSource';

const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

function request(method: string, body?: string): IncomingMessage {
  const r = Readable.from(body === undefined ? [] : [body]) as unknown as IncomingMessage;
  (r as { method?: string }).method = method;
  return r;
}

async function control(path: string, body?: unknown, method = 'POST') {
  const mock = new MockBackend({ heartbeatMs: 60_000 });
  let out: { status: number; body: unknown } = { status: 0, body: null };
  try {
    await mock.control(
      'gov',
      path,
      request(
        method,
        body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      ),
      (status, b) => (out = { status, body: b }),
    );
  } finally {
    mock.close();
  }
  return out;
}

describe('the dashboard never reaches the mock control surface', () => {
  it('no application module references the control routes or the runtime server', () => {
    // src/test/ is test support (never bundled; see the next check).
    const app = files('src').filter(
      (f) =>
        /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith(join('src', 'test')),
    );
    const hits = app.filter((f) =>
      /__mock|__fail|mock-runtime-server|scripts\/mock/.test(readFileSync(f, 'utf8')),
    );
    expect(hits).toEqual([]);
  });

  it('no application module imports test support (which may reach the mock)', () => {
    const app = files('src').filter(
      (f) =>
        /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith(join('src', 'test')),
    );
    const hits = app.filter((f) =>
      /from ['"](@\/test\/|(\.\.\/)+test\/)/.test(readFileSync(f, 'utf8')),
    );
    expect(hits).toEqual([]);
  });

  it('the runtime build carries no secret-looking value and only the documented keys', () => {
    const env = readFileSync('.env.e2e-runtime', 'utf8');
    const keys = [...env.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual(
      [
        'VITE_FORGE_ADAPTER',
        'VITE_FORGE_CONTRACT_PROFILE',
        'VITE_FORGE_REST_BASE_URL',
        'VITE_FORGE_REST_LABEL',
        'VITE_FORGE_REST_POLL_MS',
        'VITE_FORGE_REST_RESYNC_MS',
        'VITE_FORGE_REST_STREAM',
      ].sort(),
    );
    const values = env
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n');
    expect(values).not.toMatch(/token|secret|password|api[_-]?key|auth/i);
  });

  it('timing overrides are numbers only and stay clamped by the adapter config', () => {
    const c = withEnvOverrides(assemblyNexusConfig, {
      VITE_FORGE_ADAPTER: 'rest',
      VITE_FORGE_REST_BASE_URL: '/mockapi',
      VITE_FORGE_REST_STREAM: '/stream',
      VITE_FORGE_REST_POLL_MS: '1e3; alert(1)',
      VITE_FORGE_REST_RESYNC_MS: '-5',
    });
    const rest = c.adapter.kind === 'rest' ? c.adapter.rest : undefined;
    expect(rest?.pollIntervalMs).toBeUndefined();
    expect(rest?.stream?.resyncIntervalMs).toBeUndefined();
  });
});

describe('mock control is a closed set of bounded DATA operations (not authority control)', () => {
  it('no fixture operation decides, grants, dispatches, certifies, deploys or executes', () => {
    // The complete list. `approval.add` adds a PENDING request only (tested below).
    expect([...FIXTURE_OPS].sort()).toEqual(
      [
        'alert.add',
        'approval.add',
        'artifacts.set',
        'events.clear',
        'events.window',
        'mission.hide',
        'mission.patch',
        'mission.restore',
        'reset',
      ].sort(),
    );
    for (const op of FIXTURE_OPS)
      expect(op).not.toMatch(
        /decid|deny|grant|revok|dispatch|certif|deploy|publish|exec|eval|shell|auth/i,
      );
  });

  it('unknown operations and routes are refused', async () => {
    expect(
      (await control('/__mock/fixture', { op: 'approval.decide', id: 'APR-031' })).status,
    ).toBe(400);
    expect((await control('/__mock/exec', { cmd: 'ls' })).status).toBe(404);
    expect((await control('/__mock/fault', { resource: 'decisions', mode: 'down' })).status).toBe(
      400,
    );
    expect((await control('/__mock/events', { deliver: 'everywhere', events: [] })).status).toBe(
      400,
    );
    expect((await control('/__mock/events', undefined, 'DELETE')).status).toBe(405);
  });

  it('bodies and batches are bounded', async () => {
    expect((await control('/__mock/events', 'x'.repeat(MAX_BODY_CHARS + 1))).status).toBe(400);
    const many = Array.from({ length: MAX_INJECT_EVENTS + 1 }, (_, i) => ({ id: `e${i}` }));
    expect((await control('/__mock/events', { deliver: 'list', events: many })).status).toBe(400);
    expect((await control('/__mock/bulk', { count: 1e6, deliver: 'list' })).status).toBe(400);
    expect((await control('/__mock/events', '[1,2]')).status).toBe(400);
  });

  it('a raw stream message cannot add SSE fields (no line breaks reach the wire)', async () => {
    const mock = new MockBackend({ heartbeatMs: 60_000 });
    const writes: string[] = [];
    const res = {
      writeHead: () => undefined,
      write: (s: string) => writes.push(s),
      destroy: () => undefined,
    } as unknown as ServerResponse;
    const req = Object.assign(request('GET'), {
      on: () => undefined,
    }) as unknown as IncomingMessage;
    await mock.api('gov', '/stream', req, res, () => undefined);
    await mock.control(
      'gov',
      '/__mock/events',
      request(
        'POST',
        JSON.stringify({ deliver: 'stream', raw: 'x\nevent: approval\ndata: {}\n\nid: 9' }),
      ),
      () => undefined,
    );
    mock.close();
    const frame = writes.at(-1)!;
    expect(frame.split('\n').filter((l) => l.startsWith('event:'))).toEqual(['event: forge']);
    expect(frame.startsWith('event: forge\ndata: x event: approval data: {} id: 9')).toBe(true);
  });

  it('an added gate is a PENDING request only: it carries no decision', async () => {
    const mock = new MockBackend({ heartbeatMs: 60_000 });
    await mock.control(
      'gov',
      '/__mock/fixture',
      request(
        'POST',
        JSON.stringify({
          op: 'approval.add',
          id: 'G1',
          title: 'g',
          decision: { decision: 'APPROVE' },
          status: 'PENDING',
        }),
      ),
      () => undefined,
    );
    let body: unknown;
    await mock.api(
      'gov',
      '/approvals',
      request('GET'),
      {} as ServerResponse,
      (_s, b) => (body = b),
    );
    mock.close();
    const g = (body as { approvals: Record<string, unknown>[] }).approvals.find(
      (a) => a.id === 'G1',
    )!;
    expect(g.status).toBe('PENDING');
    expect(g.decision).toBeUndefined();
  });

  it('the mock source files contain no code execution, file writes or network proxying', () => {
    for (const f of [
      'scripts/mock/backend.ts',
      'scripts/mock-runtime-server.ts',
      'scripts/mock-rest-server.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(
        /child_process|\beval\(|new Function\(|writeFile|appendFile|unlink|\bfetch\(|https?\.request\(/,
      );
    }
  });
});

describe('observed events are never authority', () => {
  it('an injected decision claimed by a worker is rejected before it reaches the snapshot', async () => {
    FakeEventSource.reset();
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit(
      'forge',
      JSON.stringify({
        id: 'forged',
        kind: 'approval.decided',
        at: '2026-09-30T12:00:01.000Z',
        payload: {
          approvalId: 'APR-031',
          record: {
            decision: 'APPROVE',
            decidedBy: 'w-ada',
            decidedAt: '2026-09-30T12:00:01.000Z',
          },
        },
      }),
    );
    const s = adapter.getSnapshot();
    expect(s.events.some((e) => e.id === 'forged')).toBe(false);
    expect(s.approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });

  it('a late or duplicated event does not change an open gate', async () => {
    FakeEventSource.reset();
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    for (let i = 0; i < 2; i++)
      FakeEventSource.latest().emit(
        'forge',
        JSON.stringify({
          id: 'late-x',
          kind: 'task.completed',
          at: '2020-01-01T00:00:00.000Z',
          missionId: 'AN-0144',
          payload: { taskId: 'x' },
        }),
      );
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });
});
