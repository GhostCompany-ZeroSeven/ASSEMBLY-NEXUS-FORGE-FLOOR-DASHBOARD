import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { restTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { waitForSurface } from '@/test/render';

/**
 * Operational hardening: a backend (or a future ANN adapter) sending
 * malformed, partial or unrecognised data must never crash a surface, print
 * machine garbage, or turn the unknown into a confident green.
 */

type Row = Record<string, unknown>;
type Wire = Record<
  string,
  Row & { missions?: Row[]; workers?: Row[]; approvals?: Row[]; alerts?: Row[]; components?: Row[] }
>;
const GARBAGE = /NaN|undefined|Invalid Date|\[object Object\]|Infinity/;

function hostileBackend() {
  const backend = createFakeBackend();
  const d = backend.data as unknown as Wire;
  d.missions!.missions!.forEach((m, i) => {
    if (i % 3 === 0) m.status = 'WARP_SPEED';
    if (i % 3 === 1) m.startedAt = 'not-a-date';
    if (i % 4 === 0) m.completedAt = '2099-13-45T99:99:99Z';
    if (i % 2 === 0) m.progress = 'lots';
    if (i % 5 === 0) m.estimate = { durationMs: -100 };
    if (i % 5 === 1) m.estimate = { durationMs: 'soon' };
    if (i % 4 === 1) m.assignedWorkerIds = ['ghost-worker-404'];
    if (i % 6 === 2) m.ordinal = -7;
  });
  d.workers!.workers!.forEach((w, i) => {
    if (i % 2 === 0) w.state = 'daydreaming';
    if (i % 3 === 0) w.lastHeartbeatAt = 'yesterday-ish';
    if (i % 4 === 0) w.currentTask = { label: 42 };
  });
  d.approvals!.approvals!.forEach((a, i) => {
    a.status = i % 2 ? 'MAYBE' : a.status;
    a.risk = 'apocalyptic';
    a.requestedAt = 'whenever';
  });
  d.alerts!.alerts!.forEach((a) => {
    a.severity = 'MEH';
    a.createdAt = 'tbd';
  });
  d.health!.status = 'GREAT';
  d.health!.components!.forEach((c) => (c.status = 'SPARKLING'));
  d.health!.checkedAt = 'never';
  return backend;
}

const ROUTES = [
  '#/?field=off',
  '#/brief',
  '#/floor',
  '#/missions',
  '#/missions/AN-0144',
  '#/workers',
  '#/approvals',
  '#/alerts',
  '#/activity',
  '#/quality',
  '#/settings',
  '#/visual-floor',
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('hostile backend data', () => {
  it.each(ROUTES)('%s renders without crashing, garbage text or false green', async (route) => {
    const errors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));
    const { adapter } = restTestAdapter(hostileBackend());
    window.location.hash = route;
    render(<App config={assemblyNexusConfig} adapter={adapter} />);
    await waitForSurface();
    const main = document.querySelector('main')!;
    expect(main.textContent!.length).toBeGreaterThan(20);
    expect(main.textContent).not.toMatch(GARBAGE);
    expect(document.querySelector('.topbar')!.textContent).not.toMatch(GARBAGE);
    // An unrecognised health report is never lime anywhere.
    const top = document.querySelector('.topbar__health .badge');
    expect(top?.getAttribute('data-tone')).not.toBe('success');
    for (const b of document.querySelectorAll('#health .badge'))
      expect(b.getAttribute('data-tone')).not.toBe('success');
    expect(errors).toEqual([]);
  });

  it('keeps the malformed records visible as UNKNOWN rather than dropping them', async () => {
    const { adapter } = restTestAdapter(hostileBackend());
    window.location.hash = '#/missions';
    render(<App config={assemblyNexusConfig} adapter={adapter} />);
    await waitForSurface();
    const cards = document.querySelectorAll('.mission-card');
    expect(cards.length).toBeGreaterThanOrEqual(8);
    // A negative ordinal is not trustworthy: shown by the source id, not a number.
    const ids = [...document.querySelectorAll('.mission-card__id')].map((e) => e.textContent);
    expect(ids.every((t) => !/-\d*-7|0-7/.test(t ?? ''))).toBe(true);
  });
});
