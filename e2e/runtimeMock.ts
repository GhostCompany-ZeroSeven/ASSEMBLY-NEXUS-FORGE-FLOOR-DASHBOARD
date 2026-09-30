import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Client for the Phase 7 runtime mock (scripts/mock-runtime-server.ts).
 *
 * Each test gets its own origin `http://<tenant>.localhost:4176`, and with it
 * its own in-memory mock data and its own browser storage. Control calls are
 * made from the page (same origin) to the bounded `/__mock/*` routes. This is
 * TEST DATA CONTROL for a MOCK backend: it never reaches a real system, and the
 * dashboard itself never calls these routes.
 */
export const RUNTIME_PORT = 4176;

export function tenantOrigin(info: TestInfo): string {
  let h = 0;
  for (const c of `${info.testId}:${info.retry}:${info.repeatEachIndex}`)
    h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return `http://p7-${(h >>> 0).toString(36)}.localhost:${RUNTIME_PORT}`;
}

export type Delivery = 'stream' | 'list' | 'both';
export type WireEvent = Record<string, unknown>;

export class RuntimeMock {
  constructor(
    private readonly page: Page,
    readonly origin: string,
  ) {}

  private async call(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const r = await this.page.evaluate(
      async ([p, b]) => {
        const res = await fetch(p as string, {
          method: b === undefined ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: b === undefined ? undefined : JSON.stringify(b),
        });
        return { status: res.status, json: (await res.json()) as Record<string, unknown> };
      },
      [path, body] as const,
    );
    expect(r.status, `${path} → ${JSON.stringify(r.json)}`).toBe(200);
    return r.json;
  }

  /** Server time at injection (ISO), for the truth table. */
  events(deliver: Delivery, events: WireEvent[]) {
    return this.call('/__mock/events', { deliver, events });
  }
  raw(data: string) {
    return this.call('/__mock/events', { deliver: 'stream', raw: data });
  }
  bulk(body: {
    count: number;
    deliver: Delivery;
    missionId?: string;
    prefix?: string;
    startOffsetMs?: number;
    stepMs?: number;
  }) {
    return this.call('/__mock/bulk', body);
  }
  fault(resource: string, mode: string) {
    return this.call('/__mock/fault', { resource, mode });
  }
  fixture(body: Record<string, unknown>) {
    return this.call('/__mock/fixture', body);
  }
  state() {
    return this.call('/__mock/state');
  }
}

/** Open a route on this test's origin and wait for the surface and the live stream. */
export async function openRuntime(page: Page, info: TestInfo, route: string, stream = true) {
  const origin = tenantOrigin(info);
  await page.goto(`${origin}/#${route}`);
  await page.locator('[data-surface="ready"]').waitFor();
  if (stream)
    await expect(page.locator('.provenance')).toHaveAttribute('data-transport-mode', 'sse', {
      timeout: 15_000,
    });
  return new RuntimeMock(page, origin);
}

/** Navigate within the app (hash route) and wait for the surface. */
export async function go(page: Page, route: string) {
  await page.evaluate((r) => (window.location.hash = r), route);
  await page.locator('[data-surface="ready"]').waitFor();
}

let seq = 0;
/** A wire event for mission AN-0142 with a source time relative to the mock server clock. */
export function wireEvent(id: string, atOffsetMs: number, extra: WireEvent = {}): WireEvent {
  seq += 1;
  return {
    id,
    kind: 'task.completed',
    atOffsetMs,
    missionId: 'AN-0142',
    payload: { taskId: `AN-0142-X${seq}` },
    ...extra,
  };
}

/** The timeline row of an event. */
export const row = (page: Page, id: string) => page.locator(`.stream__item[data-focus-id="${id}"]`);
