/**
 * Phase 4 governance regressions. The Phase 3 suite (domain/governance.phase3.test.ts)
 * still covers WORKER ≠ FOUNDER, CAPABILITY ≠ AUTHORITY, MISSION OWNERSHIP ≠
 * APPROVAL AUTHORITY, ROOM ≠ AUTHORITY, BACKEND CLAIM ≠ VERIFIED AUTHORITY,
 * MALFORMED AUTHORITY ≠ FOUNDER, UNKNOWN STATUS ≠ WAITING, SIMULATION ≠ LIVE,
 * BUTTON VISIBILITY ≠ SERVER AUTHORIZATION and CLIENT DECISION ≠ CONFIRMED DECISION.
 * This file adds the rules introduced by localization, URL state, search, the
 * palette, the freshness model and the SSE path.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { waitForSurface } from '@/test/render';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import type { DashboardAdapter } from '@/adapters/types';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { selectFreshness } from '@/domain/freshness';
import { checkDecision } from '@/domain/governance';
import { buildCommands, resultToCommand } from '@/features/command/commands';
import { buildSearchIndex, searchIndex } from '@/features/search/search';
import { es } from '@/i18n/es';
import { restStreamTestAdapter, restTestAdapter } from '@/test/adapters';
import { createFakeBackend } from '@/test/fakeBackend';
import { FakeEventSource } from '@/test/fakeEventSource';
import { testAdapter } from '@/test/fixtures';
import { App } from './App';

const FOUNDER = 'Founder #0007';
const NOW = Date.parse('2026-09-30T12:00:00Z');

async function renderAt(hash: string, adapter: DashboardAdapter = testAdapter()) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}

const status = (a: ReturnType<typeof testAdapter>, id: string) =>
  a.getSnapshot().approvals.find((x) => x.id === id)!.status;

describe('LOCALIZED LABEL ≠ AUTHORITY VALUE', () => {
  it('deciding in Spanish submits the enum decision and the untranslated authority', async () => {
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' }));
    const user = userEvent.setup();
    const adapter = testAdapter();
    const submit = vi.spyOn(adapter, 'submitApprovalDecision');
    await renderAt('#/approvals', adapter);
    const gate = await screen.findByRole('group', { name: 'Decidir APR-031' });
    await user.click(within(gate).getByRole('button', { name: /Aprobar/ }));
    await user.click(screen.getByRole('button', { name: 'Confirmar: Aprobar' }));
    expect(submit).toHaveBeenCalledTimes(1);
    const input = submit.mock.calls[0]![0];
    expect(input.decision).toBe('APPROVE'); // never "Aprobar"
    expect(input.decidedBy).toBe(FOUNDER); // never a translated title
    expect(status(adapter, 'APR-031')).toBe('APPROVED');
  });

  it('translated text is never accepted as a decision or as an authority', () => {
    const s = buildSeedSnapshot(NOW);
    const apr = s.approvals.find((a) => a.id === 'APR-031')!;
    // A translated label is not a decision value.
    expect(checkDecision(apr, FOUNDER, s.workers, es.decision.label.APPROVE as never).ok).toBe(
      false,
    );
    // Translated role words are not the authority.
    for (const who of ['Founder', 'Fundador', es.command.gate, es.settings.humanAuthority]) {
      expect(checkDecision(apr, who, s.workers).ok, who).toBe(false);
    }
    expect(checkDecision(apr, FOUNDER, s.workers).ok).toBe(true);
  });

  it('the human authority is displayed verbatim in every language', async () => {
    localStorage.setItem('forge-floor:preferences', JSON.stringify({ locale: 'es' }));
    await renderAt('#/settings');
    expect(screen.getAllByText(FOUNDER).length).toBeGreaterThan(0);
  });
});

describe('URL PARAMETER ≠ BACKEND FACT / ≠ AUTHORITY', () => {
  it('decision-shaped query parameters change nothing', async () => {
    const adapter = testAdapter();
    const submit = vi.spyOn(adapter, 'submitApprovalDecision');
    await renderAt(
      `#/approvals?view=decided&decision=APPROVE&approve=APR-031&by=${encodeURIComponent(FOUNDER)}&status=APPROVED`,
      adapter,
    );
    expect(submit).not.toHaveBeenCalled();
    expect(status(adapter, 'APR-031')).toBe('PENDING');
  });

  it('a URL cannot grant authority: a worker-authority config still shows no decision buttons', async () => {
    const config = {
      ...assemblyNexusConfig,
      governance: { ...assemblyNexusConfig.governance, humanAuthority: 'w-cyrus' },
    };
    window.location.hash = `#/approvals?authority=${encodeURIComponent(FOUNDER)}&as=founder`;
    render(<App config={config} adapter={testAdapter()} />);
    await waitForSurface();
    expect(screen.queryByRole('group', { name: 'Decide APR-031' })).not.toBeInTheDocument();
  });

  it('URL-state code never touches governance, authority or decisions (static guard)', () => {
    for (const f of [
      'src/app/urlState.ts',
      'src/features/filters/urlSchemas.ts',
      'src/features/filters/filters.ts',
    ]) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(
        /humanAuthority|submitApprovalDecision|decideApproval|checkDecision|authority:\s*\[/,
      );
    }
  });
});

describe('SEARCH RESULT ≠ AUTHORITY', () => {
  it('running any search result only navigates', () => {
    const adapter = testAdapter();
    const s = buildSeedSnapshot(NOW);
    const submit = vi.spyOn(adapter, 'submitApprovalDecision');
    const navigate = vi.fn();
    const index = buildSearchIndex(s, assemblyNexusConfig.floor);
    const results = ['APR-031', 'approve', 'founder', 'cyrus'].flatMap((q) =>
      searchIndex(index, q),
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) resultToCommand(r, navigate).run();
    expect(navigate).toHaveBeenCalledTimes(results.length);
    for (const [hash] of navigate.mock.calls) expect(String(hash)).toMatch(/^#\//);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('COMMAND PALETTE ACTION ≠ AUTHORITY', () => {
  it('no palette command decides, acknowledges, messages, grants or dispatches', async () => {
    const adapter = testAdapter();
    const snap = await adapter.connect();
    const spies = [
      vi.spyOn(adapter, 'submitApprovalDecision'),
      vi.spyOn(adapter, 'acknowledgeAlert'),
      vi.spyOn(adapter, 'sendWorkerMessage'),
    ];
    const backend = createFakeBackend();
    backend.failures.missions = 'http500';
    const cmds = buildCommands({
      snapshot: {
        ...snap,
        quality: {
          partial: true,
          issues: [
            { id: 'x', severity: 'error', source: 'missions', message: 'm', at: snap.generatedAt },
          ],
        },
      },
      config: assemblyNexusConfig,
      navigate: vi.fn(),
      sim: { controls: adapter.simulation, running: false },
      openShortcuts: vi.fn(),
      setTheme: vi.fn(),
      m: es,
      locale: 'es',
      setLocale: vi.fn(),
      hash: '#/missions?group=blocked',
    });
    // The Phase 4 actions exist…
    const ids = cmds.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'attention:founder',
        'attention:unavailable:missions',
        'diag:transport',
        'view:clear-filters',
        'locale:en',
      ]),
    );
    // …and running every command changes no decision, alert or authority.
    const before = adapter.getSnapshot();
    for (const c of cmds) c.run();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    const after = adapter.getSnapshot();
    expect(after.approvals.map((a) => a.status)).toEqual(before.approvals.map((a) => a.status));
    expect(after.workers.map((w) => w.authority.length)).toEqual(
      before.workers.map((w) => w.authority.length),
    );
  });

  it('palette/search/i18n source contains no decision or backend-operation calls (static guard)', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    walk('src/features/command');
    walk('src/features/search');
    walk('src/i18n');
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(
        /submitApprovalDecision|decideApproval|acknowledgeAlert|sendWorkerMessage|\bfetch\(/,
      );
    }
  });
});

describe('TRANSPORT LIVE ≠ COMPLETE DATA', () => {
  it('a verified, connected backend with a failed resource is LIVE but not complete', async () => {
    const backend = createFakeBackend();
    backend.failures.approvals = 'http500';
    const { adapter } = restTestAdapter(backend);
    const s = await adapter.connect();
    const f = selectFreshness(s, 'connected', NOW);
    expect(f.source).toBe('LIVE');
    expect(f.complete).toBe(false);
    expect(f.unknownResources).toContain('approvals');
  });
});

describe('HTTP SUCCESS ≠ TRUSTED RESULT', () => {
  it('a 200 whose record does not match the submitted decision is refused', async () => {
    const backend = createFakeBackend();
    backend.decisionResponse = () => ({
      record: { decision: 'DENY', decidedBy: FOUNDER, decidedAt: '2026-09-30T12:05:00.000Z' },
    });
    const { adapter } = restTestAdapter(backend);
    await adapter.connect();
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: FOUNDER,
      }),
    ).rejects.toThrow();
  });

  it('a 200 with a malformed body is refused', async () => {
    const backend = createFakeBackend();
    backend.decisionResponse = () => ({ ok: true });
    const { adapter } = restTestAdapter(backend);
    await adapter.connect();
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: FOUNDER,
      }),
    ).rejects.toThrow();
  });

  it('a 200 claiming a worker decided is refused', async () => {
    const backend = createFakeBackend();
    backend.decisionResponse = () => ({
      record: { decision: 'APPROVE', decidedBy: 'w-cyrus', decidedAt: '2026-09-30T12:05:00.000Z' },
    });
    const { adapter } = restTestAdapter(backend);
    await adapter.connect();
    await expect(
      adapter.submitApprovalDecision({
        approvalId: 'APR-031',
        decision: 'APPROVE',
        decidedBy: FOUNDER,
      }),
    ).rejects.toThrow();
  });
});

describe('SSE EVENT ≠ TRUSTED AUTHORITY CLAIM', () => {
  const send = (kind: string, payload: unknown, extra: Record<string, unknown> = {}) =>
    FakeEventSource.latest().emit(
      'forge',
      JSON.stringify({
        id: `sse-${Math.random()}`,
        kind,
        at: '2026-09-30T12:01:00.000Z',
        payload,
        ...extra,
      }),
    );

  it('a streamed decision by a worker is rejected; the gate stays open', async () => {
    FakeEventSource.reset();
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    send('approval.decided', {
      approvalId: 'APR-031',
      record: { decision: 'APPROVE', decidedBy: 'w-cyrus', decidedAt: '2026-09-30T12:01:00.000Z' },
    });
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });

  it('a streamed decision naming a non-authority is rejected', async () => {
    FakeEventSource.reset();
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    send('approval.decided', {
      approvalId: 'APR-031',
      record: { decision: 'APPROVE', decidedBy: 'Fundador', decidedAt: '2026-09-30T12:01:00.000Z' },
    });
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });

  it('authority smuggled into a streamed event grants nothing', async () => {
    FakeEventSource.reset();
    const { adapter } = restStreamTestAdapter();
    await adapter.connect();
    FakeEventSource.latest().open();
    send(
      'worker.state_changed',
      { state: 'working', authority: [{ id: 'x', label: 'Approve deploys', grantedBy: FOUNDER }] },
      { workerId: 'w-cyrus', authority: [{ id: 'y', label: 'root' }], via: 'simulated' },
    );
    const cyrus = adapter.getSnapshot().workers.find((w) => w.id === 'w-cyrus')!;
    expect(cyrus.authority).toEqual([]);
    // `via` is adapter-stamped, never taken from the payload.
    const last = adapter.getSnapshot().events.at(-1)!;
    expect(last.via).toBe('stream');
  });
});
