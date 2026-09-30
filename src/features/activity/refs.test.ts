import { describe, expect, it } from 'vitest';
import { buildSeedSnapshot } from '@/adapters/demo/seed';
import { restTestAdapter } from '@/test/adapters';
import { eventRefs } from './refs';

const s = buildSeedSnapshot(Date.parse('2026-09-30T12:00:00Z'));

describe('activity observability', () => {
  it('links only the approval/alert/artifact an event explicitly names', () => {
    const req = s.events.find((e) => e.kind === 'approval.requested')!;
    expect(eventRefs(req)).toEqual([expect.objectContaining({ kind: 'approval', id: 'APR-031' })]);
    const art = s.events.find((e) => e.kind === 'artifact.produced')!;
    expect(eventRefs(art)[0]).toMatchObject({ kind: 'artifact' });
    expect(eventRefs(art)[0]!.href).toContain(
      `focus=${art.kind === 'artifact.produced' ? art.payload.artifact.id : ''}`,
    );
    // Events without such ids get no invented links.
    const started = s.events.find((e) => e.kind === 'work.started')!;
    expect(eventRefs(started)).toEqual([]);
  });

  it('every event records how it was received, stamped by the adapter', async () => {
    expect(s.events.every((e) => e.via === 'simulated')).toBe(true);
    const { adapter } = restTestAdapter();
    const snap = await adapter.connect();
    expect(snap.events.length).toBeGreaterThan(0);
    expect(snap.events.every((e) => e.via === 'poll')).toBe(true);
  });

  it('the in-memory event log stays bounded', async () => {
    const { MAX_EVENTS } = await import('@/domain/snapshot');
    const { applyEvent } = await import('@/domain/reducer');
    let snap = s;
    for (let i = 0; i < MAX_EVENTS + 250; i++)
      snap = applyEvent(snap, {
        id: `bulk-${i}`,
        kind: 'task.progress',
        at: new Date(Date.parse(s.generatedAt) + i).toISOString(),
        missionId: 'AN-0142',
        workerId: 'w-ada',
        payload: { taskId: 'AN-0142-T2', progress: 0.5 },
      });
    expect(snap.events.length).toBe(MAX_EVENTS);
  });
});
