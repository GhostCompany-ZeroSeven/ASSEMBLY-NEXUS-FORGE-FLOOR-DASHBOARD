import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardAdapter } from '@/adapters/types';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import type { DashboardConfig } from '@/config/types';
import { restTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';

/**
 * Lifetime mission numbers in the rendered app: one mission reads the same on
 * every surface, the prefix is a deployment choice (not required), demo
 * numbers stay labelled simulated, and a live mission without an ordinal is
 * never given an invented number.
 */

const publicConfig: DashboardConfig = { ...assemblyNexusConfig, missionNumbering: undefined };

async function open(
  hash: string,
  adapter: DashboardAdapter = testAdapter(),
  config: DashboardConfig = assemblyNexusConfig,
) {
  window.location.hash = hash;
  render(<App config={config} adapter={adapter} />);
  await waitForSurface();
}

const numberRow = () => screen.getByTestId('mission-number');
const cardIds = () =>
  [...document.querySelectorAll<HTMLElement>('.mission-card__id')].map((e) => e.textContent);

describe('Assembly Nexus deployment (AN- namespace, demo data)', () => {
  it('Just Completed names the mission by its number', async () => {
    await open('#/');
    const board = document.querySelector('.situation')!;
    expect(board.textContent).toContain('AN-0139');
  });

  it('the Missions list shows sequential mission numbers', async () => {
    await open('#/missions');
    expect(cardIds()).toEqual(expect.arrayContaining(['AN-0139', 'AN-0140', 'AN-0144', 'AN-0148']));
  });

  it('mission detail shows the same number, and says the sequence is a demo', async () => {
    await open('#/missions/AN-0144');
    expect(document.querySelector('.page__eyebrow')!.textContent).toBe('AN-0144');
    expect(numberRow().dataset.ordinal).toBe('144');
    expect(numberRow().textContent).toContain('AN-0144');
    expect(numberRow().textContent).toContain(
      'Demo sequence (simulated), not a live mission store.',
    );
  });

  it('a gate references its mission by the same number', async () => {
    await open('#/approvals');
    expect(screen.getAllByRole('link', { name: 'AN-0144' }).length).toBeGreaterThan(0);
  });
});

describe('public default configuration (no prefix)', () => {
  it('needs no AN- prefix: missions read 0139, 0144, …', async () => {
    await open('#/missions', testAdapter(), publicConfig);
    const ids = cardIds();
    expect(ids).toEqual(expect.arrayContaining(['0139', '0144', '0148']));
    expect(ids.some((x) => x?.startsWith('AN-'))).toBe(false);
  });

  it('mission detail shows the bare 4-digit number', async () => {
    await open('#/missions/AN-0144', testAdapter(), publicConfig);
    expect(document.querySelector('.page__eyebrow')!.textContent).toBe('0144');
    expect(numberRow().textContent).toContain('0144');
  });
});

describe('live source (REST)', () => {
  it('shows the ordinal the backend reports', async () => {
    const { adapter } = restTestAdapter(createFakeBackend());
    await open('#/missions/AN-0144', adapter);
    await screen.findByRole('heading', { name: 'Credential rotation runbook', level: 1 });
    expect(numberRow().dataset.ordinal).toBe('144');
    expect(numberRow().textContent).toContain(
      'Lifetime creation order, assigned once by the mission store.',
    );
  });

  it('a mission without an ordinal has an UNKNOWN number and keeps its own id', async () => {
    const backend = createFakeBackend();
    const missions = (backend.data.missions as { missions: Record<string, unknown>[] }).missions;
    for (const m of missions) delete m.ordinal;
    const { adapter } = restTestAdapter(backend);
    await open('#/missions/AN-0144', adapter);
    await screen.findByRole('heading', { name: 'Credential rotation runbook', level: 1 });
    expect(numberRow().dataset.ordinal).toBe('unknown');
    expect(numberRow().textContent).toContain('Unknown: not reported by the data source');
    // Shown by the backend's own identifier, never by a position or a count.
    expect(document.querySelector('.page__eyebrow')!.textContent).toBe('AN-0144');
  });
});
