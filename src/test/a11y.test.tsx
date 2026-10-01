import { waitForSurface } from '@/test/render';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { restTestAdapter } from './adapters';
import { createFakeBackend } from './fakeBackend';
import { testAdapter } from './fixtures';
import userEvent from '@testing-library/user-event';

/**
 * Structural accessibility audit (axe-core in jsdom). jsdom has no layout, so
 * colour contrast and similar visual rules are checked in the Playwright suite
 * (e2e/a11y.spec.ts) instead.
 */
async function audit(): Promise<axe.Result[]> {
  const res = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return res.violations;
}

function format(v: axe.Result[]): string {
  return v
    .map(
      (x) =>
        `${x.id}: ${x.help}\n  ${x.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 5)
          .join('\n  ')}`,
    )
    .join('\n');
}

const ROUTES = [
  '#/',
  '#/floor',
  '#/missions',
  '#/missions/AN-0139',
  '#/missions/AN-0144',
  '#/workers',
  '#/workers/w-cyrus',
  '#/approvals',
  '#/alerts',
  '#/activity',
  '#/settings',
  '#/visual-floor',
  '#/visual-floor?preview=red-alert',
  '#/visual-floor?station=sci-1',
];

describe('axe structural audit (demo adapter)', () => {
  for (const hash of ROUTES) {
    it(`${hash} has no violations`, async () => {
      window.location.hash = hash;
      render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
      await waitForSurface();
      const v = await audit();
      expect(v, format(v)).toHaveLength(0);
    });
  }

  it('Red Alert state has no violations', async () => {
    const adapter = testAdapter();
    window.location.hash = '#/alerts';
    render(<App config={assemblyNexusConfig} adapter={adapter} />);
    await waitForSurface();
    const { act } = await import('@testing-library/react');
    act(() => {
      for (let i = 0; i < 8; i++) adapter.step();
    });
    await screen.findByText('RED ALERT');
    const v = await audit();
    expect(v, format(v)).toHaveLength(0);
  });

  it('approval confirmation step has no violations', async () => {
    window.location.hash = '#/approvals';
    render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
    const gate = await screen.findByRole('group', { name: 'Decide APR-031' });
    await userEvent.click(gate.querySelector('.gate-btn--deny')!);
    const v = await audit();
    expect(v, format(v)).toHaveLength(0);
  });

  it('command palette and shortcuts dialogs have no violations', async () => {
    window.location.hash = '#/';
    render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
    await waitForSurface();
    await userEvent.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog');
    await userEvent.type(screen.getByRole('combobox', { name: /Search commands/ }), 'a');
    let v = await audit();
    expect(v, format(v)).toHaveLength(0);
    await userEvent.keyboard('{Escape}?');
    await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    v = await audit();
    expect(v, format(v)).toHaveLength(0);
  });
});

describe('axe structural audit (failure states)', () => {
  it('disconnected backend has no violations', async () => {
    const b = createFakeBackend();
    for (const k of ['health', 'workers', 'missions', 'approvals', 'alerts', 'events'] as const)
      b.failures[k] = 'down';
    window.location.hash = '#/';
    render(<App config={assemblyNexusConfig} adapter={restTestAdapter(b).adapter} />);
    await screen.findByText('Data source unavailable');
    const v = await audit();
    expect(v, format(v)).toHaveLength(0);
  });
});
