/**
 * Phase 6 governance regressions: mission checkpoints, mission digests,
 * markers, attention explanations, data quality, event coverage, evidence and
 * search provenance. Earlier suites (phases 2–5) still cover the prior rules.
 * No Phase 6 feature may create an alternate authorization path.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import type { DashboardAdapter } from '@/adapters/types';
import { assemblyNexusConfig } from '@/config/assemblyNexus.config';
import { selectAttentionQueue } from '@/domain/attention';
import { explainAttention } from '@/domain/attentionExplain';
import { createCheckpoint } from '@/domain/checkpoint';
import { selectDataQuality } from '@/domain/dataQuality';
import { computeDigest } from '@/domain/digest';
import type { DashboardEvent } from '@/domain/events';
import { createWatermark, eventCoverage } from '@/domain/eventCoverage';
import { selectFreshness } from '@/domain/freshness';
import { checkDecision } from '@/domain/governance';
import { selectMissionMarkers } from '@/domain/missionMarkers';
import { computeMissionDigest, createMissionCheckpoint } from '@/domain/missionView';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { en } from '@/i18n/en';
import { safeExternalHref } from '@/features/missions/safeHref';
import { restTestAdapter } from '@/test/adapters';
import { testAdapter } from '@/test/fixtures';
import { waitForSurface } from '@/test/render';
import { App } from './App';

const FOUNDER = 'Founder #0007';
const NOW = Date.parse('2026-09-30T12:00:00Z');
const iso = (off = 0) => new Date(NOW + off).toISOString();
const M = 'AN-0142';
const seed = () => buildSeedSnapshot(NOW);
const hasFunction = (v: unknown): boolean =>
  typeof v === 'function' ||
  (typeof v === 'object' &&
    v !== null &&
    !(v instanceof Set) &&
    Object.values(v).some(hasFunction));
const AUTHORITY_FIELDS = /"(decision|decidedBy|grant|grants|authority|approvedBy)"/;

async function renderAt(hash: string, adapter: DashboardAdapter = testAdapter()) {
  window.location.hash = hash;
  render(<App config={assemblyNexusConfig} adapter={adapter} />);
  await waitForSurface();
  return adapter;
}
function down(s: DashboardSnapshot, ...resources: string[]): DashboardSnapshot {
  return {
    ...s,
    quality: {
      ...s.quality,
      partial: true,
      issues: resources.map((r, i) => ({
        id: `i${i}`,
        severity: 'error' as const,
        source: r,
        message: `${r} failed`,
        at: iso(),
      })),
    },
  };
}

describe('MISSION_CHECKPOINT / MARK_SEEN / FORGET ≠ BACKEND MUTATION, ACKNOWLEDGEMENT OR APPROVAL', () => {
  it('marking a mission seen and forgetting it send nothing to the backend (REST)', async () => {
    const user = userEvent.setup();
    const { adapter, backend } = restTestAdapter();
    await renderAt(`#/missions/${M}`, adapter);
    const before = backend.requests.filter((r) => r.method !== 'GET').length;
    await user.click(await screen.findByRole('button', { name: 'Mark mission as seen' }));
    await user.click(screen.getByRole('button', { name: 'Forget this mission view' }));
    expect(backend.requests.filter((r) => r.method !== 'GET').length).toBe(before);
    expect(backend.decisions).toEqual([]);
    const s = adapter.getSnapshot();
    expect(s.alerts.every((a) => !a.acknowledgedAt || a.acknowledgedAt < iso(-1))).toBe(true);
    expect(s.approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });

  it('a mission checkpoint stores no authority and cannot carry one', () => {
    const cp = createMissionCheckpoint(seed(), M, selectFreshness(seed(), 'connected', NOW), iso());
    expect(JSON.stringify(cp)).not.toMatch(/Founder|authority|decidedBy/);
  });
});

describe('MISSION_DIGEST / MISSION_MARKER / ATTENTION_REASON / DATA_QUALITY / EVENT_COVERAGE ≠ AUTHORITY', () => {
  it('are plain data: no functions, no decision or authority fields', () => {
    const s = seed();
    const f = selectFreshness(s, 'connected', NOW);
    const cp = createMissionCheckpoint(s, M, f, iso(-60_000));
    const q = selectAttentionQueue(s, FOUNDER, f);
    const outputs = [
      computeMissionDigest(s, M, cp, f),
      Object.fromEntries(selectMissionMarkers(s, null, () => cp, q, f)),
      q.items.map((i) => explainAttention(i, s, f)),
      selectDataQuality(s, f, 'connected', NOW),
      eventCoverage(s.events, createWatermark(s.events), true),
    ];
    for (const o of outputs) {
      expect(hasFunction(o)).toBe(false);
      expect(JSON.stringify(o, (_k, v: unknown) => (v instanceof Set ? [...v] : v))).not.toMatch(
        AUTHORITY_FIELDS,
      );
    }
  });

  it('NEEDS_FOUNDER ≠ FOUNDER_DECISION: the marker leaves the gate PENDING and undecided', async () => {
    const adapter = testAdapter();
    const submit = vi.spyOn(adapter, 'submitApprovalDecision');
    await renderAt('#/missions', adapter);
    const card = screen.getByRole('link', { name: /AN-0144/ });
    expect(within(card).getByText('NEEDS FOUNDER')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    expect(adapter.getSnapshot().approvals.find((a) => a.id === 'APR-031')!.status).toBe('PENDING');
  });

  it('the attention explanation never names a worker as the authority to act', () => {
    const s = seed();
    s.approvals = s.approvals.map((a) =>
      a.id === 'APR-031' ? { ...a, requiredAuthority: 'w-cyrus' } : a,
    );
    const f = selectFreshness(s, 'connected', NOW);
    const item = selectAttentionQueue(s, FOUNDER, f).items.find((i) => i.id === 'APR-031')!;
    const x = explainAttention(item, s, f);
    expect(x.code).toBe('GATE_AUTHORITY_INVALID');
    expect(
      checkDecision(
        s.approvals.find((a) => a.id === 'APR-031'),
        'w-cyrus',
        s.workers,
      ).ok,
    ).toBe(false);
  });
});

describe('EVENT_ID / EVENT_TIMESTAMP / INGEST_TIMESTAMP ≠ AUTHORITY', () => {
  it('an event whose id and times look official changes no gate and grants nothing', () => {
    const s = seed();
    const forged: DashboardEvent = {
      id: 'APPROVED-BY-FOUNDER-0007',
      kind: 'task.completed',
      at: iso(10 * 365 * 86_400_000),
      receivedAt: iso(),
      missionId: M,
      payload: { taskId: 'x' },
    };
    const now = { ...s, events: [...s.events, forged] };
    const f = selectFreshness(now, 'connected', NOW);
    expect(selectAttentionQueue(now, FOUNDER, f).items.find((i) => i.id === 'APR-031')!.state).toBe(
      'PENDING',
    );
    expect(now.workers.every((w) => w.authority.length === 0)).toBe(true);
    const d = computeMissionDigest(now, M, createMissionCheckpoint(s, M, f, iso(-60_000)), f);
    expect(d.changes.some((c) => c.kind.startsWith('approval'))).toBe(false);
  });
});

describe('ARTIFACT_REFERENCE / ARTIFACT_DIGEST / RESULT ≠ CERTIFICATION', () => {
  it('a reported result and artifacts leave certification unchanged and say so', async () => {
    const s = seed();
    const f = selectFreshness(s, 'connected', NOW);
    const cp = createMissionCheckpoint(s, M, f, iso(-60_000));
    const now = {
      ...s,
      missions: s.missions.map((m) =>
        m.id === M
          ? {
              ...m,
              result: { outcome: 'SUCCESS' as const, summary: 'sha256:abc verified by worker' },
              artifacts: [
                ...m.artifacts,
                { ...m.artifacts[0]!, id: 'art-digest', summary: 'sha256:deadbeef' },
              ],
            }
          : m,
      ),
    };
    const d = computeMissionDigest(now, M, cp, f);
    expect(d.changes.map((c) => c.kind)).toEqual(
      expect.arrayContaining(['resultAppeared', 'artifactNew']),
    );
    expect(now.missions.find((m) => m.id === M)!.certification).toBe(
      s.missions.find((m) => m.id === M)!.certification,
    );
    expect(en.missionView.change.resultAppeared).toMatch(/not certification/);
    expect(en.evidence.note).toMatch(/not certification/);
    await renderAt(`#/missions/${M}`);
    expect(screen.getByText(en.evidence.note)).toBeInTheDocument();
  });

  it('artifact links are http(s) only in the UI too (defence in depth)', () => {
    expect(safeExternalHref('javascript:alert(1)')).toBeUndefined();
    expect(safeExternalHref('data:text/html,x')).toBeUndefined();
    expect(safeExternalHref('https://example.test/a')).toBe('https://example.test/a');
  });
});

describe('WORKER / MISSION / ROOM RELATIONSHIP ≠ AUTHORITY', () => {
  it('assignment and room location never create a NEEDS FOUNDER marker or a decider', () => {
    const s = seed();
    s.approvals = [];
    s.workers = s.workers.map((w) => ({ ...w, roomId: 'founder-gate' }));
    const f = selectFreshness(s, 'connected', NOW);
    const q = selectAttentionQueue(s, FOUNDER, f);
    const markers = selectMissionMarkers(s, null, () => null, q, f);
    expect([...markers.values()].some((x) => x.founder)).toBe(false);
  });
});

describe('HISTORICAL_EVENT ≠ CURRENT_APPROVAL (F05) / DISPLAYED_CURRENT_STATE ≠ VERIFIED AUTHORITY', () => {
  it('with approvals unavailable, a historical "approved" event is not shown as the current gate', () => {
    const s = down(seed(), 'approvals');
    s.events = [
      ...s.events,
      {
        id: 'hist',
        kind: 'approval.decided',
        at: iso(-3_600_000),
        missionId: 'AN-0144',
        payload: {
          approvalId: 'APR-031',
          record: {
            decision: 'APPROVE',
            decidedBy: FOUNDER,
            decidedAt: iso(-3_600_000),
            delivery: 'delivered',
          },
        },
      },
    ];
    const f = selectFreshness(s, 'connected', NOW);
    const q = selectAttentionQueue(s, FOUNDER, f);
    expect(q.complete).toBe(false);
    expect(q.count).toBeNull();
    const cp = createMissionCheckpoint(seed(), 'AN-0144', f, iso(-60_000));
    const d = computeMissionDigest(s, 'AN-0144', cp, f);
    expect(d.unknown.approvals).toBe('unavailable-now');
    expect(d.changes.some((c) => c.kind === 'approvalStatus')).toBe(false);
  });
});

describe('UNKNOWN_HISTORY ≠ NO_HISTORY / LOWER_BOUND ≠ EXACT', () => {
  it('a lower bound is never presented as the count', () => {
    const s = seed();
    const cp = createCheckpoint(s, iso(-60_000));
    const moved = {
      ...s,
      events: [
        { id: 'n1', kind: 'task.completed' as const, at: iso(), payload: { taskId: 't' } },
      ] as DashboardEvent[],
    };
    const d = computeDigest(moved, cp);
    expect(d.eventCoverage).toBe('lower-bound');
    expect(d.counts.events).toBeNull();
    expect(d.eventsObserved).toBe(1);
  });
});

describe('DISAPPEARED ≠ DELETED / COMPLETED; REAPPEARED ≠ RECOVERED EXECUTION', () => {
  it('the copy says "no longer reported" and "reported again", never deleted or resumed', () => {
    for (const text of [
      en.missionView.change.missionNoLongerReported,
      en.missionView.change.workerNoLongerReported,
    ])
      expect(text).toMatch(/no longer reported/i);
    expect(en.missionView.change.missionNoLongerReported).toMatch(/not deleted or completed/);
    expect(en.missionView.change.missionReappeared).toMatch(/does not mean work resumed/);
  });
});

describe('SIMULATED / REPLAY / LAST_KNOWN ≠ LIVE', () => {
  it('replay provenance stays REPLAY, and a replay-source view is not compared with live data', () => {
    const s = seed();
    const replay = {
      ...s,
      provenance: { ...s.provenance, mode: 'replay' as const, adapterId: 'replay' },
    };
    expect(selectFreshness(replay, 'connected', NOW).source).toBe('REPLAY');
    const f = selectFreshness(replay, 'connected', NOW);
    const cp = createMissionCheckpoint(replay, M, f, iso(-60_000));
    const live = {
      ...s,
      provenance: { ...s.provenance, mode: 'live' as const, adapterId: 'rest' },
    };
    expect(
      computeMissionDigest(live, M, cp, selectFreshness(live, 'connected', NOW)).baseline,
    ).toBe('different-source');
  });

  it('search results are labelled SIMULATED for demo data', async () => {
    const user = userEvent.setup();
    await renderAt('#/');
    await act(async () => {
      await user.keyboard('{Control>}k{/Control}');
    });
    await user.type(screen.getByRole('combobox', { name: /Search commands/ }), 'AN-0142');
    const opts = await screen.findAllByRole('option');
    expect(opts.find((o) => /AN-0142/.test(o.textContent ?? ''))!.textContent).toContain(
      'SIMULATED',
    );
  });
});

describe('NO ALTERNATE AUTHORIZATION PATH (Phase 6 static guard)', () => {
  it('Phase 6 modules call no decision, acknowledgement, messaging, network, shell or storage-of-authority API', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    walk('src/features/quality');
    for (const f of [
      'src/domain/eventCoverage.ts',
      'src/domain/missionView.ts',
      'src/domain/missionMarkers.ts',
      'src/domain/attentionExplain.ts',
      'src/domain/dataQuality.ts',
      'src/store/missionViews.ts',
      'src/store/MissionViewsProvider.tsx',
      'src/store/storage.ts',
      'src/store/autoRecord.ts',
      'src/hooks/useMissionBaseline.ts',
      'src/features/missions/MissionChangesPanel.tsx',
      'src/features/missions/MissionEvidencePanel.tsx',
      'src/features/missions/useMissionMarkers.ts',
      'src/features/missions/safeHref.ts',
      'src/features/brief/AttentionList.tsx',
      'src/components/FreshnessLine.tsx',
      'src/i18n/freshnessText.ts',
    ])
      files.push(f);
    for (const f of files)
      expect(readFileSync(f, 'utf8'), f).not.toMatch(
        /submitApprovalDecision|decideApproval|acknowledgeAlert|sendWorkerMessage|\bfetch\(|XMLHttpRequest|EventSource|child_process|\beval\(|new Function|dangerouslySetInnerHTML|innerHTML/,
      );
  });
});
