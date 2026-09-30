import { waitForSurface } from '@/test/render';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardAdapter } from '@/adapters/types';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { restStreamTestAdapter, restTestAdapter } from '@/test/adapters';
import { BASE } from '@/test/fakeBackend';
import { FakeEventSource } from '@/test/fakeEventSource';
import { testAdapter } from '@/test/fixtures';

async function openSettings(adapter: DashboardAdapter) {
  window.location.hash = '#/settings?focus=transport';
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return screen.getByRole('region', { name: 'Transport and freshness' });
}

const row = (panel: HTMLElement, label: string) =>
  within(panel).getByText(label).closest('.kv__row') as HTMLElement;

describe('transport diagnostics', () => {
  it('REST+SSE adapter reports truthful values and no addresses or secrets', async () => {
    FakeEventSource.reset();
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    FakeEventSource.latest().emit('heartbeat', '{}');
    FakeEventSource.latest().emit('forge', 'not json');
    const d = adapter.diagnostics();
    expect(d.configured).toBe('polling+stream');
    expect(d.active).toBe('sse');
    expect(d.streamState).toBe('open');
    expect(d.lastStreamMessageAt).toBeDefined();
    expect(d.rejectedStreamMessages).toBe(1);
    expect(d.lastRestVerificationAt).toBeDefined();
    expect(d.resyncIntervalMs).toBe(60_000);
    const json = JSON.stringify(d);
    expect(json).not.toContain(BASE);
    expect(json).not.toMatch(/https?:|token|secret|authorization|cookie/i);
  });

  it('demo adapter says it is simulated (no transport), not "live"', async () => {
    const panel = await openSettings(testAdapter());
    expect(
      within(row(panel, 'Configured transport')).getByText(/simulated in this browser/),
    ).toBeInTheDocument();
    expect(within(row(panel, 'Active transport')).getByText('SIMULATED')).toBeInTheDocument();
    expect(within(panel).queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('REST adapter without a stream: POLL, stream values not applicable', async () => {
    const { adapter } = restTestAdapter();
    const panel = await openSettings(adapter);
    expect(within(row(panel, 'Active transport')).getByText('POLL')).toBeInTheDocument();
    expect(within(row(panel, 'Stream state')).getByText('not configured')).toBeInTheDocument();
    expect(within(row(panel, 'Heartbeat timeout')).getByText('not applicable')).toBeInTheDocument();
    expect(within(row(panel, 'Poll interval')).getByText('5s')).toBeInTheDocument();
  });

  it('an adapter that reports no diagnostics shows UNKNOWN, never a guess', async () => {
    const base = testAdapter();
    const bare = Object.create(base) as DashboardAdapter;
    Object.defineProperty(bare, 'diagnostics', { value: undefined });
    const panel = await openSettings(bare);
    expect(within(row(panel, 'Configured transport')).getByText('UNKNOWN')).toBeInTheDocument();
    expect(within(row(panel, 'Active transport')).getByText('UNKNOWN')).toBeInTheDocument();
  });

  it('shows freshness source and qualifiers separately (LIVE + PARTIAL is representable)', async () => {
    const { adapter, backend } = restTestAdapter();
    backend.failures.missions = 'http500';
    const panel = await openSettings(adapter);
    const fresh = row(panel, 'Data freshness');
    expect(fresh.querySelector('[data-freshness-source="LIVE"]')).not.toBeNull();
    expect(fresh.querySelector('[data-freshness-qualifier="PARTIAL"]')).not.toBeNull();
    expect(fresh.querySelector('[data-complete="false"]')).not.toBeNull();
  });
});
