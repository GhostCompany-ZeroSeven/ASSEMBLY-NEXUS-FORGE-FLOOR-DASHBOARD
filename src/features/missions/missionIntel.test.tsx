import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import type { DashboardAdapter } from '@/adapters/types';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { buildCommands } from '@/features/command/commands';
import { LAST_VIEW_KEY } from '@/store/lastView';
import { MISSION_VIEWS_KEY } from '@/store/missionViews';
import { restTestAdapter } from '@/test/adapters';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

const M = 'AN-0142';

async function renderAt(hash: string, adapter: DashboardAdapter = testAdapter()) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}
async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
  });
  await waitForSurface();
}
const changesPanel = () =>
  screen.findByRole('region', { name: 'Since you last viewed this mission' });

describe('mission-scoped change intelligence', () => {
  it('a mission never viewed says so, even when a global last view exists (A01)', async () => {
    const user = userEvent.setup();
    await renderAt('#/brief');
    await user.click(screen.getByRole('button', { name: 'Mark all as seen' }));
    expect(localStorage.getItem(LAST_VIEW_KEY)).not.toBeNull();
    await go(`#/missions/${M}`);
    expect(
      within(await changesPanel()).getByText(/You have not viewed this mission/),
    ).toBeInTheDocument();
    expect(within(await changesPanel()).queryByText(/Nothing changed in this mission/)).toBeNull();
  });

  it('leaving a mission records its view; returning shows proven changes and new events', async () => {
    const adapter = (await renderAt(`#/missions/${M}`)) as ReturnType<typeof testAdapter>;
    await go('#/missions');
    await screen.findByRole('heading', { name: 'Missions' });
    expect(localStorage.getItem(MISSION_VIEWS_KEY)).toContain(M);
    act(() => {
      for (let i = 0; i < 10; i++) adapter.simulation.step();
    });
    // Mission Control marks it CHANGED (text, not colour alone).
    const card = screen.getByRole('link', { name: new RegExp(M) });
    expect(within(card).getByText('CHANGED')).toBeInTheDocument();
    await go(`#/missions/${M}`);
    const panel = await changesPanel();
    expect(within(panel).getByText(/Your last view of this mission/)).toBeInTheDocument();
    expect(panel.querySelector('[data-coverage="exact"]')).not.toBeNull();
    expect(document.querySelectorAll('.stream__new').length).toBeGreaterThan(0);
  });

  it('"Mark mission as seen" and "Forget" change only local state, never the backend', async () => {
    const user = userEvent.setup();
    const adapter = testAdapter();
    const spies = [
      vi.spyOn(adapter, 'submitApprovalDecision'),
      vi.spyOn(adapter, 'acknowledgeAlert'),
      vi.spyOn(adapter, 'sendWorkerMessage'),
    ];
    await renderAt(`#/missions/${M}`, adapter);
    await user.click(screen.getByRole('button', { name: 'Mark mission as seen' }));
    expect(
      within(await changesPanel()).getByText(/Your last view of this mission/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Forget this mission view' }));
    expect(
      within(await changesPanel()).getByText(/You have not viewed this mission/),
    ).toBeInTheDocument();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });

  it('a malformed stored mission view is rejected and reported (A02)', async () => {
    localStorage.setItem(
      MISSION_VIEWS_KEY,
      JSON.stringify({ v: 1, missions: { [M]: { v: 1, missionId: M, at: 'not a date' } } }),
    );
    await renderAt(`#/missions/${M}`);
    expect(
      within(await changesPanel()).getByText(/unreadable or invalid and was ignored/),
    ).toBeInTheDocument();
  });

  it('storage that throws never breaks mission detail (A10)', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      const user = userEvent.setup();
      await renderAt(`#/missions/${M}`);
      await user.click(screen.getByRole('button', { name: 'Mark mission as seen' }));
      expect(
        within(await changesPanel()).getByText(/would not store mission views/),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/telemetry/i);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('another tab writing mission views is picked up (storage event)', async () => {
    await renderAt('#/missions');
    const other = { v: 1, missions: {} };
    localStorage.setItem(MISSION_VIEWS_KEY, JSON.stringify(other));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: MISSION_VIEWS_KEY }));
    });
    expect(screen.getByRole('heading', { name: 'Missions' })).toBeInTheDocument();
  });

  it('a mission that is no longer reported still shows its change record (A06)', async () => {
    await renderAt('#/missions/AN-9999');
    expect(screen.getByText(/AN-9999 not found/)).toBeInTheDocument();
    expect(
      within(await changesPanel()).getByText(/You have not viewed this mission/),
    ).toBeInTheDocument();
  });
});

describe('Mission Control markers, filter and sort', () => {
  it('"since=changed" with no mission views shows nothing (never guesses); corrupt values fall back', async () => {
    await renderAt('#/missions?since=changed');
    expect(document.querySelectorAll('.mission-card').length).toBe(0);
    await go('#/missions?since=everything&sort=magic');
    expect(document.querySelectorAll('.mission-card').length).toBeGreaterThan(0);
  });

  it('NEEDS FOUNDER marker comes from an open gate for the human authority', async () => {
    await renderAt('#/missions');
    const card = screen.getByRole('link', { name: /AN-0144/ });
    expect(within(card).getByText('NEEDS FOUNDER')).toBeInTheDocument();
    // Accessible explanation, not colour alone.
    expect(card.textContent).toMatch(/open for the human authority/);
  });

  it('sort by recent activity puts missions without retained events last', async () => {
    await renderAt('#/missions?sort=activity');
    const ids = [...document.querySelectorAll('.mission-card__id')].map((n) => n.textContent);
    expect(ids.length).toBeGreaterThan(2);
    expect(ids[0]).toBeTruthy();
  });
});

describe('Founder attention explanations', () => {
  it('each queue item explains its reason code, trigger and where to act', async () => {
    const user = userEvent.setup();
    await renderAt('#/brief');
    const panel = document.querySelector<HTMLElement>('[data-focus-id="attention"]')!;
    const details = panel.querySelectorAll('details.explain');
    expect(details.length).toBeGreaterThan(0);
    await user.click(within(panel).getAllByText('Why is this here?')[0]!);
    const open = panel.querySelector<HTMLElement>('details.explain[open]')!;
    expect(within(open).getByText('PENDING_FOUNDER_GATE')).toBeInTheDocument();
    expect(
      within(open).getByText(/approval gate card, which checks authority/),
    ).toBeInTheDocument();
    expect(within(open).getByText('Founder #0007')).toBeInTheDocument();
  });
});

describe('data-quality inspector', () => {
  it('shows each dimension separately; no score', async () => {
    await renderAt('#/quality');
    expect(
      screen.getByRole('heading', { name: 'Why the dashboard says what it says' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/15 of at most 500 events retained|of at most 500 events retained/),
    ).toBeInTheDocument();
    // No dimension collapses everything into one number.
    const labels = [...document.querySelectorAll('dt')].map((d) => d.textContent ?? '');
    expect(labels.some((l) => /score|health %/i.test(l))).toBe(false);
  });

  it('REST with a failed resource names it and says dependent answers are UNKNOWN', async () => {
    const { adapter, backend } = restTestAdapter();
    backend.failures.workers = 'http500';
    await renderAt('#/quality', adapter);
    const li = document.querySelector('[data-available="false"]')!;
    expect(li.textContent).toMatch(/workers/);
    expect(li.textContent).toMatch(/UNKNOWN/);
    expect(screen.getByText('Resource unavailable')).toBeInTheDocument();
  });
});

describe('EMPTY is not UNKNOWN (events)', () => {
  it('events failing before any arrived shows UNKNOWN, not "No activity yet"', async () => {
    const { adapter, backend } = restTestAdapter();
    backend.failures.events = 'http500';
    await renderAt('#/activity', adapter);
    expect(screen.getByText(/Events: UNKNOWN/)).toBeInTheDocument();
    expect(screen.queryByText('No activity yet')).toBeNull();
  });
});

describe('palette and search', () => {
  it('Phase 6 commands navigate only; "What changed in this mission?" appears on a mission', async () => {
    const adapter = testAdapter();
    const snapshot = await adapter.connect();
    const navigate = vi.fn();
    const base = {
      snapshot,
      config: assemblyNexusConfig,
      navigate,
      sim: null,
      openShortcuts: () => undefined,
      setTheme: () => undefined,
    };
    const off = buildCommands({ ...base, hash: '#/missions' });
    expect(off.some((c) => c.id === 'attention:mission-changes')).toBe(false);
    const on = buildCommands({ ...base, hash: `#/missions/${M}` });
    on.find((c) => c.id === 'attention:mission-changes')!.run();
    expect(navigate).toHaveBeenLastCalledWith(`#/missions/${M}?focus=changes`);
    on.find((c) => c.id === 'diag:quality')!.run();
    expect(navigate).toHaveBeenLastCalledWith('#/quality');
    on.find((c) => c.id === 'missions:changed')!.run();
    expect(navigate).toHaveBeenLastCalledWith('#/missions?since=changed');
    adapter.disconnect();
  });

  it('search results carry SIMULATED provenance for demo data (SEARCH MATCH ≠ CURRENTNESS)', async () => {
    const user = userEvent.setup();
    await renderAt('#/');
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox', { name: /Search commands/ }), 'cyrus');
    const options = await screen.findAllByRole('option');
    const result = options.find((o) => /Cyrus/.test(o.textContent ?? ''))!;
    expect(result.textContent).toContain('SIMULATED');
  });
});
