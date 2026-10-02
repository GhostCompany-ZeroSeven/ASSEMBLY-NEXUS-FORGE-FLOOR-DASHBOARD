import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardAdapter } from '@/adapters/types';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { restTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

/**
 * Phase 12–14 governance: action safety, the lifecycle ladder (false-green
 * guard), explained health, the connection claim, and worker ≠ Associate,
 * checked in the rendered app for the demo and a live REST adapter.
 */

async function open(hash: string, adapter: DashboardAdapter = testAdapter()) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
}

describe('action safety (demo)', () => {
  it('demo approval buttons are labelled a simulation before any click', async () => {
    await open('#/approvals');
    const group = await screen.findByRole('group', { name: 'Decide APR-031' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.dataset.actionClass).toBe('DEMO_SIMULATION');
      const note = document.getElementById(b.getAttribute('aria-describedby')!)!;
      expect(note.textContent).toContain('It is not a Founder approval of anything real.');
    }
    const tag = group.parentElement!.querySelector(
      '[data-action-class="DEMO_SIMULATION"].action-class',
    )!;
    expect(tag.textContent).toMatch(/Simulation.*Founder-gated/);
  });

  it('the approvals page states that viewing a gate never authorizes it', async () => {
    await open('#/approvals');
    expect(screen.getByTestId('gate-view-note').textContent).toContain(
      'Viewing or opening a gate never authorizes it.',
    );
  });

  it('alert acknowledgement is a labelled simulation in demo mode', async () => {
    await open('#/alerts');
    const acks = screen.getAllByRole('button', { name: /Acknowledge/ });
    expect(acks.length).toBeGreaterThan(0);
    for (const a of acks) expect(a.dataset.actionClass).toBe('DEMO_SIMULATION');
  });
});

describe('approval gate facts', () => {
  it('shows the expiry when reported and never invents one', async () => {
    await open('#/approvals');
    for (const d of document.querySelectorAll<HTMLElement>('[data-testid="gate-expiry"]')) {
      const t = d.querySelector('time');
      if (t) expect(t.getAttribute('dateTime')).toMatch(/^\d{4}-/);
      else expect(d.textContent).toBe('No expiry reported');
    }
    expect(document.querySelectorAll('[data-testid="gate-expiry"]').length).toBeGreaterThan(0);
  });
});

describe('action safety (live REST adapter)', () => {
  it('a live approval is never a simulation: Founder-gated or unavailable', async () => {
    const { adapter } = restTestAdapter(createFakeBackend());
    await open('#/approvals', adapter);
    await screen.findByText('APR-031');
    const actionable = [...document.querySelectorAll<HTMLElement>('.gate-btn')];
    expect(actionable.length).toBeGreaterThan(0);
    for (const b of actionable) expect(b.dataset.actionClass).toBe('FOUNDER_GATED_OPERATION');
    expect(document.querySelector('[data-action-class="DEMO_SIMULATION"]')).toBeNull();
  });
});

describe('mission lifecycle ladder', () => {
  it('shows six separate rungs; deployment is not tracked and nothing is a percentage', async () => {
    await open('#/missions/AN-0139');
    const ladder = document.querySelector('.ladder')!;
    const rungs = [...ladder.querySelectorAll<HTMLElement>('.ladder__rung')];
    expect(rungs.map((r) => r.dataset.step)).toEqual([
      'work',
      'tests',
      'review',
      'certification',
      'founder',
      'deployment',
    ]);
    const deploy = rungs.find((r) => r.dataset.step === 'deployment')!;
    expect(deploy.dataset.state).toBe('NOT_TRACKED');
    expect(deploy.textContent).toContain('Not tracked');
    expect(ladder.textContent).not.toMatch(/%/);
  });

  it('a mission waiting on its gate does not show Founder approval as done', async () => {
    await open('#/missions/AN-0144');
    const founder = document.querySelector<HTMLElement>('.ladder__rung[data-step="founder"]')!;
    expect(founder.dataset.state).toBe('PENDING');
  });
});

describe('explained health and connection claim', () => {
  it('health panel attributes demo health to the simulation and states every status in words', async () => {
    await open('#/');
    const panel = document.querySelector<HTMLElement>('[data-focus-id="health"]')!;
    expect(within(panel).getByTestId('health-source').textContent).toContain(
      'Simulated by the demo. No backend reported this.',
    );
    for (const li of panel.querySelectorAll<HTMLElement>('.health-list li')) {
      const status = li.dataset.status!;
      const word = {
        NOMINAL: 'Nominal',
        DEGRADED: 'Degraded',
        CRITICAL: 'Critical',
        UNKNOWN: 'Unknown',
      }[status]!;
      expect(li.textContent?.toLowerCase()).toContain(word.toLowerCase());
    }
    const gaps = [...panel.querySelectorAll<HTMLElement>('[data-not-covered]')].map(
      (x) => x.dataset.notCovered,
    );
    expect(gaps).toEqual(['frontend', 'associates', 'deployment']);
  });

  it('the header health link deep-links to the explanation', async () => {
    await open('#/missions');
    const link = document.querySelector<HTMLAnchorElement>('.topbar__health')!;
    expect(link.getAttribute('href')).toBe('#/?focus=health');
  });

  it('the situation board never presents demo health as a backend’s', async () => {
    await open('#/');
    const board = document.querySelector('.situation')!;
    expect(board.textContent).toMatch(/Simulated: (Nominal|Degraded|Critical|Unknown)/);
    expect(board.textContent).toContain('From the demo simulation. No backend.');
  });

  it('the data-quality inspector claims DEMO / SIMULATED, never CONNECTED, in demo mode', async () => {
    await open('#/quality');
    const claim = document.querySelector<HTMLElement>('[data-claim]')!;
    expect(claim.dataset.claim).toBe('DEMO_SIMULATED');
    expect(claim.textContent).toContain('Demo / simulated');
    expect(document.querySelector<HTMLElement>('[data-source-class]')!.dataset.sourceClass).toBe(
      'DEMO',
    );
  });

  it('a REST adapter is REMOTE, with REMOTE not claimed as authoritative', async () => {
    const { adapter } = restTestAdapter(createFakeBackend());
    await open('#/quality', adapter);
    await screen.findByText('Remote backend');
    expect(document.body.textContent).toContain('Remote is not the same as authoritative.');
  });
});

describe('workers are not Associates', () => {
  it('the Workers page says so', async () => {
    await open('#/workers');
    expect(screen.getByTestId('worker-not-associate').textContent).toContain(
      'A worker is not an Associate',
    );
  });

  it('worker runtime/model identity is never invented', async () => {
    await open('#/workers/w-ada');
    expect(document.body.textContent).toContain('Runtime / model');
    expect(document.body.textContent).toContain('Not reported by the data source');
  });
});

describe('missions: review-required view', () => {
  it('offers Review required and lists the mission waiting for review', async () => {
    await open('#/missions?group=review');
    expect(screen.getByRole('radio', { name: /Review required/, checked: true })).toBeTruthy();
    expect(document.body.textContent).toContain('AN-0143');
  });
});
