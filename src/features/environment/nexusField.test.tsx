import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import type { DashboardConfig } from '@/config/types';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

/**
 * Nexus ambient dot field gating (C5 mechanism): part of the Nexus Signature
 * presentation for a deployment that enables it, Command Center only, never
 * shown by a deployment without it, decorative only.
 */

const publicConfig: DashboardConfig = { ...assemblyNexusConfig, environment: undefined };

async function open(hash: string, config: DashboardConfig = assemblyNexusConfig) {
  window.location.hash = hash;
  const r = render(<App config={config} adapter={testAdapter()} />);
  await waitForSurface();
  return r;
}
const canvas = () => document.querySelector<HTMLCanvasElement>('canvas.nx-field');

beforeEach(() => {
  // jsdom has no 2D canvas; the field must cope with that (draws nothing).
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Nexus ambient dot field', () => {
  it('is ON by default for Assembly Nexus: behind the page and hidden from assistive tech', async () => {
    await open('#/');
    await waitFor(() => expect(canvas()).not.toBeNull());
    const c = canvas()!;
    expect(c.getAttribute('aria-hidden')).toBe('true');
    expect(c.hasAttribute('tabindex')).toBe(false);
    expect(c.dataset.fieldMode).toBe('full');
    expect(c.textContent).toBe('');
    const reticle = document.querySelector('.nx-reticle')!;
    expect(reticle.getAttribute('aria-hidden')).toBe('true');
    expect(reticle.getAttribute('data-visible')).toBe('false');
  });

  it('the viewer can turn it off with ?field=off (the dashboard is complete without it)', async () => {
    await open('#/?field=off');
    expect(canvas()).toBeNull();
    expect(document.querySelector('.page--field')).toBeNull();
    expect(document.querySelector('.nx-reticle')).toBeNull();
  });

  it('is Command Center only: other routes ignore the toggle', async () => {
    for (const route of [
      '#/missions',
      '#/missions?field=full',
      '#/approvals?field=full',
      '#/settings',
    ]) {
      const r = await open(route);
      expect(canvas(), route).toBeNull();
      r.unmount();
    }
  });

  it('stays out of Dashboard Core: not a feature flag, so Settings lists nothing new', () => {
    expect(Object.keys(assemblyNexusConfig.features).sort()).toEqual(
      ['alerts', 'approvals', 'forgeFloor', 'redAlertMode', 'workerMessaging'].sort(),
    );
    expect(assemblyNexusConfig.environment).toEqual({ ambientField: true });
  });

  it('a public deployment without the feature never shows the field', async () => {
    await open('#/', publicConfig);
    expect(canvas()).toBeNull();
    const r = document.querySelector('main');
    expect(r?.querySelector('.page--field')).toBeNull();
  });

  it('a reduced-motion preference turns FULL into REDUCED', async () => {
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ motion: 'reduced' }));
    await open('#/');
    await waitFor(() => expect(canvas()?.dataset.fieldMode).toBe('reduced'));
  });

  it('changes no operational content: the page text is identical with the field on', async () => {
    // Freeze the wall clock (only Date) so live timers read the same in both renders.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const off = await open('#/?field=off');
    const text = document.querySelector('main')!.textContent;
    off.unmount();
    await open('#/');
    await waitFor(() => expect(canvas()).not.toBeNull());
    expect(document.querySelector('main')!.textContent).toBe(text);
  });
});
