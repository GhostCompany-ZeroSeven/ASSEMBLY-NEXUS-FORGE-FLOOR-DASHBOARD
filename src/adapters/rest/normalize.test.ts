import { describe, expect, it } from 'vitest';
import {
  IssueLog,
  listFrom,
  normalizeAlert,
  normalizeApproval,
  normalizeEvent,
  normalizeHealth,
  normalizeMission,
  normalizeWorker,
} from './normalize';

const AT = '2026-09-30T12:00:00.000Z';
const log = () => new IssueLog(AT);

describe('normalizeWorker', () => {
  it('drops records without identity', () => {
    const l = log();
    expect(normalizeWorker({ name: 'x' }, 0, l)).toBeNull();
    expect(normalizeWorker('nope', 1, l)).toBeNull();
    expect(l.issues.filter((i) => i.severity === 'error')).toHaveLength(2);
  });

  it('shows unknown states as UNKNOWN (never a healthy state) and reports them', () => {
    const l = log();
    const w = normalizeWorker({ id: 'w1', name: 'A', state: 'levitating' }, 0, l)!;
    expect(w.state).toBe('UNKNOWN');
    expect(l.issues.some((i) => /Unknown state "levitating"/.test(i.message))).toBe(true);
    expect(normalizeWorker({ id: 'w2', name: 'B' }, 0, log())!.state).toBe('UNKNOWN');
  });

  it('maps known backend vocabulary', () => {
    expect(normalizeWorker({ id: 'w', name: 'A', state: 'in_progress' }, 0, log())!.state).toBe(
      'WORKING',
    );
  });

  it('never displays invalid progress as a number', () => {
    const l = log();
    expect(
      normalizeWorker({ id: 'w', name: 'A', state: 'idle', progress: 7 }, 0, l)!.progress,
    ).toBeNull();
    expect(
      normalizeWorker({ id: 'w', name: 'A', state: 'idle', progress: 'half' }, 0, l)!.progress,
    ).toBeNull();
    expect(l.issues).toHaveLength(2);
  });

  it('drops authority grants lacking provenance and never promotes capabilities', () => {
    const l = log();
    const w = normalizeWorker(
      {
        id: 'w',
        name: 'A',
        state: 'idle',
        capabilities: [{ id: 'approve', label: 'Founder #0007' }],
        authority: [
          { id: 'g1', label: 'Deploy staging' }, // no grantedBy/grantedAt
          { id: 'g2', label: 'Read logs', grantedBy: 'Founder #0007', grantedAt: AT },
          'admin',
        ],
      },
      0,
      l,
    )!;
    expect(w.authority.map((g) => g.id)).toEqual(['g2']);
    expect(w.capabilities).toEqual([{ id: 'approve', label: 'Founder #0007' }]);
    expect(l.issues.filter((i) => /authority/.test(i.source))).toHaveLength(2);
  });
});

describe('normalizeMission', () => {
  it('keeps unknown status as UNKNOWN and ignores invalid estimates', () => {
    const l = log();
    const m = normalizeMission(
      { id: 'M1', title: 'T', status: 'warp', estimate: { durationMs: -5 }, progress: 2 },
      0,
      l,
    )!;
    expect(m.status).toBe('UNKNOWN');
    expect(m.estimate).toBeUndefined();
    expect(m.progress).toBeNull();
    expect(l.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('strips non-http artifact links', () => {
    const m = normalizeMission(
      {
        id: 'M1',
        title: 'T',
        status: 'active',
        artifacts: [
          { id: 'a', title: 'x', uri: 'javascript:alert(1)' },
          { id: 'b', title: 'y', uri: 'https://ok.test/y' },
        ],
      },
      0,
      log(),
    )!;
    expect(m.artifacts[0]!.uri).toBeUndefined();
    expect(m.artifacts[1]!.uri).toBe('https://ok.test/y');
  });
});

describe('normalizeApproval', () => {
  const base = {
    id: 'A1',
    title: 'Do it',
    requestedBy: 'w1',
    requestedAt: AT,
    status: 'pending',
    requiredAuthority: 'Founder #0007',
    risk: 'low',
    reversible: true,
  };

  it('keeps a well-formed request', () => {
    const a = normalizeApproval(base, 0, log())!;
    expect(a.status).toBe('PENDING');
    expect(a.requiredAuthority).toBe('Founder #0007');
  });

  it('fails safe on missing/unknown authority, risk and reversibility', () => {
    const l = log();
    const a = normalizeApproval(
      { ...base, requiredAuthority: undefined, risk: 'meh', reversible: 'maybe' },
      0,
      l,
    )!;
    expect(a.requiredAuthority).toBe('');
    expect(a.risk).toBe('critical');
    expect(a.reversible).toBe(false);
    expect(l.issues.some((i) => /required authority/.test(i.message))).toBe(true);
  });

  it('does not trust APPROVED without a valid decision record', () => {
    const l = log();
    const a = normalizeApproval({ ...base, status: 'approved' }, 0, l)!;
    expect(a.status).toBe('UNKNOWN');
    const ok = normalizeApproval(
      {
        ...base,
        status: 'approved',
        decision: { decision: 'approve', decidedBy: 'Founder #0007', decidedAt: AT },
      },
      0,
      log(),
    )!;
    expect(ok.status).toBe('APPROVED');
    expect(ok.decision?.delivery).toBe('delivered');
  });

  it('unknown status is UNKNOWN, not PENDING', () => {
    expect(normalizeApproval({ ...base, status: 'sorta' }, 0, log())!.status).toBe('UNKNOWN');
  });
});

describe('normalizeAlert / health / events / lists', () => {
  it('escalates rather than downgrades unknown alert data', () => {
    const a = normalizeAlert({ id: 'x', title: 't', raisedAt: AT, severity: 'weird' }, 0, log())!;
    expect(a.severity).toBe('WARNING');
    expect(a.humanActionRequired).toBe(true);
  });

  it('health with unknown status is UNKNOWN', () => {
    expect(normalizeHealth({ status: 'great' }, log(), AT)!.status).toBe('UNKNOWN');
    expect(normalizeHealth('nope', log(), AT)).toBeNull();
  });

  it('drops unknown or malformed events', () => {
    const l = log();
    expect(normalizeEvent({ id: 'e', kind: 'mystery', at: AT }, 0, l)).toBeNull();
    expect(
      normalizeEvent({ id: 'e', kind: 'mission.created', at: AT, payload: {} }, 1, l),
    ).toBeNull();
    expect(
      normalizeEvent(
        {
          id: 'e',
          kind: 'approval.decided',
          at: AT,
          payload: { approvalId: 'a', record: { decision: 'YES' } },
        },
        2,
        l,
      ),
    ).toBeNull();
    expect(
      normalizeEvent({ id: 'e', kind: 'alert.resolved', at: AT, payload: { alertId: 'x' } }, 3, l),
    ).not.toBeNull();
    expect(l.issues).toHaveLength(3);
  });

  it('listFrom accepts arrays or keyed objects and reports anything else', () => {
    const l = log();
    expect(listFrom([1], 'workers', l)).toEqual([1]);
    expect(listFrom({ workers: [2] }, 'workers', l)).toEqual([2]);
    expect(listFrom({ items: [] }, 'workers', l)).toBeNull();
    expect(l.issues).toHaveLength(1);
  });
});
