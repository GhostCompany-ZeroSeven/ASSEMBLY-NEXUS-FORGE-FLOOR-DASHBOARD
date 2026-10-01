import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

async function open(hash = '#/visual-floor') {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
  await waitForSurface();
  return document.querySelector<HTMLElement>('.vf')!;
}

describe('Visual Forge Floor page', () => {
  it('shows provenance, firewall, the three boards and the scene as decoration', async () => {
    const root = await open();
    expect(screen.getByText('VISUAL PREVIEW · DEMO DATA')).toBeTruthy();
    expect(root.textContent).toContain('no Assembly Nexus connection exists in this build');
    for (const name of ['Current mission', 'Alerts board', 'System status'])
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    expect(root.getAttribute('data-source')).toBe('data');
    const svg = root.querySelector('.vf__art svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.vf__art')!.getAttribute('translate')).toBe('no');
  });

  it('states UNKNOWN for ANN and memory and BLOCKED for deployment, in text', async () => {
    const root = await open();
    const sys = root.querySelector<HTMLElement>('.vf__hud--systems')!;
    expect(sys.textContent).toMatch(/ANN\s*UNKNOWN|ANN.*UNKNOWN/);
    expect(sys.textContent).toContain('not connected in this build');
    expect(sys.textContent).toContain('not authorized');
    expect(sys.textContent).not.toMatch(/ANN\s*ONLINE/);
    // TEST stage is never guessed.
    expect(
      root.querySelector('.vf__flow-list [data-stage="test"]')!.getAttribute('data-status'),
    ).toBe('unknown');
  });

  it('renders every preset with a preset label, and red alert as an alert', async () => {
    for (const [preset, mode] of [
      ['countdown', 'countdown'],
      ['countdown-critical', 'countdown'],
      ['accomplished', 'accomplished'],
      ['red-alert', 'red-alert'],
    ] as const) {
      const root = await open(`#/visual-floor?preview=${preset}`);
      expect(root.getAttribute('data-mode')).toBe(mode);
      expect(root.getAttribute('data-source')).toBe('preset');
      expect(screen.getByText('PREVIEW PRESET · NOT FROM DATA')).toBeTruthy();
      if (preset === 'accomplished') expect(root.textContent).toContain('MISSION ACCOMPLISHED');
      if (preset === 'red-alert')
        expect(screen.getByRole('alert').textContent).toContain('RED ALERT · PREVIEW PRESET');
      if (preset === 'countdown-critical')
        expect(root.querySelector('.vf__hud--mission')!.getAttribute('data-critical')).toBe('true');
      document.body.innerHTML = '';
    }
  });

  it('offers no decision, dispatch or deploy controls', async () => {
    const root = await open('#/visual-floor?preview=red-alert');
    for (const b of within(root).getAllByRole('button'))
      expect(b.textContent + ' ' + (b.getAttribute('aria-label') ?? '')).not.toMatch(
        /\b(approve|deny|certify|deploy|dispatch|acknowledge)\b/i,
      );
  });

  it('character hotspots are keyboard buttons that open and close details', async () => {
    const user = userEvent.setup();
    const root = await open();
    const spots = root.querySelectorAll<HTMLButtonElement>('.vf__hotspot');
    expect(spots.length).toBeGreaterThan(8);
    // Phase 11: every hotspot is decorative; Crown-Top desks carry role labels.
    expect([...spots].every((b) => b.dataset.bound === 'false')).toBe(true);
    const desk = root.querySelector<HTMLButtonElement>('.vf__hotspot[data-station="sci-1"]')!;
    expect(desk.getAttribute('aria-label')).toBe(
      'Crown-Top Scientist · BUILD station: decorative, not bound to data',
    );
    desk.focus();
    await user.keyboard('{Enter}');
    const detail = await screen.findByRole('heading', { name: 'Details' });
    expect(document.activeElement).toBe(detail);
    await user.keyboard('{Escape}');
    expect(document.querySelector('.vf__detail')).toBeNull();
    const deco = [...spots].find((b) => b.dataset.bound === 'false')!;
    expect(deco.getAttribute('aria-label')).toContain('decorative, not bound to data');
  });

  it('the Forge Floor page links to the preview; the operational floor stays', async () => {
    await open('#/floor');
    const link = screen.getByRole('link', { name: /Visual Forge Floor/ });
    expect(link.getAttribute('href')).toBe('#/visual-floor');
    expect(document.querySelector('[data-surface="ready"]')).toBeTruthy();
  });
});
