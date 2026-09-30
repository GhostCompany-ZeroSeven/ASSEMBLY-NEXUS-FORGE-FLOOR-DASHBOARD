import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { DashboardAdapter } from '@/adapters/types';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { restTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { testAdapter } from '@/test/fixtures';
import { App } from './App';

async function renderApp(adapter: DashboardAdapter, hash = '#/', config = assemblyNexusConfig) {
  window.location.hash = hash;
  render(<App config={config} adapter={adapter} />);
  await screen.findByRole('navigation', { name: 'Primary' });
}

const allDown = () => {
  const b = createFakeBackend();
  for (const k of ['health', 'workers', 'missions', 'approvals', 'alerts', 'events'] as const)
    b.failures[k] = 'down';
  return b;
};

describe('failure and disconnection states', () => {
  it('backend unavailable: DISCONNECTED badge, alert banner, retry, no LIVE', async () => {
    const { adapter } = restTestAdapter(allDown());
    await renderApp(adapter);
    expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    const alert = await screen.findByText('Data source unavailable');
    expect(alert.closest('[role="alert"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();
    expect(screen.getByText(/no verified data/)).toBeInTheDocument();
  });

  it('healthy REST backend shows LIVE with its environment label', async () => {
    const { adapter } = restTestAdapter();
    await renderApp(adapter);
    expect(await screen.findByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('TEST')).toBeInTheDocument();
    expect(screen.queryByText(/LOCAL DEMO DATA/)).not.toBeInTheDocument();
  });

  it('reconnecting after a good sync keeps last data, drops LIVE, and says so', async () => {
    const { adapter, backend } = restTestAdapter();
    await renderApp(adapter);
    await screen.findByText('LIVE');
    for (const k of ['health', 'workers', 'missions', 'approvals'] as const)
      backend.failures[k] = 'down';
    await act(async () => {
      await adapter.refresh();
    });
    expect(await screen.findByText('Reconnecting: backend not responding')).toBeInTheDocument();
    expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
    expect(screen.getByText(/data last synced/)).toBeInTheDocument();
  });

  it('stale data banner appears when syncs stop', async () => {
    const { adapter, backend, clock } = restTestAdapter();
    await renderApp(adapter);
    backend.failures.missions = 'http500';
    clock.now += 10 * 60_000;
    await act(async () => {
      await adapter.refresh();
    });
    // Health is fine (still LIVE) but the data is incomplete and old.
    expect(await screen.findByText('PARTIAL DATA')).toBeInTheDocument();
    expect(screen.getByText(/missions/, { selector: '.mono' })).toBeInTheDocument();
  });

  it('malformed payload is surfaced as partial data with details', async () => {
    const backend = createFakeBackend();
    backend.failures.workers = { payload: { nope: 1 } };
    const { adapter } = restTestAdapter(backend);
    await renderApp(adapter);
    const summary = await screen.findByText('PARTIAL DATA');
    await userEvent.click(summary);
    expect(screen.getByText(/Malformed payload/)).toBeInTheDocument();
  });

  it('unknown worker status renders as "Unknown state", not as a healthy state', async () => {
    const backend = createFakeBackend();
    const workers = (backend.data.workers as { workers: Record<string, unknown>[] }).workers;
    workers[0]!.state = 'teleporting';
    const { adapter } = restTestAdapter(backend);
    await renderApp(adapter, '#/workers/w-bramwell');
    expect(screen.getAllByText('Unknown state').length).toBeGreaterThan(0);
  });

  it('zero workers and an empty mission queue render explicit empty states', async () => {
    const backend = createFakeBackend();
    backend.data.workers = { workers: [] };
    backend.data.missions = { missions: [] };
    const { adapter } = restTestAdapter(backend);
    await renderApp(adapter);
    expect(screen.getAllByText(/No workers reported/).length).toBeGreaterThan(0);
    expect(screen.getByText('Nothing in flight')).toBeInTheDocument();
  });

  it('unsupported capability: approvals are view-only with an explanation', async () => {
    const backend = createFakeBackend();
    const { RestAdapter } = await import('@/adapters/rest/RestAdapter');
    const adapter = new RestAdapter(
      { baseUrl: 'http://backend.test/api' },
      { fetch: backend.fetch, createTransport: () => ({ start() {}, stop() {} }) },
    );
    await renderApp(adapter, '#/approvals');
    expect(screen.queryByRole('group', { name: 'Decide APR-031' })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot deliver decisions/)).toBeInTheDocument();
  });

  it('adapter error during connect shows an error screen with retry, not an empty dashboard', async () => {
    let attempts = 0;
    const broken = testAdapter();
    broken.connect = async () => {
      attempts++;
      throw new Error('boom');
    };
    window.location.hash = '#/';
    render(<App config={assemblyNexusConfig} adapter={broken} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Adapter error.*boom/);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('alert');
    expect(attempts).toBe(2);
  });
});

describe('governance in the UI', () => {
  it('a config naming a worker as the human authority offers no decision buttons', async () => {
    const config = {
      ...assemblyNexusConfig,
      governance: { ...assemblyNexusConfig.governance, humanAuthority: 'Cyrus Anvil' },
    };
    await renderApp(testAdapter(), '#/approvals', config);
    expect(screen.queryByRole('group', { name: 'Decide APR-031' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Decision unavailable here/).length).toBeGreaterThan(0);
  });

  it('a failed backend decision leaves the gate pending and shows the error', async () => {
    const { adapter, backend } = restTestAdapter();
    backend.failures.decide = 'http500';
    await renderApp(adapter, '#/approvals');
    const gate = await screen.findByRole('group', { name: 'Decide APR-031' });
    await userEvent.click(within(gate).getByRole('button', { name: /hold/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Hold / Review' }));
    expect(await screen.findByText(/Decision not delivered/)).toBeInTheDocument();
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });

  it('demo mission results are labelled simulated', async () => {
    await renderApp(testAdapter(), '#/missions/AN-0139');
    expect(screen.getByText('Simulated result')).toBeInTheDocument();
  });
});
