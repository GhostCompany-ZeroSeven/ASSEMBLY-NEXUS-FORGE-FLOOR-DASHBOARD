/**
 * Phase 8: the contract-conformance runner against the MOCK contract (the real
 * RestAdapter and the real Phase 7 mock core, in process), plus negative
 * controls that prove each result can actually come out FAIL, and the
 * unapproved Assembly Nexus placeholder, which can only be BLOCKED.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { createMockContractProbe } from '@/test/mockContractProbe';
import { MOCK_PROFILE, REAL_ANN_PLACEHOLDER_PROFILE } from './profiles';
import { renderReportMarkdown } from './report';
import { isContiguousSuffix, reusedIds, runConformance, type ConformanceReport } from './runner';
import { RULE_IDS } from './rules';

const probe = createMockContractProbe();
let report: ConformanceReport;
afterAll(() => probe.close());

describe('mock contract profile: full run', () => {
  it('runs every rule against the mock and records each result with its provenance', async () => {
    report = await runConformance(MOCK_PROFILE, probe);
    expect(report.outcomes.map((o) => o.ruleId)).toEqual([...RULE_IDS]);
    for (const o of report.outcomes) {
      expect(o.provenance).toBe('RUNTIME_OBSERVATION');
      expect(o.profileProvenance).toBe('MOCK_PROFILE');
    }
    // Written for review (test-results/ is not committed).
    mkdirSync('test-results/conformance', { recursive: true });
    writeFileSync('test-results/conformance/mock-profile.json', JSON.stringify(report, null, 2));
    writeFileSync('test-results/conformance/mock-profile.md', renderReportMarkdown(report));
  }, 60_000);

  it('matches the expected per-rule results (the mock does not guarantee at-least-once)', () => {
    const r = Object.fromEntries(report.outcomes.map((o) => [o.ruleId, o.result]));
    expect(r).toEqual({
      EVENT_ID_UNIQUENESS: 'PASS',
      EVENT_ID_STABILITY: 'PASS',
      LISTING_WINDOW_CONTIGUITY: 'PASS',
      LISTING_ORDERING: 'PASS',
      DUPLICATE_DELIVERY: 'PASS',
      AT_LEAST_ONCE_DELIVERY: 'FAIL',
      SAME_ID_CONFLICT_SEMANTICS: 'PASS',
      RECONNECT_RESUME_SEMANTICS: 'PASS',
      REST_SSE_RECONCILIATION: 'PASS',
      EVENT_TIME_SEMANTICS: 'PASS',
      RECEIVED_TIME_SEMANTICS: 'PASS',
      HISTORY_TRUNCATION_SIGNAL: 'PASS',
      RESOURCE_PARTIAL_FAILURE: 'PASS',
      MALFORMED_RECORD_HANDLING: 'PASS',
    });
  });

  it('every result agrees with what the mock profile states (no contradiction)', () => {
    const contradictions = report.outcomes.filter(
      (o) => o.profileConsistency === 'CONTRADICTS_PROFILE',
    );
    expect(contradictions.map((o) => o.ruleId)).toEqual([]);
    // The at-least-once FAIL is consistent: the mock does NOT guarantee it.
    const alo = report.outcomes.find((o) => o.ruleId === 'AT_LEAST_ONCE_DELIVERY')!;
    expect(alo.profileClause.guarantee).toBe('NOT_GUARANTEED');
    expect(alo.profileConsistency).toBe('CONSISTENT');
  });

  it('reconnect: the adapter asks to resume, the mock does not replay, REST recovers', () => {
    const o = report.outcomes.find((x) => x.ruleId === 'RECONNECT_RESUME_SEMANTICS')!;
    expect(o.capability).toBe('NOT_SUPPORTED');
    expect(o.observed).toBe('no-replay-recovered-by-rest');
    expect(o.evidence.join(' ')).toMatch(/resume hint/);
  });

  it('history truncation: no explicit signal; gaps are inferred', () => {
    const o = report.outcomes.find((x) => x.ruleId === 'HISTORY_TRUNCATION_SIGNAL')!;
    expect(o.capability).toBe('NOT_SUPPORTED');
    expect(o.observed).toBe('gap-inferred');
  });

  it('malformed records: each case has its documented treatment', () => {
    const o = report.outcomes.find((x) => x.ruleId === 'MALFORMED_RECORD_HANDLING')!;
    expect(o.treatments).toEqual({
      'missing-id': 'DROP_RECORD',
      'invalid-timestamp': 'DROP_RECORD',
      'unknown-enum': 'DEGRADE_RESOURCE',
      'invalid-stream-text': 'DROP_RECORD',
      'duplicate-record': 'DROP_RECORD',
      'conflicting-record': 'DROP_RECORD',
      'malformed-payload': 'FAIL_RESOURCE',
    });
  });

  it('the report states it is a MOCK profile, not Founder approved, and never an authority', () => {
    expect(report.profile).toEqual({
      id: 'forge-floor-mock-v1',
      kind: 'MOCK',
      provenance: 'MOCK_PROFILE',
      founderApproved: false,
    });
    const md = renderReportMarkdown(report);
    expect(md).toMatch(/MOCK profile/);
    expect(md).toMatch(/not the Assembly Nexus contract/i);
    expect(md).toMatch(/not Founder approved/i);
    expect(md).not.toMatch(
      /\bcertified\b|approved by founder|trust score|\d+% (healthy|conformant)/i,
    );
  });
});

describe('the unapproved Assembly Nexus placeholder', () => {
  it('with no adapter to test, every rule is BLOCKED and nothing is PASS', async () => {
    const r = await runConformance(REAL_ANN_PLACEHOLDER_PROFILE, null);
    expect(new Set(r.outcomes.map((o) => o.result))).toEqual(new Set(['BLOCKED']));
    expect(r.outcomes.every((o) => o.provenance === 'NOT_EXECUTED')).toBe(true);
    expect(r.historyAssuredByProfile).toBe(false);
  });

  it('even when run against the mock, results are never comparable with UNKNOWN clauses', async () => {
    const r = await runConformance(REAL_ANN_PLACEHOLDER_PROFILE, probe, [
      'EVENT_ID_UNIQUENESS',
      'AT_LEAST_ONCE_DELIVERY',
    ]);
    for (const o of r.outcomes) {
      expect(o.profileClause.guarantee).toBe('UNKNOWN');
      expect(o.profileConsistency).toBe('NOT_COMPARABLE');
    }
  }, 30_000);
});

/* ------------------------- negative controls ------------------------- */
/* Each proves the runner can report something other than PASS, so a PASS
   above is evidence and not a default. */

type Probe = ReturnType<typeof createMockContractProbe>;
function wrap(base: Probe, over: Partial<Probe>): Probe {
  return new Proxy(base, {
    get: (t, k) => (k in over ? over[k as keyof Probe] : Reflect.get(t, k)),
  }) as Probe;
}

describe('negative controls', () => {
  it('a listing with a hole is reported non-contiguous (FAIL), never contiguous', async () => {
    const holed = wrap(probe, {
      listingPayload: async () => {
        const p = (await probe.listingPayload()) as { events: { id: string }[] };
        return { events: p.events.filter((e) => e.id !== 'w-10') };
      },
    });
    const r = await runConformance(MOCK_PROFILE, holed, ['LISTING_WINDOW_CONTIGUITY']);
    expect(r.outcomes[0]!.result).toBe('FAIL');
    // The mock profile GUARANTEES contiguity, so this contradicts the profile.
    expect(r.outcomes[0]!.profileConsistency).toBe('CONTRADICTS_PROFILE');
  }, 30_000);

  it('isContiguousSuffix: suffix yes; hole, reorder or foreign id no', () => {
    const ins = ['a', 'b', 'c', 'd', 'e'];
    expect(isContiguousSuffix(['c', 'd', 'e'], ins)).toBe(true);
    expect(isContiguousSuffix(['b', 'd', 'e'], ins)).toBe(false);
    expect(isContiguousSuffix(['d', 'c', 'e'], ins)).toBe(false);
    expect(isContiguousSuffix(['c', 'd', 'x'], ins)).toBe(false);
    expect(isContiguousSuffix(['a', 'b', 'c', 'd', 'e', 'f'], ins)).toBe(false);
  });

  it('a source that reuses an id for a different event is reported (FAIL)', async () => {
    const reusing = wrap(probe, {
      listingPayload: async () => {
        const p = (await probe.listingPayload()) as { events: Record<string, unknown>[] };
        return { events: [...p.events, { ...p.events.at(-1)!, missionId: 'AN-0141' }] };
      },
    });
    const r = await runConformance(MOCK_PROFILE, reusing, ['EVENT_ID_UNIQUENESS']);
    expect(r.outcomes[0]!.result).toBe('FAIL');
    expect(
      reusedIds([
        { id: 'a', kind: 'k', at: '1' },
        { id: 'a', kind: 'k', at: '2' },
      ]),
    ).toEqual(['a']);
    expect(
      reusedIds([
        { id: 'a', kind: 'k', at: '1' },
        { id: 'a', kind: 'k', at: '1' },
      ]),
    ).toEqual([]);
  }, 30_000);

  it('a stream that never comes back is UNKNOWN (never PASS)', async () => {
    const stuck = wrap(probe, { streamUp: async () => false });
    const r = await runConformance(MOCK_PROFILE, stuck, [
      'AT_LEAST_ONCE_DELIVERY',
      'RECONNECT_RESUME_SEMANTICS',
    ]);
    for (const o of r.outcomes) {
      expect(o.result).toBe('UNKNOWN');
      expect(o.profileConsistency).toBe('NOT_COMPARABLE');
    }
    await probe.fault('stream', 'off');
  }, 30_000);

  it('a procedure that throws is UNKNOWN (never PASS)', async () => {
    const broken = wrap(probe, {
      listingPayload: async () => {
        throw new Error('listing unavailable');
      },
    });
    const r = await runConformance(MOCK_PROFILE, broken, ['LISTING_ORDERING']);
    expect(r.outcomes[0]!.result).toBe('UNKNOWN');
    expect(r.outcomes[0]!.observed).toBe('procedure-error');
  }, 30_000);

  it('a probe without injection is BLOCKED; without a stream, stream-only handling is NOT_APPLICABLE', async () => {
    const passive = wrap(probe, {
      capabilities: {
        inject: false,
        stream: false,
        faults: false,
        window: false,
        observeListing: false,
      },
    });
    const r = await runConformance(MOCK_PROFILE, passive, [
      'EVENT_ID_UNIQUENESS',
      'RESOURCE_PARTIAL_FAILURE',
    ]);
    expect(r.outcomes.map((o) => o.result)).toEqual(['BLOCKED', 'BLOCKED']);
    const noStream = wrap(probe, {
      capabilities: {
        inject: true,
        stream: false,
        faults: true,
        window: true,
        observeListing: true,
      },
    });
    const r2 = await runConformance(MOCK_PROFILE, noStream, ['REST_SSE_RECONCILIATION']);
    expect(r2.outcomes[0]!.result).toBe('NOT_APPLICABLE');
  });
});
