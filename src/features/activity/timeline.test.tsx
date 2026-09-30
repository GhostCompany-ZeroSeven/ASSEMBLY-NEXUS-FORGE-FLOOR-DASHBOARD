import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

async function renderAt(hash: string) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
  await waitForSurface();
}

describe('operations timeline', () => {
  it('shows the linked record\'s CURRENT state, labelled "Now", separately from the event', async () => {
    await renderAt('#/activity?mission=AN-0142');
    const stream = screen.getByRole('list', { name: 'Activity stream' });
    const now = within(stream).getAllByText(/^Now:/);
    expect(now.length).toBeGreaterThan(0);
    expect(now[0]).toHaveAttribute('title', expect.stringMatching(/not the state when/));
  });

  it('range and ingest-path filters live in the URL; unknown values fall back safely', async () => {
    await renderAt('#/activity?range=15m&via=poll');
    expect(screen.getByRole('combobox', { name: 'Time range' })).toHaveValue('15m');
    expect(screen.getByRole('combobox', { name: 'Received via' })).toHaveValue('poll');
    // Demo events are simulated, so filtering by REST polling shows none (not fake ones).
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });

  it('corrupt URL params are ignored, not trusted', async () => {
    await renderAt('#/activity?range=forever&via=backdoor&details=maybe');
    expect(screen.getByRole('combobox', { name: 'Time range' })).toHaveValue('all');
    expect(screen.getByRole('combobox', { name: 'Received via' })).toHaveValue('all');
  });

  it('"Since my last view" without a recorded view says so instead of guessing', async () => {
    await renderAt('#/activity?range=last-view');
    expect(screen.getByText(/cannot be applied/)).toBeInTheDocument();
  });

  it('arrival details show when events were received, and retained history is stated', async () => {
    await renderAt('#/activity?details=1');
    expect(screen.getAllByText(/^received \d\d:\d\d:\d\d$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Retained history starts at/)).toBeInTheDocument();
  });
});

describe('cross-surface context (real relationships only)', () => {
  it('mission and worker timelines link to the filtered operations timeline', async () => {
    await renderAt('#/missions/AN-0142');
    const hrefs = screen
      .getAllByRole('link', { name: /Open in timeline/ })
      .map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('#/activity?mission=AN-0142');
  });

  it('worker focus links to its timeline', async () => {
    await renderAt('#/workers/w-cyrus');
    const hrefs = screen
      .getAllByRole('link', { name: /Open in timeline/ })
      .map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('#/activity?worker=w-cyrus');
  });

  it('an approval gate lists only alerts that explicitly name it', async () => {
    await renderAt('#/approvals');
    const gate = document.querySelector<HTMLElement>('[data-focus-id="APR-031"]')!;
    const link = within(gate).getByRole('link', { name: 'Approval waiting at the Founder Gate' });
    expect(link).toHaveAttribute('href', '#/alerts?focus=ALR-008');
    expect(within(gate).queryByRole('link', { name: /Telemetry/ })).toBeNull();
  });
});
