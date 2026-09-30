/**
 * Phase 5 governance regressions. The Phase 3 and Phase 4 suites still cover
 * the earlier rules. This file adds the rules introduced by the change digest,
 * Founder brief, attention queue, operations timeline, last-view checkpoint,
 * pseudo-locale and cross-surface links. None of them may create an
 * alternate authorization path.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import type { DashboardAdapter } from '@/adapters/types';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { selectAttentionQueue } from '@/domain/attention';
import { createCheckpoint, parseCheckpoint } from '@/domain/checkpoint';
import { computeDigest } from '@/domain/digest';
import type { DashboardEvent } from '@/domain/events';
import { selectFreshness } from '@/domain/freshness';
import { checkDecision } from '@/domain/governance';
import { pseudoMessages } from '@/i18n/pseudo';
import { LAST_VIEW_KEY } from '@/store/lastView';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';
import { App } from './App';

const FOUNDER = 'Founder #0007';
const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOW = Date.parse('2026-09-30T12:00:00Z');
const iso = (off = 0) => new Date(NOW + off).toISOString();

async function renderAt(hash: string, adapter: DashboardAdapter = testAdapter()) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}

function spyAll(adapter: DashboardAdapter) {
  return [
    vi.spyOn(adapter, 'submitApprovalDecision'),
    vi.spyOn(adapter, 'acknowledgeAlert'),
    ...(adapter.sendWorkerMessage ? [vi.spyOn(adapter, 'sendWorkerMessage')] : []),
  ];
}

const status = (a: ReturnType<typeof testAdapter>, id: string) =>
  a.getSnapshot().approvals.find((x) => x.id === id)!.status;

describe('CHANGE DIGEST ≠ AUTHORITY', () => {
  it('using the brief (mark seen, forget, follow links) calls no backend operation', async () => {
    const user = userEvent.setup();
    const adapter = testAdapter();
    const spies = spyAll(adapter);
    await renderAt('#/brief', adapter);
    await user.click(screen.getByRole('button', { name: 'Mark all as seen' }));
    await user.click(screen.getByRole('button', { name: 'Forget last view' }));
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(status(adapter, 'APR-031')).toBe('PENDING');
  });

  it('the digest is data only: no functions, no decisions, no authority fields', () => {
    const s = buildSeedSnapshot(NOW);
    const d = computeDigest(s, createCheckpoint(s, iso(-60_000)));
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/"(decision|decidedBy|authority|requiredAuthority)"/);
    const hasFn = (v: unknown): boolean =>
      typeof v === 'function' ||
      (typeof v === 'object' && v !== null && Object.values(v).some(hasFn));
    expect(hasFn(d)).toBe(false);
  });
});

describe('ATTENTION QUEUE ≠ AUTHORITY / DISPLAYED FOUNDER ATTENTION ≠ FOUNDER APPROVAL', () => {
  it('a gate shown in the queue stays PENDING; following it only navigates', async () => {
    const user = userEvent.setup();
    const adapter = testAdapter();
    const spies = spyAll(adapter);
    await renderAt('#/brief', adapter);
    const panel = document.querySelector<HTMLElement>('[data-focus-id="attention"]')!;
    await user.click(within(panel).getByRole('link', { name: 'Rotate staging deploy key' }));
    expect(window.location.hash).toBe('#/approvals?focus=APR-031');
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(status(adapter, 'APR-031')).toBe('PENDING');
  });

  it('the queue offers no decision control of its own', async () => {
    await renderAt('#/brief');
    const panel = document.querySelector<HTMLElement>('[data-focus-id="attention"]')!;
    expect(within(panel).queryAllByRole('button')).toEqual([]);
  });

  it('queue membership never makes a gate decidable by anyone but its required authority', () => {
    const s = buildSeedSnapshot(NOW);
    s.approvals = s.approvals.map((a) =>
      a.id === 'APR-031' ? { ...a, requiredAuthority: 'w-cyrus' } : a,
    );
    const q = selectAttentionQueue(s, FOUNDER, selectFreshness(s, 'connected', NOW));
    const item = q.items.find((i) => i.id === 'APR-031')!;
    expect(item.reason).toBe('gate-undecidable');
    const gate = s.approvals.find((a) => a.id === 'APR-031');
    expect(checkDecision(gate, FOUNDER, s.workers).ok).toBe(false);
    expect(checkDecision(gate, 'w-cyrus', s.workers).ok).toBe(false);
  });
});

describe('TIMELINE EVENT ≠ AUTHORITY / HISTORICAL EVENT ≠ CURRENT AUTHORITY', () => {
  const decided = (by: string): DashboardEvent => ({
    id: 'hist-decided',
    kind: 'approval.decided',
    at: iso(-3_600_000),
    payload: {
      approvalId: 'APR-031',
      record: {
        decision: 'APPROVE',
        decidedBy: by,
        decidedAt: iso(-3_600_000),
        delivery: 'delivered',
      },
    },
  });

  it('a historical "approved" event in the log does not remove a gate the CURRENT data holds open', () => {
    const s = buildSeedSnapshot(NOW);
    const withHistory = { ...s, events: [...s.events, decided(FOUNDER)] };
    const q = selectAttentionQueue(
      withHistory,
      FOUNDER,
      selectFreshness(withHistory, 'connected', NOW),
    );
    expect(q.items.find((i) => i.id === 'APR-031')).toMatchObject({ state: 'PENDING' });
    const d = computeDigest(withHistory, createCheckpoint(s, iso(-60_000)));
    expect(d.counts.approvalsResolved).toBe(0);
  });

  it('OBSERVED APPROVAL EVENT ≠ CURRENT APPROVAL: the timeline labels current state as "Now"', async () => {
    const adapter = testAdapter();
    await renderAt('#/activity?cats=approval', adapter);
    const stream = screen.getByRole('list', { name: 'Activity stream' });
    // The timeline never renders a decision control, whatever the events claim.
    expect(within(stream).queryAllByRole('button')).toEqual([]);
    expect(status(adapter, 'APR-031')).toBe('PENDING');
  });
});

describe('LAST-VIEW CHECKPOINT ≠ AUTHORITY', () => {
  it('a stored checkpoint claiming a gate was APPROVED, with smuggled authority, changes nothing', async () => {
    const adapter = testAdapter();
    const snap = await adapter.connect();
    adapter.disconnect();
    const forged = {
      ...createCheckpoint(snap, iso(-60_000)),
      approvals: { 'APR-031': 'APPROVED' },
      authority: FOUNDER,
      decidedBy: FOUNDER,
      grants: [{ worker: 'w-cyrus', label: 'Approve deploys' }],
    };
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(forged));
    const fresh = testAdapter();
    const spies = spyAll(fresh);
    await renderAt('#/approvals', fresh);
    expect(status(fresh, 'APR-031')).toBe('PENDING');
    expect(fresh.getSnapshot().workers.find((w) => w.id === 'w-cyrus')!.authority).toEqual([]);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(Object.keys(parseCheckpoint(forged, NOW) ?? {})).not.toContain('authority');
  });
});

describe('PSEUDO-LOCALE LABEL ≠ AUTHORITY', () => {
  it('deciding in the pseudo-locale submits the enum decision and the exact authority', async () => {
    const user = userEvent.setup();
    const adapter = testAdapter();
    const submit = vi.spyOn(adapter, 'submitApprovalDecision');
    window.history.replaceState(null, '', '/?pseudo=1#/approvals');
    try {
      await renderAt('#/approvals', adapter);
      const p = pseudoMessages();
      const gate = await screen.findByRole('group', { name: p.gate.decide('APR-031') });
      expect(document.documentElement.lang).toBe('en-XA');
      // The authority value is shown untouched inside pseudo text.
      const card = document.querySelector<HTMLElement>('[data-focus-id="APR-031"]')!;
      expect(card.textContent).toContain(FOUNDER);
      await user.click(
        within(gate).getByRole('button', { name: new RegExp(escape(p.decision.label.APPROVE)) }),
      );
      const confirm = screen.getByRole('group', { name: p.gate.confirmGroup });
      await user.click(
        within(confirm).getByRole('button', {
          name: new RegExp(escape(p.decision.label.APPROVE)),
        }),
      );
      expect(submit).toHaveBeenCalledTimes(1);
      const input = submit.mock.calls[0]![0];
      expect(input.decision).toBe('APPROVE'); // never the pseudo label
      expect(input.decidedBy).toBe(FOUNDER); // never pseudo text
      expect(status(adapter, 'APR-031')).toBe('APPROVED');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('EVENT RELATIONSHIP ≠ AUTHORITY / ROOM RELATIONSHIP ≠ AUTHORITY', () => {
  it('attention is never derived from room location', () => {
    const s = buildSeedSnapshot(NOW);
    // Everyone stands in the Founder Gate room; nothing is waiting.
    s.approvals = [];
    s.alerts = [];
    s.workers = s.workers.map((w) => ({ ...w, roomId: 'founder-gate' }));
    const q = selectAttentionQueue(s, FOUNDER, selectFreshness(s, 'connected', NOW));
    expect(q.items).toEqual([]);
    expect(q.count).toBe(0);
  });

  it('related-record links are navigation only (hash links, no handlers that decide)', async () => {
    const adapter = testAdapter();
    const spies = spyAll(adapter);
    const user = userEvent.setup();
    await renderAt('#/approvals', adapter);
    const gate = document.querySelector<HTMLElement>('[data-focus-id="APR-031"]')!;
    const rel = within(gate).getByRole('link', { name: 'Approval waiting at the Founder Gate' });
    expect(rel.getAttribute('href')).toMatch(/^#\//);
    await user.click(rel);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

describe('UNKNOWN HISTORY ≠ NO HISTORY', () => {
  it('without a baseline, nothing reads as "nothing changed"', async () => {
    await renderAt('#/brief');
    expect(screen.queryByText(/Nothing changed/)).toBeNull();
    expect(document.querySelector('[data-figure="newSinceLastView"]')!.textContent).toContain(
      'UNKNOWN',
    );
  });
});

describe('NO ALTERNATE AUTHORIZATION PATH (static guard)', () => {
  it('Phase 5 modules contain no decision, acknowledgement, messaging or network calls', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    walk('src/features/brief');
    walk('src/features/activity');
    for (const f of [
      'src/domain/digest.ts',
      'src/domain/checkpoint.ts',
      'src/domain/attention.ts',
      'src/domain/brief.ts',
      'src/store/lastView.ts',
      'src/store/LastViewProvider.tsx',
      'src/i18n/pseudo.ts',
      'src/i18n/intl.ts',
    ])
      files.push(f);
    for (const f of files)
      expect(readFileSync(f, 'utf8'), f).not.toMatch(
        /submitApprovalDecision|decideApproval|acknowledgeAlert|sendWorkerMessage|\bfetch\(|XMLHttpRequest|EventSource/,
      );
  });
});
