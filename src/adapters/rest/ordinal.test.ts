import { describe, expect, it } from 'vitest';
import { IssueLog, normalizeMission, rejectDuplicateOrdinals } from './normalize';

/**
 * A connected mission store is the only authority for lifetime ordinals; the
 * REST adapter passes them through and never manufactures one.
 */

const AT = '2026-09-30T12:00:00.000Z';
const raw = (extra: Record<string, unknown>) => ({
  id: 'm-x',
  title: 'X',
  status: 'ACTIVE',
  ...extra,
});

describe('REST mission ordinal', () => {
  it('reads the ordinal from the backend field', () => {
    const log = new IssueLog(AT);
    expect(normalizeMission(raw({ ordinal: 0 }), 5, log)!.ordinal).toBe(0);
    expect(normalizeMission(raw({ ordinal: 10000 }), 5, log)!.ordinal).toBe(10000);
    expect(log.issues).toEqual([]);
  });

  it('never derives it from the array position: a missing ordinal stays unknown', () => {
    const log = new IssueLog(AT);
    for (const i of [0, 1, 7, 139]) expect(normalizeMission(raw({}), i, log)!.ordinal).toBeNull();
    expect(log.issues).toEqual([]); // absent is allowed, simply unknown
  });

  it('ignores an untrustworthy ordinal with a warning', () => {
    for (const bad of [-1, 2.5, '0007', true, 2 ** 60]) {
      const log = new IssueLog(AT);
      expect(normalizeMission(raw({ ordinal: bad }), 0, log)!.ordinal).toBeNull();
      expect(log.issues[0]!.message).toMatch(/Invalid mission ordinal/);
    }
  });

  it('two missions claiming one ordinal both become unknown', () => {
    const log = new IssueLog(AT);
    const a = normalizeMission({ ...raw({ ordinal: 3 }), id: 'a' }, 0, log)!;
    const b = normalizeMission({ ...raw({ ordinal: 3 }), id: 'b' }, 1, log)!;
    const c = normalizeMission({ ...raw({ ordinal: 4 }), id: 'c' }, 2, log)!;
    const out = rejectDuplicateOrdinals([a, b, c], log);
    expect(out.map((m) => m.ordinal)).toEqual([null, null, 4]);
    expect(log.issues).toHaveLength(2);
  });
});
