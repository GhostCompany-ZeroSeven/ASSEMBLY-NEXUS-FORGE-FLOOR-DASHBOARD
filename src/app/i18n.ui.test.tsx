import { waitForSurface } from '@/test/render';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { testAdapter } from '@/test/fixtures';
import { App } from './App';

async function renderAt(hash: string, adapter = testAdapter()) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}

const STORAGE = 'forge-floor:preferences';

describe('localization in the running app', () => {
  it('defaults to English and sets <html lang>', async () => {
    await renderAt('#/');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('link', { name: /Missions/ })).toBeInTheDocument();
  });

  it('switching language re-renders in place: no reload, no reconnect, URL and data kept', async () => {
    const user = userEvent.setup();
    const adapter = testAdapter();
    const connect = vi.spyOn(adapter, 'connect');
    await renderAt('#/settings', adapter);
    const before = adapter.getSnapshot();
    await user.selectOptions(screen.getByLabelText('Language'), 'es');

    // The Spanish catalog is a lazy chunk; the switch completes when it arrives.
    expect(await screen.findByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/settings');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(adapter.getSnapshot()).toBe(before); // same snapshot object: nothing reloaded
    expect(JSON.parse(localStorage.getItem(STORAGE)!).locale).toBe('es');
  });

  it('a stored, invalid locale fails safe to automatic (English here)', async () => {
    localStorage.setItem(STORAGE, JSON.stringify({ locale: 'klingon' }));
    await renderAt('#/');
    expect(document.documentElement.lang).toBe('en');
  });

  it('a stored Spanish preference is restored on load', async () => {
    localStorage.setItem(STORAGE, JSON.stringify({ locale: 'es' }));
    await renderAt('#/missions');
    expect(await screen.findByRole('heading', { level: 1, name: 'Misiones' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    // Identifiers are never translated.
    expect(screen.getAllByText('AN-0144').length).toBeGreaterThan(0);
  });
});
