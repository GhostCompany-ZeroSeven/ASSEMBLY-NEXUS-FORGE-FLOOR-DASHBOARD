/**
 * Phase 8 governance: contract conformance never inflates authority or truth.
 *
 * - No profile is, or can become at runtime, a Founder-approved contract.
 * - The Assembly Nexus placeholder assumes nothing (UNKNOWN / UNSPECIFIED).
 * - The profile is declared by the build, never by backend data.
 * - Contract uncertainty never inflates event coverage (never EXACT).
 * - The inspector states, observes and separates; it decides nothing.
 * - The runner is not in the application render path and has no decision path.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RestAdapter } from '@/adapters/rest/RestAdapter';
import type { DashboardAdapter } from '@/adapters/types';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { withEnvOverrides } from '@/config/runtime';
import {
  activeProfile,
  DECLARABLE_PROFILES,
  historyAssured,
  MOCK_PROFILE,
  REAL_ANN_PLACEHOLDER_PROFILE,
  SIMULATED_PROFILE,
  UNDECLARED_PROFILE,
} from '@/domain/contract/profiles';
import { RULE_IDS, RULES } from '@/domain/contract/rules';
import { createCheckpoint } from '@/domain/checkpoint';
import { computeDigest } from '@/domain/digest';
import { computeMissionDigest, createMissionCheckpoint } from '@/domain/missionView';
import { createFakeBackend, BASE } from '@/test/fakeBackend';
import { waitForSurface } from '@/test/render';
import { App } from './App';

const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const appFiles = () =>
  files('src').filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith(join('src', 'test')),
  );

function rest(contractProfile?: string, env = 'mock') {
  const backend = createFakeBackend();
  (backend.data.health as Record<string, unknown>).environment = env;
  const clock = { now: Date.parse('2026-09-30T12:00:00.000Z') };
  const adapter = new RestAdapter(
    { baseUrl: BASE, label: 'Governance REST', pollIntervalMs: 5000, contractProfile },
    {
      fetch: backend.fetch,
      now: () => clock.now,
      createTransport: () => ({ start: () => undefined, stop: () => undefined }),
    },
  );
  return { adapter, backend, clock };
}

async function renderQuality(adapter: DashboardAdapter) {
  window.location.hash = '#/quality';
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return screen.getByRole('region', { name: 'Adapter contract' });
}

describe('profiles: no Founder approval exists or can be claimed', () => {
  const all = [MOCK_PROFILE, REAL_ANN_PLACEHOLDER_PROFILE, UNDECLARED_PROFILE, SIMULATED_PROFILE];

  it('no profile carries Founder approval or the approved-contract provenance', () => {
    for (const p of all) {
      expect(p.founderApproved).toBe(false);
      expect(p.provenance).not.toBe('FOUNDER_APPROVED_CONTRACT');
    }
    expect(Object.keys(DECLARABLE_PROFILES)).toEqual(['mock']);
  });

  it('the mock profile is MOCK with mock provenance, never presented as Assembly Nexus', () => {
    expect(MOCK_PROFILE.kind).toBe('MOCK');
    expect(MOCK_PROFILE.provenance).toBe('MOCK_PROFILE');
    expect(MOCK_PROFILE.id).not.toMatch(/nexus|ann|prod/i);
  });

  it('the Assembly Nexus placeholder assumes nothing: UNKNOWN / UNSPECIFIED only', () => {
    const p = REAL_ANN_PLACEHOLDER_PROFILE;
    for (const id of RULE_IDS) {
      const c = p.clauses[id];
      if (RULES[id].kind === 'source-property') expect(c.guarantee, id).toBe('UNKNOWN');
      else expect(c.guarantee, id).toBe('NOT_APPLICABLE');
      if (c.capability) expect(c.capability, id).toBe('UNKNOWN');
      expect(c.note, id).toBeUndefined();
    }
    expect(p.transport).toEqual({
      endpoints: 'UNSPECIFIED',
      stream: 'UNSPECIFIED',
      authentication: 'UNSPECIFIED',
    });
    expect(JSON.stringify(p)).not.toMatch(/https?:|token|secret|password|api[_-]?key|bearer/i);
    expect(DECLARABLE_PROFILES).not.toHaveProperty(p.id);
  });
});

describe('the profile is declared by the build, never by backend data', () => {
  it('a backend reporting environment "mock" does not select the mock profile', async () => {
    const { adapter } = rest(undefined, 'mock');
    await adapter.connect();
    expect(activeProfile(adapter.getSnapshot().provenance).kind).toBe('UNDECLARED');
  });

  it('an unknown or hostile profile id is UNDECLARED (or refused by config)', () => {
    expect(activeProfile({ mode: 'live', contractProfile: 'assembly-nexus' }).kind).toBe(
      'UNDECLARED',
    );
    expect(activeProfile({ mode: 'live', contractProfile: '__proto__' }).kind).toBe('UNDECLARED');
    expect(activeProfile({ mode: 'live', contractProfile: 'constructor' }).kind).toBe('UNDECLARED');
    expect(() => rest('Mock; drop')).toThrow(/contractProfile/);
  });

  it('only the build env sets it, and normalization never reads it from payloads', () => {
    const c = withEnvOverrides(assemblyNexusConfig, {
      VITE_FORGE_ADAPTER: 'rest',
      VITE_FORGE_REST_BASE_URL: '/api',
      VITE_FORGE_CONTRACT_PROFILE: 'mock',
    });
    expect(c.adapter.kind === 'rest' && c.adapter.rest.contractProfile).toBe('mock');
    for (const f of ['src/adapters/rest/normalize.ts', 'src/adapters/rest/stream.ts'])
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/contractProfile/);
  });
});

describe('contract uncertainty never inflates event coverage', () => {
  it('undeclared REST: the checkpoint event is retained, yet coverage is not EXACT', async () => {
    const { adapter, backend, clock } = rest(undefined);
    await adapter.connect();
    const cp = createCheckpoint(adapter.getSnapshot(), new Date(clock.now).toISOString());
    (backend.data.events as { events: unknown[] }).events.push({
      id: 'new-1',
      kind: 'task.completed',
      at: new Date(clock.now + 1000).toISOString(),
      missionId: 'AN-0142',
      payload: { taskId: 't' },
    });
    clock.now += 5000;
    await adapter.refresh();
    const s = adapter.getSnapshot();
    expect(historyAssured(s.provenance)).toBe(false);
    const d = computeDigest(s, cp);
    expect(d.eventCoverage).toBe('lower-bound');
    expect(d.counts.events ?? null).toBeNull();
  });

  it('mock-declared REST: the same evidence is EXACT', async () => {
    const { adapter, backend, clock } = rest('mock');
    await adapter.connect();
    const cp = createCheckpoint(adapter.getSnapshot(), new Date(clock.now).toISOString());
    (backend.data.events as { events: unknown[] }).events.push({
      id: 'new-1',
      kind: 'task.completed',
      at: new Date(clock.now + 1000).toISOString(),
      missionId: 'AN-0142',
      payload: { taskId: 't' },
    });
    clock.now += 5000;
    await adapter.refresh();
    const d = computeDigest(adapter.getSnapshot(), cp);
    expect(d.eventCoverage).toBe('exact');
    expect(d.counts.events).toBe(1);
  });

  it('mission digest: undeclared never EXACT, reason names the contract', async () => {
    const { adapter, clock } = rest(undefined);
    await adapter.connect();
    const s = adapter.getSnapshot();
    const f = { source: 'LIVE' as const, qualifiers: [] };
    const cp = createMissionCheckpoint(s, 'AN-0142', f, new Date(clock.now).toISOString());
    const d = computeMissionDigest(s, 'AN-0142', cp, f);
    expect(d.events.state).not.toBe('exact');
    expect(d.events.reason).toBe('contract-unassured');
    expect(d.unknown.events).toBe('contract-unassured');
    expect(d.changed).not.toBe(false); // never "nothing changed" on unassured history
  });
});

describe('inspector: states, observes and separates; decides nothing', () => {
  it('undeclared REST backend: NO PROFILE DECLARED, not approved, exact coverage not allowed', async () => {
    const { adapter } = rest(undefined);
    const panel = await renderQuality(adapter);
    expect(within(panel).getByText('NO PROFILE DECLARED')).toBeInTheDocument();
    expect(panel.querySelector('[data-founder-approved="false"]')).not.toBeNull();
    expect(panel.querySelector('[data-history-assured="false"]')).not.toBeNull();
    expect(panel.querySelectorAll('[data-rule]')).toHaveLength(RULE_IDS.length);
    expect(panel.querySelectorAll('[data-guarantee="GUARANTEED"]')).toHaveLength(0);
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(panel.textContent).not.toMatch(/\d+\s?%|\bscore\b|certified|trust/i);
    // The only mention of Founder approval is the explicit "not approved" statement.
    expect(panel.querySelector('[data-founder-approved="false"]')!.textContent).toMatch(
      /^not approved/,
    );
    expect(panel.textContent!.match(/approved by the Founder/g)).toHaveLength(1); // only inside "not approved: …"
  });

  it('mock-declared: MOCK PROFILE, stated as not Assembly Nexus; environment shown as reported', async () => {
    const { adapter } = rest('mock', 'mock');
    const panel = await renderQuality(adapter);
    expect(within(panel).getByText('MOCK PROFILE')).toBeInTheDocument();
    expect(panel.textContent).toMatch(/not the Assembly Nexus contract/);
    expect(panel.querySelector('[data-provenance="MOCK_PROFILE"]')).not.toBeNull();
    expect(panel.querySelector('[data-environment="mock"]')).not.toBeNull();
    expect(panel.textContent).toMatch(/open Founder decision/);
    // "None seen" is never presented as a pass.
    expect(panel.textContent).toMatch(/none seen \(this is not a pass\)/);
  });

  it('the badge keeps the Phase 7 display (LIVE + environment tag) pending the Founder decision', async () => {
    const { adapter } = rest('mock', 'mock');
    await renderQuality(adapter);
    const badge = document.querySelector('.provenance')!;
    expect(badge.querySelector('.provenance__mode')!.textContent).toBe('LIVE');
    expect(badge.querySelector('.provenance__env')!.textContent).toBe('MOCK');
  });
});

describe('static guards', () => {
  it('the conformance runner is not imported by any application module (not in the render path)', () => {
    const hits = appFiles().filter(
      (f) =>
        !f.includes(join('domain', 'contract')) &&
        /contract\/(runner|report)/.test(readFileSync(f, 'utf8')),
    );
    expect(hits).toEqual([]);
  });

  it('contract modules and the panel have no network, decision, messaging or code-loading path', () => {
    const mods = [
      ...files(join('src', 'domain', 'contract')).filter((f) => !/\.test\./.test(f)),
      join('src', 'features', 'quality', 'ContractPanel.tsx'),
    ];
    for (const f of mods) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(
        /\bfetch\(|XMLHttpRequest|EventSource\(|WebSocket|submitApprovalDecision|acknowledgeAlert|sendMessage|\beval\(|new Function\(|import\(|localStorage|sessionStorage/,
      );
    }
  });

  it('the probe interface has no decision, approval or arbitrary-request operation', () => {
    const src = readFileSync(join('src', 'domain', 'contract', 'runner.ts'), 'utf8');
    const iface = src.slice(
      src.indexOf('export interface ConformanceProbe'),
      src.indexOf('export interface RuleOutcome'),
    );
    expect(iface).not.toMatch(
      /decid|approv|grant|certif|dispatch|deploy|url\s*:|request\(|exec|eval/i,
    );
  });
});
