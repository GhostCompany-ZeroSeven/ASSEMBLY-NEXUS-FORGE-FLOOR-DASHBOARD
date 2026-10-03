import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { restTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { waitForSurface } from '@/test/render';

/**
 * Compatibility protection only (not approval of the mission-sequence
 * candidate): Nexus Signature surfaces render reported ordinals of any width
 * without truncation, rollover or padding beyond the minimum.
 */
const ORDINALS = [0, 1, 139, 9999, 10000, 123456];

function backendWithOrdinals() {
  const backend = createFakeBackend();
  const missions = (backend.data.missions as { missions: Record<string, unknown>[] }).missions;
  // Unique ordinals (a duplicate is UNKNOWN by contract): the widths under test
  // first, then distinct higher numbers for any further missions.
  missions.forEach((m, i) => (m.ordinal = ORDINALS[i] ?? 200_000 + i));
  return { backend, count: Math.min(missions.length, ORDINALS.length) };
}

async function open(hash: string) {
  const { backend, count } = backendWithOrdinals();
  const { adapter } = restTestAdapter(backend);
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return count;
}

describe('mission ordinals of any width on Nexus Signature surfaces', () => {
  it('Missions list: 0000, 0001, 0139, 9999, 10000, 123456 exactly', async () => {
    const count = await open('#/missions');
    const ids = [...document.querySelectorAll('.mission-card__id')].map((e) => e.textContent);
    const expected = ['AN-0000', 'AN-0001', 'AN-0139', 'AN-9999', 'AN-10000', 'AN-123456'];
    for (const label of expected.slice(0, count)) expect(ids).toContain(label);
    // No rollover or truncation: exactly one mission reads 0000.
    expect(ids.filter((t) => t === 'AN-0000')).toHaveLength(1);
    expect(ids).not.toContain('AN-3456');
  });

  it('Command Center renders long ordinals without breaking the panel frame', async () => {
    await open('#/?field=off');
    const text = document.querySelector('main')!.textContent!;
    expect(text).not.toMatch(/NaN|undefined|Invalid Date/);
    for (const p of document.querySelectorAll('.panel'))
      expect(p.getAttribute('data-family')).toMatch(
        /^(ops|floor|signal|review|systems|founder|neutral)$/,
      );
  });
});
