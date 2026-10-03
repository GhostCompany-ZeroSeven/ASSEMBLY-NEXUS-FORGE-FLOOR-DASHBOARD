import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

/**
 * No surface shows simulated health as real-looking lime. The demo reports
 * several components as NOMINAL: they are a simulation's claims, so they wear
 * simulated amber, and nothing anywhere is a "success" badge for health.
 */
describe('simulated health is never lime', () => {
  it('Command Center health panel, its components and the top bar', async () => {
    window.location.hash = '#/?field=off';
    render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
    await waitForSurface();
    const panel = document.querySelector('#health')!;
    expect(panel.getAttribute('data-family')).toBe('systems');
    const nominal = [...panel.querySelectorAll('li[data-status="NOMINAL"] .badge')];
    expect(nominal.length).toBeGreaterThan(0);
    for (const b of nominal) expect(b.getAttribute('data-tone')).toBe('warning');
    const top = document.querySelector('.topbar__health .badge')!;
    expect(top.getAttribute('data-tone')).not.toBe('success');
    for (const b of document.querySelectorAll('.badge[data-tone="success"]'))
      expect(b.closest('#health, .topbar__health')).toBeNull();
  });

  it('the "Needs Founder" cell is never a lime all-clear', async () => {
    window.location.hash = '#/?field=off';
    render(<App config={assemblyNexusConfig} adapter={testAdapter()} />);
    await waitForSurface();
    const cells = [...document.querySelectorAll('.situation__cell')];
    expect(cells[0]!.getAttribute('data-tone')).not.toBe('success');
    // Only the "just completed" answer may be lime, and only with a completed mission.
    const lime = cells.filter((c) => c.getAttribute('data-tone') === 'success');
    expect(lime.length).toBeLessThanOrEqual(1);
    if (lime.length) expect(lime[0]!.textContent).toMatch(/AN-\d{4,}/);
  });
});
