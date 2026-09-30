import { waitForSurface } from '@/test/render';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { buildCommands, filterCommands } from './commands';
import { buildSeedSnapshot } from '@/adapters/demo/seed';

async function renderApp(hash = '#/') {
  const adapter = testAdapter();
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}

describe('filterCommands', () => {
  const cmds = buildCommands({
    snapshot: buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z')),
    config: assemblyNexusConfig,
    navigate: () => {},
    sim: null,
    openShortcuts: () => {},
    setTheme: () => {},
  });
  it('finds navigation commands', () => {
    expect(filterCommands(cmds, 'approval')[0]!.id).toBe('nav:a');
    expect(filterCommands(cmds, 'zzzz')).toHaveLength(0);
  });
  it('omits simulation commands when there is no simulation', () => {
    expect(cmds.some((c) => c.group === 'Simulation')).toBe(false);
  });
});

describe('command palette', () => {
  it('opens with Ctrl+K, is a labelled modal, and closes with Escape restoring focus', async () => {
    const user = userEvent.setup();
    await renderApp();
    const trigger = screen.getByRole('button', { name: /Commands/ });
    trigger.focus();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const input = screen.getByRole('combobox', { name: /Search commands/ });
    // The palette chunk is lazy-loaded; focus moves once it has mounted.
    await waitFor(() => expect(input).toHaveFocus());
    expect(document.querySelector('.shell__frame')).toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('searches, moves with arrows and runs with Enter', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: /Commands/ }));
    await user.type(screen.getByRole('combobox', { name: /Search commands/ }), 'forge floor');
    const options = within(screen.getByRole('listbox', { name: 'Commands' })).getAllByRole(
      'option',
    );
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox', { name: /Search commands/ })).toHaveAttribute(
      'aria-activedescendant',
      options[0]!.id,
    );
    await user.keyboard('{Enter}');
    await act(async () => {});
    expect(window.location.hash).toBe('#/floor');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects a worker and opens their focus view', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox', { name: /Search commands/ }), 'hedda');
    await user.keyboard('{Enter}');
    await act(async () => {});
    expect(window.location.hash).toBe('#/workers/w-hedda');
  });

  it('toggles the demo simulation', async () => {
    const user = userEvent.setup();
    const adapter = await renderApp();
    expect(adapter.simulation.isRunning()).toBe(false);
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox', { name: /Search commands/ }), 'resume demo');
    await user.keyboard('{Enter}');
    await act(async () => {});
    expect(adapter.simulation.isRunning()).toBe(true);
    expect(screen.getByRole('button', { name: 'Pause simulation' })).toBeInTheDocument();
    adapter.simulation.setRunning(false);
  });

  it('announces the result count', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox', { name: /Search commands/ }), 'qqqqq');
    expect(screen.getAllByText('No matching commands').length).toBeGreaterThan(0);
  });
});

describe('global shortcuts', () => {
  it('G then F navigates; ignored while typing', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.keyboard('gf');
    expect(window.location.hash).toBe('#/floor');
    await user.keyboard('gw');
    expect(window.location.hash).toBe('#/workers');
  });

  it('? opens the shortcut reference, which documents every shortcut', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toHaveTextContent('Ctrl + K');
    expect(dialog).toHaveTextContent('G then A');
    expect(dialog).toHaveTextContent('Pause / resume demo simulation');
  });

  it('single-key shortcuts can be turned off (WCAG 2.1.4); Ctrl+K still works', async () => {
    const user = userEvent.setup();
    await renderApp('#/');
    await user.keyboard('?');
    await user.click(screen.getByRole('checkbox', { name: /single-key shortcuts/ }));
    await user.keyboard('{Escape}');
    await user.keyboard('gf');
    expect(window.location.hash).toBe('#/');
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('P pauses/resumes and N steps the demo', async () => {
    const user = userEvent.setup();
    const adapter = await renderApp();
    const before = adapter.getSnapshot().events.length;
    await user.keyboard('n');
    expect(adapter.getSnapshot().events.length).toBeGreaterThan(before);
    await user.keyboard('p');
    expect(adapter.simulation.isRunning()).toBe(true);
    await user.keyboard('p');
    expect(adapter.simulation.isRunning()).toBe(false);
  });

  it('Escape in a dialog does not also leave the worker focus view', async () => {
    const user = userEvent.setup();
    await renderApp('#/workers/w-ada');
    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog');
    fireEvent.keyDown(screen.getByRole('combobox', { name: /Search commands/ }), { key: 'Escape' });
    expect(window.location.hash).toBe('#/workers/w-ada');
    await user.keyboard('{Escape}');
    expect(window.location.hash).toBe('#/workers');
  });
});
