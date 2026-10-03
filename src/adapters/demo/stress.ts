import type { DashboardEvent } from '@/domain/events';
import type { DashboardSnapshot } from '@/domain/snapshot';
import { MAX_EVENTS } from '@/domain/snapshot';
import type { Alert, ApprovalRequest, Mission, Worker, WorkerState } from '@/domain/types';
import { createRng, pick } from './rng';
import { buildSeedSnapshot } from './seed';

export interface StressSize {
  workers: number;
  missions: number;
  events: number;
  alerts: number;
  approvals: number;
}

export const STRESS_DEFAULT: StressSize = {
  workers: 120,
  missions: 400,
  events: 5000,
  alerts: 40,
  approvals: 30,
};

const STATES: WorkerState[] = [
  'IDLE',
  'PLANNING',
  'WORKING',
  'WORKING',
  'WAITING',
  'BLOCKED',
  'REVIEWING',
  'CERTIFYING',
  'COMPLETE',
  'FAILED',
];
const HOMES = [
  'planning',
  'research',
  'build',
  'security',
  'review',
  'certification',
  'operations',
];
const CHARACTERS = ['bramwell', 'ada', 'otto', 'mina', 'cyrus', 'pim', 'hedda', 'rook', 'juniper'];

/**
 * Deterministic large dataset for performance and resilience testing. Clearly
 * demo data: provenance stays `demo`; every generated decision is `simulated`.
 */
export function buildStressSnapshot(
  nowMs: number,
  size: StressSize = STRESS_DEFAULT,
  seed = 7,
): DashboardSnapshot {
  const base = buildSeedSnapshot(nowMs);
  const rng = createRng(seed);
  const at = (ms: number) => new Date(nowMs - ms).toISOString();

  const workers: Worker[] = [...base.workers];
  for (let i = workers.length; i < size.workers; i++) {
    const state = pick(rng, STATES)!;
    workers.push({
      id: `w-s${i}`,
      name: `Crew ${String(i).padStart(3, '0')}`,
      role: 'Stress Worker',
      crewId: 'forge',
      characterId: pick(rng, CHARACTERS)!,
      homeRoomId: pick(rng, HOMES)!,
      state,
      stateSince: at(Math.floor(rng() * 3_600_000)),
      currentMissionId: undefined,
      progress: state === 'WORKING' ? Math.round(rng() * 100) / 100 : null,
      blockers:
        state === 'BLOCKED'
          ? [{ id: `blk-s${i}`, description: 'Waiting on upstream service', since: at(60_000) }]
          : [],
      capabilities: [{ id: 'code', label: 'Write code' }],
      authority: [],
    });
  }

  const statuses: Mission['status'][] = [
    'QUEUED',
    'ACTIVE',
    'ACTIVE',
    'WAITING_REVIEW',
    'BLOCKED',
    'COMPLETE',
    'COMPLETE',
    'FAILED',
  ];
  const missions: Mission[] = [...base.missions];
  for (let i = missions.length; i < size.missions; i++) {
    const id = `ST-${String(i).padStart(4, '0')}`;
    const status = pick(rng, statuses)!;
    const assignees = [pick(rng, workers)!.id];
    const started = status === 'QUEUED' ? undefined : at(Math.floor(rng() * 7_200_000));
    missions.push({
      id,
      // Synthetic load only: a separate block far above the demo's sequence.
      ordinal: 10_000 + i,
      title: `Stress mission ${i}`,
      objective: 'Synthetic load for performance testing.',
      status,
      priority: pick(rng, ['low', 'normal', 'normal', 'high', 'critical'] as const)!,
      assignedWorkerIds: assignees,
      createdAt: at(8_000_000 + i),
      startedAt: started,
      completedAt:
        status === 'COMPLETE' || status === 'FAILED' ? at(Math.floor(rng() * 600_000)) : undefined,
      estimate:
        rng() < 0.5 ? { durationMs: 3_600_000, source: 'Stress', confidence: 'low' } : undefined,
      progress: status === 'COMPLETE' ? 1 : Math.round(rng() * 100) / 100,
      dependsOn: [],
      tasks: [
        {
          id: `${id}-T1`,
          missionId: id,
          title: 'Synthetic task',
          status: 'IN_PROGRESS',
          dependsOn: [],
        },
      ],
      artifacts:
        rng() < 0.3
          ? [
              {
                id: `art-${id}`,
                missionId: id,
                producedBy: assignees[0],
                kind: 'code',
                title: `${id}.patch`,
                createdAt: at(1000),
              },
            ]
          : [],
      review: { id: `rev-${id}`, missionId: id, status: 'NOT_REQUESTED' },
      certification: 'NOT_REQUIRED',
      approvalIds: [],
      result:
        status === 'COMPLETE'
          ? { outcome: 'SUCCESS', summary: 'Synthetic completion.' }
          : status === 'FAILED'
            ? { outcome: 'FAILURE', summary: 'Synthetic failure.' }
            : undefined,
    });
  }
  for (const w of workers) {
    if (!w.currentMissionId && w.state !== 'IDLE')
      w.currentMissionId = missions.find((m) => m.assignedWorkerIds.includes(w.id))?.id;
  }

  const approvals: ApprovalRequest[] = [...base.approvals];
  for (let i = approvals.length; i < size.approvals; i++) {
    const requester = pick(rng, workers)!;
    approvals.push({
      id: `APR-S${i}`,
      title: `Synthetic request ${i}`,
      action: 'Synthetic action for load testing.',
      rationale: 'Stress dataset.',
      risk: pick(rng, ['low', 'medium', 'high', 'critical'] as const)!,
      reversible: rng() < 0.5,
      requestedBy: requester.id,
      requestedAt: at(Math.floor(rng() * 3_600_000)),
      status: 'PENDING',
      requiredAuthority: 'Founder #0007',
    });
  }

  const alerts: Alert[] = [...base.alerts];
  for (let i = alerts.length; i < size.alerts; i++) {
    alerts.push({
      id: `ALR-S${i}`,
      severity: pick(rng, ['INFO', 'NOTICE', 'WARNING'] as const)!,
      title: `Synthetic alert ${i}`,
      whatHappened: 'Stress dataset alert.',
      affected: [{ kind: 'system', id: 'stress', label: 'Stress' }],
      attention: 'None.',
      humanActionRequired: false,
      raisedAt: at(Math.floor(rng() * 3_600_000)),
    });
  }

  const events: DashboardEvent[] = [];
  for (let i = 0; i < size.events; i++) {
    const w = pick(rng, workers)!;
    events.push({
      id: `sev-${i}`,
      kind: 'worker.state_changed',
      at: at((size.events - i) * 700),
      workerId: w.id,
      missionId: w.currentMissionId,
      payload: { state: w.state, activity: 'Synthetic activity' },
    });
  }

  return { ...base, workers, missions, approvals, alerts, events: events.slice(-MAX_EVENTS) };
}
