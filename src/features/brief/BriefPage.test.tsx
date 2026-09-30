import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { createCheckpoint } from '@/domain/checkpoint';
import { buildCommands } from '@/features/command/commands';
import { LAST_VIEW_KEY } from '@/store/lastView';
import { AWAY_AFTER_MS } from '@/store/LastViewProvider';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

async function renderBrief(adapter = testAdapter()) {
  window.location.hash = '#/brief';
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}

const figure = (name: string) => document.querySelector<HTMLElement>(`[data-figure="${name}"]`)!;

describe('Founder brief and change digest', () => {
  it('first visit: history is UNKNOWN, not "nothing changed"', async () => {
    await renderBrief();
    expect(screen.getByText(/No previous view is recorded/)).toBeInTheDocument();
    expect(within(figure('newSinceLastView')).getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing changed in any category/)).not.toBeInTheDocument();
    const row = document.querySelector('[data-category="missionsNew"]')!;
    expect(row.textContent).toContain('UNKNOWN');
  });

  it('"Mark all as seen" stores a checkpoint and makes the digest comparable', async () => {
    const user = userEvent.setup();
    await renderBrief();
    await user.click(screen.getByRole('button', { name: 'Mark all as seen' }));
    expect(localStorage.getItem(LAST_VIEW_KEY)).toContain('"adapterId":"demo"');
    expect(screen.getByText(/Compared with your last view/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing changed in any category/)).toBeInTheDocument();
    expect(within(figure('newSinceLastView')).getByText('0')).toBeInTheDocument();
  });

  it('changes after the checkpoint are listed and linked to their records', async () => {
    const user = userEvent.setup();
    const adapter = await renderBrief();
    await user.click(screen.getByRole('button', { name: 'Mark all as seen' }));
    act(() => {
      for (let i = 0; i < 12; i++) adapter.simulation.step();
    });
    const items = document.querySelectorAll('.digest-item');
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      const link = it.querySelector('a')!;
      expect(link.getAttribute('href')).toMatch(/^#\/(missions|workers|approvals|alerts)/);
    }
  });

  it('"Forget last view" returns to UNKNOWN history', async () => {
    const user = userEvent.setup();
    await renderBrief();
    await user.click(screen.getByRole('button', { name: 'Mark all as seen' }));
    await user.click(screen.getByRole('button', { name: 'Forget last view' }));
    expect(localStorage.getItem(LAST_VIEW_KEY)).toBeNull();
    expect(screen.getByText(/No previous view is recorded/)).toBeInTheDocument();
  });

  it('a malformed stored checkpoint is rejected and reported, never trusted', async () => {
    localStorage.setItem(LAST_VIEW_KEY, '{"v":1,"at":"not a date","adapterId":"demo"');
    await renderBrief();
    expect(screen.getByText(/unreadable or invalid and was ignored/)).toBeInTheDocument();
    expect(within(figure('newSinceLastView')).getByText('UNKNOWN')).toBeInTheDocument();
  });

  it('a checkpoint from a different data source is not compared', async () => {
    const adapter = testAdapter();
    await adapter.connect();
    const cp = {
      ...createCheckpoint(adapter.getSnapshot(), new Date(Date.now() - 60_000).toISOString()),
      adapterId: 'rest',
      mode: 'live',
    };
    adapter.disconnect();
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(cp));
    await renderBrief();
    expect(screen.getByText(/different data source \(LIVE\)/)).toBeInTheDocument();
  });

  it('the page is saved as "last looked" when hidden, and becomes the baseline after being away', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    try {
      await renderBrief();
      expect(localStorage.getItem(LAST_VIEW_KEY)).toBeNull();
      const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(localStorage.getItem(LAST_VIEW_KEY)).not.toBeNull();
      vi.setSystemTime(Date.now() + AWAY_AFTER_MS + 1000);
      vis.mockReturnValue('visible');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(await screen.findByText(/Compared with your last view/)).toBeInTheDocument();
      vis.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the attention queue with source, state, freshness and a navigation target only', async () => {
    await renderBrief();
    const panel = document.querySelector<HTMLElement>('[data-focus-id="attention"]')!;
    const gate = within(panel).getByRole('link', { name: 'Rotate staging deploy key' });
    expect(gate).toHaveAttribute('href', '#/approvals?focus=APR-031');
    expect(within(panel).getAllByText('DEMO · SIMULATED').length).toBeGreaterThan(0);
    // Information only: no decision controls anywhere on the brief.
    const main = screen.getByRole('main');
    for (const name of [/approve/i, /deny/i, /hold/i, /dispatch/i, /certify/i, /grant/i])
      expect(within(main).queryByRole('button', { name })).toBeNull();
  });

  it('is available in Spanish with enum values untouched', async () => {
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' }));
    await renderBrief();
    expect(
      await screen.findByRole('heading', { name: 'Desde tu última visita' }),
    ).toBeInTheDocument();
    expect(within(figure('newSinceLastView')).getByText('DESCONOCIDO')).toBeInTheDocument();
    expect(screen.getAllByText('APR-031').length).toBeGreaterThan(0);
  });
});

describe('palette: "What changed since I last looked?"', () => {
  it('navigates to the digest (navigation only)', async () => {
    const adapter = testAdapter();
    const snapshot = await adapter.connect();
    const navigate = vi.fn();
    const cmds = buildCommands({
      snapshot,
      config: assemblyNexusConfig,
      navigate,
      sim: null,
      openShortcuts: () => undefined,
      setTheme: () => undefined,
    });
    const cmd = cmds.find((c) => c.title === 'What changed since I last looked?')!;
    expect(cmd.group).toBe('Attention');
    cmd.run();
    expect(navigate).toHaveBeenCalledWith('#/brief?focus=digest');
    adapter.disconnect();
  });
});
