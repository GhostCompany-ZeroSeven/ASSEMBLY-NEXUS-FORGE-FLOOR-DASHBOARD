import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import {
  activeFilterCount,
  DEFAULT_ALERT_FILTER,
  DEFAULT_APPROVAL_FILTER,
  DEFAULT_MISSION_FILTER,
  DEFAULT_WORKER_FILTER,
  filterAlerts,
  filterApprovals,
  filterMissions,
  filterWorkers,
  isWaitingForFounder,
} from './filters';

const s = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));

describe('mission filters', () => {
  it('"Awaiting Founder" means gated on an OPEN approval', () => {
    const ids = filterMissions(s, { ...DEFAULT_MISSION_FILTER, group: 'founder' }).map((m) => m.id);
    expect(ids).toEqual(['AN-0144']);
  });
  it('filters by worker, priority and text; default sort puts Founder-gated first', () => {
    expect(
      filterMissions(s, { ...DEFAULT_MISSION_FILTER, workerId: 'w-ada' })
        .map((m) => m.id)
        .sort(),
    ).toEqual(['AN-0139', 'AN-0142']);
    expect(
      filterMissions(s, { ...DEFAULT_MISSION_FILTER, priority: 'high' }).every(
        (m) => m.priority === 'high',
      ),
    ).toBe(true);
    expect(
      filterMissions(s, { ...DEFAULT_MISSION_FILTER, q: 'telemetry ingest' }).map((m) => m.id),
    ).toEqual(['AN-0142']);
    expect(filterMissions(s, DEFAULT_MISSION_FILTER)[0]!.id).toBe('AN-0144');
  });
});

describe('worker filters', () => {
  it('waiting for Founder is derived from open approval blockers', () => {
    const cyrus = s.workers.find((w) => w.id === 'w-cyrus')!;
    expect(isWaitingForFounder(cyrus, s)).toBe(true);
    const decided = {
      approvals: s.approvals.map((a) =>
        a.id === 'APR-031' ? { ...a, status: 'DENIED' as const } : a,
      ),
    };
    expect(isWaitingForFounder(cyrus, decided)).toBe(false);
  });
  it('flags, room and authority filters', () => {
    expect(
      filterWorkers(s, { ...DEFAULT_WORKER_FILTER, flag: 'founder' }).map((w) => w.id),
    ).toEqual(['w-cyrus']);
    expect(filterWorkers(s, { ...DEFAULT_WORKER_FILTER, flag: 'active' }).length).toBeGreaterThan(
      3,
    );
    expect(filterWorkers(s, { ...DEFAULT_WORKER_FILTER, authority: 'granted' })).toHaveLength(0);
    expect(
      filterWorkers(s, { ...DEFAULT_WORKER_FILTER, roomId: 'build' }, (w) => w.homeRoomId)
        .map((w) => w.id)
        .sort(),
    ).toEqual(['w-ada', 'w-juniper', 'w-otto']);
  });
  it('worker sorting: attention puts the Founder-gated worker first; name is alphabetical', () => {
    expect(filterWorkers(s, DEFAULT_WORKER_FILTER)[0]!.id).toBe('w-cyrus');
    const names = filterWorkers(s, { ...DEFAULT_WORKER_FILTER, sort: 'name' }).map((w) => w.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const since = filterWorkers(s, { ...DEFAULT_WORKER_FILTER, sort: 'longest-in-state' }).map(
      (w) => w.stateSince,
    );
    expect(since).toEqual([...since].sort());
  });
});

describe('approval and alert filters', () => {
  it('views and risk', () => {
    expect(
      filterApprovals(s, { ...DEFAULT_APPROVAL_FILTER, view: 'open' }).map((a) => a.id),
    ).toEqual(['APR-031']);
    expect(
      filterApprovals(s, { ...DEFAULT_APPROVAL_FILTER, view: 'decided' }).map((a) => a.id),
    ).toEqual(['APR-030']);
    expect(
      filterApprovals(s, { ...DEFAULT_APPROVAL_FILTER, risk: 'low' }).map((a) => a.id),
    ).toEqual(['APR-030']);
  });
  it('UNKNOWN approvals are neither open nor decided', () => {
    const u = { ...s, approvals: [{ ...s.approvals[1]!, status: 'UNKNOWN' as const }] };
    expect(filterApprovals(u, { ...DEFAULT_APPROVAL_FILTER, view: 'open' })).toHaveLength(0);
    expect(filterApprovals(u, { ...DEFAULT_APPROVAL_FILTER, view: 'decided' })).toHaveLength(0);
    expect(filterApprovals(u, { ...DEFAULT_APPROVAL_FILTER, view: 'unknown' })).toHaveLength(1);
  });
  it('alerts by severity, human action and text', () => {
    const A = DEFAULT_ALERT_FILTER;
    expect(filterAlerts(s.alerts, { ...A, severity: 'WARNING' }).map((a) => a.id)).toEqual([
      'ALR-007',
    ]);
    expect(filterAlerts(s.alerts, { ...A, humanOnly: true }).map((a) => a.id)).toEqual(['ALR-008']);
    expect(filterAlerts(s.alerts, { ...A, q: 'runner' })).toHaveLength(1);
  });
  it('alert sorting: severity first by default; newest/oldest are exact reverses', () => {
    const rank = { CRITICAL: 0, WARNING: 1, UNKNOWN: 1, NOTICE: 2, INFO: 3 } as const;
    const bySeverity = filterAlerts(s.alerts, DEFAULT_ALERT_FILTER).map((a) => rank[a.severity]);
    expect(bySeverity).toEqual([...bySeverity].sort((a, b) => a - b));
    const newest = filterAlerts(s.alerts, { ...DEFAULT_ALERT_FILTER, sort: 'newest' });
    const times = newest.map((a) => a.raisedAt);
    expect(times).toEqual([...times].sort().reverse());
  });
  it('active filter count ignores sort', () => {
    expect(
      activeFilterCount({ ...DEFAULT_MISSION_FILTER, sort: 'priority' }, DEFAULT_MISSION_FILTER),
    ).toBe(0);
    expect(
      activeFilterCount(
        { ...DEFAULT_MISSION_FILTER, q: 'x', group: 'queued' },
        DEFAULT_MISSION_FILTER,
      ),
    ).toBe(2);
  });
});
