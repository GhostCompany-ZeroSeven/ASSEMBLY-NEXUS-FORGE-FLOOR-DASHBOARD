import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import type { DashboardEvent } from './events';
import { applyEvent, applyEvents } from './reducer';
import { MAX_EVENTS } from './snapshot';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const at = new Date(NOW).toISOString();
const seed = () => buildSeedSnapshot(NOW);

describe('applyEvent', () => {
  it('is idempotent on event id', () => {
    const e: DashboardEvent = {
      id: 'x1',
      kind: 'alert.resolved',
      at,
      payload: { alertId: 'ALR-007' },
    };
    const once = applyEvent(seed(), e);
    expect(applyEvent(once, e)).toBe(once);
  });

  it('moves a worker to WORKING and the mission to ACTIVE on work.started', () => {
    const s = applyEvents(seed(), [
      {
        id: 'a',
        kind: 'worker.assigned',
        at,
        missionId: 'AN-0147',
        workerId: 'w-rook',
        payload: { taskId: 'AN-0147-T1' },
      },
      {
        id: 'b',
        kind: 'work.started',
        at,
        missionId: 'AN-0147',
        workerId: 'w-rook',
        payload: { taskId: 'AN-0147-T1' },
      },
    ]);
    const m = s.missions.find((x) => x.id === 'AN-0147')!;
    const w = s.workers.find((x) => x.id === 'w-rook')!;
    expect(m.status).toBe('ACTIVE');
    expect(m.startedAt).toBe(at);
    expect(m.assignedWorkerIds).toContain('w-rook');
    expect(m.tasks[0]!.status).toBe('IN_PROGRESS');
    expect(w.state).toBe('WORKING');
    expect(w.stateSince).toBe(at);
    expect(w.currentMissionId).toBe('AN-0147');
    expect(w.lastEventId).toBe('b');
  });

  it('gates a mission on approval and releases it only when all approvals are granted', () => {
    let s = seed();
    expect(s.missions.find((m) => m.id === 'AN-0144')!.status).toBe('WAITING_APPROVAL');
    s = applyEvent(s, {
      id: 'd1',
      kind: 'approval.decided',
      at,
      payload: {
        approvalId: 'APR-031',
        record: {
          decision: 'APPROVE',
          decidedBy: 'Founder #0007',
          decidedAt: at,
          delivery: 'simulated',
        },
      },
    });
    expect(s.approvals.find((a) => a.id === 'APR-031')!.status).toBe('APPROVED');
    expect(s.missions.find((m) => m.id === 'AN-0144')!.status).toBe('ACTIVE');
  });

  it('blocks the mission when an approval is denied', () => {
    const s = applyEvent(seed(), {
      id: 'd2',
      kind: 'approval.decided',
      at,
      payload: {
        approvalId: 'APR-031',
        record: {
          decision: 'DENY',
          decidedBy: 'Founder #0007',
          decidedAt: at,
          delivery: 'simulated',
        },
      },
    });
    expect(s.missions.find((m) => m.id === 'AN-0144')!.status).toBe('BLOCKED');
    expect(s.approvals.find((a) => a.id === 'APR-031')!.status).toBe('DENIED');
  });

  it('HOLD keeps the mission waiting', () => {
    const s = applyEvent(seed(), {
      id: 'd3',
      kind: 'approval.decided',
      at,
      payload: {
        approvalId: 'APR-031',
        record: {
          decision: 'HOLD',
          decidedBy: 'Founder #0007',
          decidedAt: at,
          delivery: 'simulated',
        },
      },
    });
    expect(s.approvals.find((a) => a.id === 'APR-031')!.status).toBe('HELD');
    expect(s.missions.find((m) => m.id === 'AN-0144')!.status).toBe('WAITING_APPROVAL');
  });

  it('unblocking the last blocker resumes a BLOCKED worker', () => {
    const blocked = applyEvent(seed(), {
      id: 'b1',
      kind: 'worker.blocked',
      at,
      workerId: 'w-ada',
      payload: { blocker: { id: 'bk', description: 'x', since: at } },
    });
    expect(blocked.workers.find((w) => w.id === 'w-ada')!.state).toBe('BLOCKED');
    const resumed = applyEvent(blocked, {
      id: 'b2',
      kind: 'worker.unblocked',
      at,
      workerId: 'w-ada',
      payload: { blockerId: 'bk' },
    });
    const ada = resumed.workers.find((w) => w.id === 'w-ada')!;
    expect(ada.state).toBe('WORKING');
    expect(ada.blockers).toHaveLength(0);
  });

  it('records mission completion with result and full progress', () => {
    const s = applyEvent(seed(), {
      id: 'c1',
      kind: 'mission.completed',
      at,
      missionId: 'AN-0142',
      payload: { result: { outcome: 'SUCCESS', summary: 'done' } },
    });
    const m = s.missions.find((x) => x.id === 'AN-0142')!;
    expect(m.status).toBe('COMPLETE');
    expect(m.completedAt).toBe(at);
    expect(m.progress).toBe(1);
    expect(m.result?.summary).toBe('done');
  });

  it('does not reopen a finished mission on late review/approval events', () => {
    const s = applyEvent(seed(), {
      id: 'r1',
      kind: 'review.requested',
      at,
      missionId: 'AN-0139',
      payload: {},
    });
    expect(s.missions.find((m) => m.id === 'AN-0139')!.status).toBe('COMPLETE');
  });

  it('bounds the event log', () => {
    let s = seed();
    for (let i = 0; i < MAX_EVENTS + 20; i++) {
      s = applyEvent(s, { id: `p${i}`, kind: 'health.updated', at, payload: { health: s.health } });
    }
    expect(s.events).toHaveLength(MAX_EVENTS);
    expect(s.events.at(-1)!.id).toBe(`p${MAX_EVENTS + 19}`);
  });

  it('ignores events referring to unknown entities', () => {
    const before = seed();
    const after = applyEvent(before, {
      id: 'u',
      kind: 'task.completed',
      at,
      missionId: 'NOPE',
      payload: { taskId: 'x' },
    });
    expect(after.missions).toBe(before.missions);
  });
});
