import { describe, expect, it } from 'vitest';
import type { DashboardEvent } from '@/domain/events';
import { arrivedOutOfOrder, filterEvents, timelineOrder } from './filter';

const ev = (id: string, at: string, receivedAt?: string, via?: DashboardEvent['via']) =>
  ({ id, kind: 'task.completed', at, receivedAt, via, payload: { taskId: 't' } }) as DashboardEvent;

describe('operations timeline', () => {
  it('filters by event time range and ingest path', () => {
    const es = [
      ev('a', '2026-09-30T10:00:00Z', undefined, 'poll'),
      ev('b', '2026-09-30T11:30:00Z', undefined, 'stream'),
    ];
    expect(filterEvents(es, { since: '2026-09-30T11:00:00Z' }).map((e) => e.id)).toEqual(['b']);
    expect(filterEvents(es, { via: 'poll' }).map((e) => e.id)).toEqual(['a']);
  });

  it('orders by event time, not arrival; ties keep arrival order', () => {
    const es = [
      ev('late', '2026-09-30T10:00:00Z'),
      ev('x', '2026-09-30T11:00:00Z'),
      ev('y', '2026-09-30T11:00:00Z'),
    ];
    expect(timelineOrder(es).map((e) => e.id)).toEqual(['y', 'x', 'late']);
  });

  it('flags events that arrived after a later-timestamped one; history batches are not flagged', () => {
    const es = [
      ev('h1', '2026-09-30T08:00:00Z', '2026-09-30T12:00:00Z'),
      ev('h2', '2026-09-30T09:00:00Z', '2026-09-30T12:00:00Z'),
      ev('new', '2026-09-30T12:00:05Z', '2026-09-30T12:00:06Z'),
      ev('delayed', '2026-09-30T12:00:01Z', '2026-09-30T12:00:09Z'),
      ev('unknown-arrival', '2026-09-30T07:00:00Z'),
    ];
    expect([...arrivedOutOfOrder(es)]).toEqual(['delayed']);
  });
});
