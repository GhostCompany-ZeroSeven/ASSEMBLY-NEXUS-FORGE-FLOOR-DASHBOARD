import { waitForSurface } from '@/test/render';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { OPENING_SCRIPT } from '@/adapters/demo/script';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { App } from './App';

async function renderAt(hash: string, adapter = testAdapter()) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}

describe('App', () => {
  it('labels demo data as simulated and never as live', async () => {
    await renderAt('#/');
    expect(screen.getByText('DEMO · SIMULATED')).toBeInTheDocument();
    expect(screen.getByText(/LOCAL DEMO DATA/)).toBeInTheDocument();
    expect(screen.queryByText(/^LIVE$/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument();
  });

  it('shows the full branding hierarchy verbatim', async () => {
    await renderAt('#/');
    const list = screen.getByRole('list', { name: 'Identity hierarchy' });
    for (const line of assemblyNexusConfig.branding.hierarchy) {
      expect(within(list).getByText(line)).toBeInTheDocument();
    }
  });

  it('requires confirmation before approving, then records a simulated decision', async () => {
    const user = userEvent.setup();
    const adapter = await renderAt('#/approvals');
    const gate = screen.getByRole('group', { name: 'Decide APR-031' });
    await user.click(within(gate).getByRole('button', { name: /approve/i }));
    // Nothing decided yet — confirmation step shown.
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm Approve' }));
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe(
      'APPROVED',
    );
    expect(
      await screen.findAllByText(/Simulated — no backend received this decision/),
    ).not.toHaveLength(0);
  });

  it('requires a note to deny', async () => {
    const user = userEvent.setup();
    const adapter = await renderAt('#/approvals');
    await user.click(
      within(screen.getByRole('group', { name: 'Decide APR-031' })).getByRole('button', {
        name: /deny/i,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm Deny' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/note is required/i);
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
    await user.type(screen.getByLabelText(/Note \(required\)/), 'Not during release week');
    await user.click(screen.getByRole('button', { name: 'Confirm Deny' }));
    const decided = adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!;
    expect(decided.status).toBe('DENIED');
    expect(decided.decision?.note).toBe('Not during release week');
  });

  it('enters Red Alert on a critical alert and leaves it once acknowledged', async () => {
    const user = userEvent.setup();
    const adapter = await renderAt('#/alerts');
    const criticalStep = OPENING_SCRIPT.findIndex((beat) =>
      beat({ snapshot: adapter.getSnapshot(), at: '', rng: () => 0, nextId: (p) => p }).some(
        (d) => d.kind === 'alert.raised' && d.payload.alert.severity === 'CRITICAL',
      ),
    );
    act(() => {
      for (let i = 0; i <= criticalStep; i++) adapter.step();
    });
    const banner = await screen.findByText('RED ALERT');
    expect(banner.closest('.shell')).toHaveAttribute('data-red-alert', 'true');
    expect(screen.getAllByText('Human action required').length).toBeGreaterThan(0);

    const card = screen
      .getByRole('heading', { name: 'Certification sandbox integrity check failed' })
      .closest('article')!;
    await user.click(within(card).getByRole('button', { name: /acknowledge/i }));
    expect(screen.queryByText('RED ALERT')).not.toBeInTheDocument();
  });

  it('renders the Forge Floor with every worker as a selectable token', async () => {
    const user = userEvent.setup();
    const adapter = await renderAt('#/floor');
    const floor = screen.getByRole('group', { name: 'Forge Floor plan' });
    const tokens = within(floor)
      .getAllByRole('button')
      .filter((b) => b.classList.contains('token'));
    expect(tokens).toHaveLength(adapter.getSnapshot().workers.length);
    await user.click(within(floor).getByRole('button', { name: /^Cyrus Anvil/ }));
    expect(screen.getByRole('heading', { name: 'Cyrus Anvil' })).toBeInTheDocument();
  });

  it('opens the worker focus view with capability and authority kept separate', async () => {
    await renderAt('#/workers/w-cyrus');
    expect(screen.getByRole('heading', { level: 1, name: 'Cyrus Anvil' })).toBeInTheDocument();
    expect(screen.getAllByText('None granted').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inspect secret metadata').length).toBeGreaterThan(0);
    expect(screen.getByText(/not delivered to any agent/)).toBeInTheDocument();
  });

  it('shows MISSION COMPLETE results for a completed mission', async () => {
    await renderAt('#/missions/AN-0139');
    expect(screen.getByRole('heading', { name: 'MISSION COMPLETE' })).toBeInTheDocument();
    expect(screen.getByText('Enable flag on the Forge Floor dashboard.')).toBeInTheDocument();
  });

  it('shows NO ESTIMATE rather than inventing remaining time', async () => {
    await renderAt('#/missions/AN-0144');
    expect(screen.getByText('NO ESTIMATE PROVIDED')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Time remaining' })).toHaveTextContent(
      'not available',
    );
  });

  it('marks outgoing worker messages as not delivered', async () => {
    const user = userEvent.setup();
    await renderAt('#/workers/w-ada');
    await user.type(screen.getByLabelText('Message Ada Sprocket'), 'How close are we?');
    await user.click(screen.getByRole('button', { name: /send/i }));
    const log = screen.getByRole('list', { name: 'Conversation with Ada Sprocket' });
    expect(await within(log).findByText('How close are we?')).toBeInTheDocument();
    expect(screen.getByText('Not delivered — demo')).toBeInTheDocument();
  });

  it('renders every route without crashing', async () => {
    for (const hash of [
      '#/',
      '#/floor',
      '#/missions',
      '#/workers',
      '#/approvals',
      '#/alerts',
      '#/activity',
      '#/settings',
      '#/nope',
    ]) {
      window.location.hash = hash;
      const { unmount } = render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
      await waitForSurface();
      unmount();
    }
  });
});
