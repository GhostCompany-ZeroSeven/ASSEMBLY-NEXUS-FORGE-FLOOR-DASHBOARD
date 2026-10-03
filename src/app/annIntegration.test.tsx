import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnAdapter } from '@/adapters/ann/AnnAdapter';
import type { AnnFeedSource } from '@/adapters/ann/contract';
import { annMockFeed, MockAnnFeedSource, type AnnMockVariant } from '@/adapters/ann/mockFeed';
import { App } from '@/app/App';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { waitForSurface } from '@/test/render';

/**
 * Integrated path: simulated ANN v1 feed → ANN adapter → normalized snapshot →
 * the EXISTING dashboard surfaces (Command Center, Missions, mission detail,
 * Approvals, Workers), rendered truthfully.
 */

const NOW = Date.parse('2026-09-30T12:00:00Z');
const AUTH = assemblyNexusConfig.governance.humanAuthority;

afterEach(() => vi.useRealTimers());

async function open(hash: string, source: AnnFeedSource) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.location.hash = hash;
  const adapter = new AnnAdapter(source, { humanAuthority: AUTH, now: () => NOW });
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
}
const mock = (v: AnnMockVariant = 'normal') => new MockAnnFeedSource(v, AUTH, () => NOW);
const ids = () => [...document.querySelectorAll('.mission-card__id')].map((e) => e.textContent);

describe('ANN v1 feed on the dashboard', () => {
  it('Missions: source ordinals displayed; a mission without one keeps its source id', async () => {
    await open('#/missions', mock());
    expect(ids()).toEqual(
      expect.arrayContaining(['AN-0142', 'AN-0144', 'AN-0139', 'AN-0140', 'ann-msn-e410']),
    );
  });

  it('mission detail: completed but NOT certified', async () => {
    await open('#/missions/ann-msn-2b88', mock());
    await screen.findByRole('heading', { name: 'Mission timer instrumentation', level: 1 });
    const record = document.querySelector('main')!.textContent!;
    expect(record).toMatch(/Mission Complete/);
    expect(record).toMatch(/CERTIFICATION\s*PENDING/i);
    expect(record).not.toMatch(/CERTIFIED(?! )/);
  });

  it('Command Center: simulated, never live; health never lime; nothing claimed as LIVE', async () => {
    await open('#/?field=off', mock());
    expect(document.querySelector('.provenance')!.getAttribute('data-mode')).toBe('demo');
    expect(document.querySelector('.topbar__health .badge')!.getAttribute('data-tone')).not.toBe(
      'success',
    );
    for (const b of document.querySelectorAll('#health .badge'))
      expect(b.getAttribute('data-tone')).not.toBe('success');
    expect(document.querySelector('main')!.textContent).not.toMatch(/NaN|undefined|Invalid Date/);
  });

  it('Approvals: unknown risk/reversibility shown as unknown; no decision controls (read-only)', async () => {
    await open('#/approvals', mock());
    const gate = document.querySelector('[data-focus-id="ann-apr-032"]')!;
    expect(gate.getAttribute('data-risk')).toBe('unknown');
    expect(gate.querySelector('[data-reversible]')!.getAttribute('data-reversible')).toBe(
      'unknown',
    );
    expect(gate.textContent).toMatch(/not stated/i);
    expect(document.querySelectorAll('.gate-btn')).toHaveLength(0);
    // The simulated fixture decision stays visibly simulated.
    const decided = document.querySelector('[data-focus-id="ann-apr-030"]')!;
    expect(decided.getAttribute('data-status')).toBe('APPROVED');
    expect(decided.textContent).toMatch(/Simulated — no backend received this decision/);
  });

  it('Workers: an unreported role reads as unknown, an unknown state stays UNKNOWN', async () => {
    await open('#/workers', mock());
    const text = document.querySelector('main')!.textContent!;
    expect(text).toMatch(/Role not reported/);
    expect(text).toMatch(/Unregistered worker 7c2/);
  });

  it('unknown variant: approvals unavailable are UNKNOWN on the Command Center, never "nothing"', async () => {
    await open('#/?field=off', mock('unknown'));
    const founder = document.querySelector('.situation__cell')!;
    expect(founder.textContent).not.toMatch(/Nothing/);
    expect(founder.getAttribute('data-tone')).toBe('warning');
  });

  it('source failure: an error state, never an empty healthy dashboard', async () => {
    window.location.hash = '#/';
    const adapter = new AnnAdapter(
      { load: () => Promise.reject(new Error('down')) },
      { humanAuthority: AUTH, now: () => NOW },
    );
    render(<App config={assemblyNexusConfig} adapter={adapter} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/SOURCE_UNAVAILABLE/);
    expect(document.querySelector('.situation')).toBeNull();
    expect(document.querySelector('.topbar__health')).toBeNull();
  });

  it('a LIVE (unverified) source decision reads as source-asserted, never verified', async () => {
    const live = {
      ...annMockFeed('normal', NOW, AUTH),
      sourceMode: 'LIVE',
      source: { id: 'ann-runtime-x', name: 'ANN runtime', kind: 'ann-runtime' },
    };
    live.approvals[0] = { ...live.approvals[0]!, requiredAuthority: 'ROOT' as never };
    await open('#/approvals', { load: () => Promise.resolve(live) });
    // LIVE is a claim: shown as not verified (disconnected), never as live.
    expect(document.querySelector('.provenance')!.getAttribute('data-mode')).not.toBe('live');
    const decided = document.querySelector('[data-focus-id="ann-apr-030"]')!;
    expect(decided.querySelector('[data-assurance="source-asserted"]')!.textContent).toMatch(
      /not independently verified/,
    );
    expect(decided.textContent).not.toMatch(/Simulated — no backend/);
    // Feed authority text that is not the configured authority is never shown.
    const odd = document.querySelector('[data-focus-id="ann-apr-031"]')!;
    expect(odd.textContent).not.toMatch(/ROOT/);
    expect(odd.querySelector('[data-authority="not-recognised"]')).not.toBeNull();
  });
});
