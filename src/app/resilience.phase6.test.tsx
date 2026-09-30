/**
 * Phase 6 adversarial resilience: hostile or malformed backend text, unknown
 * statuses, bad timestamps, and the mission surfaces under partial data.
 * (The SSE→POLL relabel regression stays locked in resilience.phase5.test.tsx.)
 */
import { render, screen } from '@testing-library/react';
import { restStreamTestAdapter } from '@/test/adapters';
import { FakeEventSource } from '@/test/fakeEventSource';
import { describe, expect, it } from 'vitest';
import type { DashboardAdapter } from '@/adapters/types';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { restTestAdapter } from '@/test/adapters';
import { waitForSurface } from '@/test/render';
import { App } from './App';

async function renderAt(hash: string, adapter: DashboardAdapter) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
}

type Rec = Record<string, unknown>;
const missions = (data: Rec) => (data.missions as { missions: Rec[] }).missions;

describe('hostile and malformed backend data (REST)', () => {
  it('HTML-like text is rendered as text, never markup (E10)', async () => {
    const { adapter, backend } = restTestAdapter();
    const m = missions(backend.data)[0]!;
    m.title = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    await renderAt(`#/missions/${String(m.id)}`, adapter);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('<img src=x');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('main script')).toBeNull();
  });

  it('a huge summary string is bounded by normalization and does not crash (E09)', async () => {
    const { adapter, backend } = restTestAdapter();
    const m = missions(backend.data)[0]!;
    m.objective = 'x'.repeat(50_000);
    await renderAt(`#/missions/${String(m.id)}`, adapter);
    const lede = document.querySelector('.page__lede')!;
    expect(lede.textContent!.length).toBeLessThanOrEqual(2000);
  });

  it('an unknown mission status shows as UNKNOWN, never success (E07)', async () => {
    const { adapter, backend } = restTestAdapter();
    const m = missions(backend.data)[0]!;
    m.status = 'TOTALLY_DONE_TRUST_ME';
    await renderAt(`#/missions/${String(m.id)}`, adapter);
    expect(document.querySelector('.mission-head__state')!.textContent).toMatch(/unknown/i);
  });

  it('a malformed timestamp drops the record with an issue, never crashes (E08)', async () => {
    const { adapter, backend } = restTestAdapter();
    const alerts = (backend.data.alerts as { alerts: Rec[] }).alerts;
    alerts[0]!.raisedAt = 'the day before yesterday';
    await renderAt('#/quality', adapter);
    expect(screen.getByText('Record dropped as invalid')).toBeInTheDocument();
  });
});

describe('REST re-sync keeps observed events (B01/B08)', () => {
  it('a stream-only event survives a re-sync whose listing omits it; ingest facts unchanged', async () => {
    FakeEventSource.reset();
    const { adapter, clock } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    clock.now += 5_000;
    FakeEventSource.latest().emit(
      'forge',
      JSON.stringify({
        id: 'stream-only',
        kind: 'task.completed',
        at: new Date(clock.now).toISOString(),
        missionId: 'AN-0142',
        payload: { taskId: 't' },
      }),
    );
    const before = adapter.getSnapshot().events.find((e) => e.id === 'stream-only')!;
    clock.now += 60_000;
    await adapter.refresh();
    const after = adapter.getSnapshot().events.filter((e) => e.id === 'stream-only');
    expect(after).toHaveLength(1);
    expect(after[0]!.via).toBe('stream');
    expect(after[0]!.receivedAt).toBe(before.receivedAt);
  });
});
