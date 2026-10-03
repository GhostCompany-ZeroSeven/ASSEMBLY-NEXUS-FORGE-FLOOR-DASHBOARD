import type { DashboardEvent } from '@/domain/events';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type { ApprovalDecision, Mission, SystemHealth } from '@/domain/types';
import { pick } from './rng';

/**
 * The demo "story". Each beat is evaluated lazily against the current
 * snapshot so it can react to what the human did (e.g. approval decisions).
 *
 * The script NEVER decides approvals: approval requests stay pending until the
 * human operator acts in the UI.
 */
export interface BeatContext {
  snapshot: DashboardSnapshot;
  at: string;
  rng: () => number;
  nextId: (prefix: string) => string;
}

/** A beat returns event drafts (without ids/timestamps). */
export type EventDraft = DashboardEvent extends infer E
  ? E extends DashboardEvent
    ? Omit<E, 'id' | 'at'>
    : never
  : never;

export type Beat = (ctx: BeatContext) => EventDraft[];

const state = (
  workerId: string,
  s:
    | 'IDLE'
    | 'PLANNING'
    | 'WORKING'
    | 'WAITING'
    | 'REVIEWING'
    | 'CERTIFYING'
    | 'COMPLETE'
    | 'STOPPED',
  activity?: string,
  missionId?: string,
  progress?: number | null,
): EventDraft => ({
  kind: 'worker.state_changed',
  workerId,
  missionId,
  payload: { state: s, activity, progress },
});

const progress = (
  missionId: string,
  workerId: string,
  taskId: string,
  p: number,
  missionProgress?: number,
): EventDraft => ({
  kind: 'task.progress',
  missionId,
  workerId,
  payload: { taskId, progress: p, missionProgress },
});

function healthWith(
  snapshot: DashboardSnapshot,
  at: string,
  componentId: string,
  patch: Partial<SystemHealth['components'][number]>,
): SystemHealth {
  const components = snapshot.health.components.map((c) =>
    c.id === componentId ? { ...c, ...patch } : c,
  );
  const status = components.some((c) => c.status === 'CRITICAL')
    ? 'CRITICAL'
    : components.some((c) => c.status === 'DEGRADED')
      ? 'DEGRADED'
      : 'NOMINAL';
  return { status, checkedAt: at, components };
}

/** Scripted opening sequence, played once in order. */
export const OPENING_SCRIPT: Beat[] = [
  () => [progress('AN-0142', 'w-ada', 'AN-0142-T2', 0.64, 0.62)],
  () => [state('w-mina', 'WORKING', 'Benchmarking SSE vs WebSocket fan-out', 'AN-0145', 0.38)],
  ({ at }) => [
    {
      kind: 'artifact.produced',
      missionId: 'AN-0142',
      workerId: 'w-otto',
      payload: {
        artifact: {
          id: 'art-0142-2',
          missionId: 'AN-0142',
          producedBy: 'w-otto',
          kind: 'code',
          title: 'ingest-backpressure.ts',
          summary: 'Bounded queue with replay cursor.',
          createdAt: at,
        },
      },
    },
    progress('AN-0142', 'w-otto', 'AN-0142-T3', 0.55, 0.68),
  ],
  () => [
    {
      kind: 'review.passed',
      missionId: 'AN-0143',
      workerId: 'w-pim',
      payload: { summary: 'Contract shapes consistent; two nits resolved.' },
    },
    state('w-pim', 'IDLE', 'Review queue clear', undefined, null),
  ],
  ({ at }) => [
    {
      kind: 'approval.requested',
      missionId: 'AN-0143',
      workerId: 'w-juniper',
      payload: {
        request: {
          id: 'APR-032',
          title: 'Merge adapter contract to main',
          action: 'Merge the reviewed adapter contract changes into the main branch.',
          rationale: 'Review passed (Pim Calloway). Contract tests green.',
          risk: 'medium',
          reversible: true,
          missionId: 'AN-0143',
          requestedBy: 'w-juniper',
          requestedAt: at,
          status: 'PENDING',
          requiredAuthority: 'Founder #0007',
        },
      },
    },
    {
      kind: 'worker.blocked',
      workerId: 'w-juniper',
      missionId: 'AN-0143',
      payload: {
        blocker: {
          id: 'blk-apr-032',
          description: 'Needs human approval: merge adapter contract (APR-032)',
          dependsOn: { kind: 'approval', id: 'APR-032' },
          since: at,
        },
      },
    },
    state('w-juniper', 'WAITING', 'Waiting at the Founder Gate: merge approval', 'AN-0143', null),
  ],
  () => [progress('AN-0142', 'w-ada', 'AN-0142-T2', 0.74, 0.7)],
  ({ at, snapshot }) => [
    {
      kind: 'alert.raised',
      missionId: 'AN-0146',
      workerId: 'w-hedda',
      payload: {
        alert: {
          id: 'ALR-009',
          severity: 'CRITICAL',
          title: 'Certification sandbox integrity check failed',
          whatHappened:
            'The sandbox image hash no longer matches the signed baseline. Certification results since the last check cannot be trusted.',
          affected: [
            { kind: 'mission', id: 'AN-0146', label: 'AN-0146 Certify RC 0.9' },
            { kind: 'worker', id: 'w-hedda', label: 'Hedda Crucible' },
            { kind: 'system', id: 'cert-sandbox', label: 'Certification sandbox' },
          ],
          attention:
            'Certification is halted. Ops is isolating the sandbox. Confirm whether RC 0.9 certification should restart from scratch.',
          humanActionRequired: true,
          raisedAt: at,
        },
      },
    },
    {
      kind: 'worker.blocked',
      missionId: 'AN-0146',
      workerId: 'w-hedda',
      payload: {
        blocker: {
          id: 'blk-sandbox',
          description: 'Certification sandbox failed integrity check',
          dependsOn: { kind: 'external', id: 'cert-sandbox' },
          since: at,
        },
      },
    },
    {
      kind: 'health.updated',
      payload: {
        health: healthWith(snapshot, at, 'cert-sandbox', {
          status: 'CRITICAL',
          detail: 'Image hash mismatch',
        }),
      },
    },
  ],
  () => [state('w-rook', 'WORKING', 'Isolating the certification sandbox', 'AN-0146')],
  () => [progress('AN-0145', 'w-mina', 'AN-0145-T1', 0.52, 0.5)],
  ({ at }) => [
    {
      kind: 'artifact.produced',
      missionId: 'AN-0141',
      workerId: 'w-bramwell',
      payload: {
        artifact: {
          id: 'art-0141-1',
          missionId: 'AN-0141',
          producedBy: 'w-bramwell',
          kind: 'document',
          title: 'q4-roadmap-draft.md',
          createdAt: at,
        },
      },
    },
    {
      kind: 'task.completed',
      missionId: 'AN-0141',
      workerId: 'w-bramwell',
      payload: { taskId: 'AN-0141-T2' },
    },
    {
      kind: 'review.requested',
      missionId: 'AN-0141',
      workerId: 'w-bramwell',
      payload: { reviewerId: 'w-pim' },
    },
    state('w-bramwell', 'WAITING', 'Roadmap draft out for review', 'AN-0141', null),
    state('w-pim', 'REVIEWING', 'Reviewing Q4 roadmap draft', 'AN-0141', 0.1),
  ],
  () => [
    progress('AN-0142', 'w-ada', 'AN-0142-T2', 0.86, 0.8),
    progress('AN-0142', 'w-otto', 'AN-0142-T3', 0.72),
  ],
  ({ at, snapshot }) => [
    {
      kind: 'health.updated',
      payload: {
        health: healthWith(snapshot, at, 'cert-sandbox', {
          status: 'NOMINAL',
          detail: 'Restored from signed image',
        }),
      },
    },
    { kind: 'alert.resolved', payload: { alertId: 'ALR-009' } },
    {
      kind: 'worker.unblocked',
      workerId: 'w-hedda',
      missionId: 'AN-0146',
      payload: { blockerId: 'blk-sandbox' },
    },
    state(
      'w-hedda',
      'CERTIFYING',
      'Restarting certification from a clean sandbox',
      'AN-0146',
      0.05,
    ),
    state('w-rook', 'IDLE', 'Sandbox restored; back on call', undefined, null),
  ],
  ({ at }) => [
    {
      kind: 'mission.created',
      missionId: 'AN-0149',
      payload: {
        mission: newMission(
          'AN-0149',
          149,
          'Worker avatar asset pipeline',
          'Load production character art through the character registry.',
          at,
          25 * 60_000,
        ),
      },
    },
    {
      kind: 'worker.assigned',
      missionId: 'AN-0149',
      workerId: 'w-rook',
      payload: { taskId: 'AN-0149-T1' },
    },
    {
      kind: 'work.started',
      missionId: 'AN-0149',
      workerId: 'w-rook',
      payload: { taskId: 'AN-0149-T1', activity: 'Provisioning the asset bucket layout' },
    },
  ],
  () => [
    {
      kind: 'task.completed',
      missionId: 'AN-0142',
      workerId: 'w-ada',
      payload: { taskId: 'AN-0142-T2' },
    },
    progress('AN-0142', 'w-otto', 'AN-0142-T3', 0.9, 0.93),
    state('w-ada', 'WORKING', 'Pairing with Otto on replay tests', 'AN-0142', 0.9),
  ],
  () => [
    {
      kind: 'review.passed',
      missionId: 'AN-0141',
      workerId: 'w-pim',
      payload: { summary: 'Roadmap sequencing is sound.' },
    },
    {
      kind: 'mission.completed',
      missionId: 'AN-0141',
      workerId: 'w-bramwell',
      payload: {
        result: {
          outcome: 'SUCCESS',
          summary: 'Q4 roadmap drafted and reviewed.',
          nextAction: 'Founder review of roadmap priorities.',
        },
      },
    },
    state('w-bramwell', 'COMPLETE', 'Roadmap delivered', 'AN-0141', 1),
    state('w-pim', 'IDLE', 'Review queue clear', undefined, null),
  ],
  () => [
    {
      kind: 'task.completed',
      missionId: 'AN-0142',
      workerId: 'w-otto',
      payload: { taskId: 'AN-0142-T3' },
    },
    {
      kind: 'review.requested',
      missionId: 'AN-0142',
      workerId: 'w-ada',
      payload: { reviewerId: 'w-pim' },
    },
    state('w-pim', 'REVIEWING', 'Reviewing telemetry ingest', 'AN-0142', 0.2),
    state('w-ada', 'WAITING', 'Waiting on review', 'AN-0142', null),
    state('w-otto', 'WAITING', 'Waiting on review', 'AN-0142', null),
  ],
  () => [
    state('w-bramwell', 'IDLE', 'Coffee', undefined, null),
    progress('AN-0145', 'w-mina', 'AN-0145-T1', 0.71, 0.7),
  ],
  () => [
    {
      kind: 'review.passed',
      missionId: 'AN-0142',
      workerId: 'w-pim',
      payload: { summary: 'Replay semantics verified.' },
    },
    state('w-pim', 'IDLE', 'Review queue clear', undefined, null),
    state('w-hedda', 'CERTIFYING', 'Certifying telemetry ingest', 'AN-0142', 0.5),
  ],
  ({ at }) => [
    {
      kind: 'certification.updated',
      missionId: 'AN-0142',
      workerId: 'w-hedda',
      payload: { status: 'CERTIFIED' },
    },
    {
      kind: 'artifact.produced',
      missionId: 'AN-0142',
      workerId: 'w-hedda',
      payload: {
        artifact: {
          id: 'art-0142-3',
          missionId: 'AN-0142',
          producedBy: 'w-hedda',
          kind: 'report',
          title: 'Certification report — telemetry ingest',
          createdAt: at,
        },
      },
    },
    {
      kind: 'mission.completed',
      missionId: 'AN-0142',
      workerId: 'w-ada',
      payload: {
        result: {
          outcome: 'SUCCESS',
          summary: 'Telemetry ingest live on the event bus with bounded backpressure and replay.',
          nextAction: 'Point the Forge Floor at the telemetry stream once a live adapter exists.',
        },
      },
    },
    state('w-ada', 'COMPLETE', 'Telemetry ingest shipped', 'AN-0142', 1),
    state('w-otto', 'COMPLETE', 'Telemetry ingest shipped', 'AN-0142', 1),
    state('w-hedda', 'CERTIFYING', 'Resuming RC 0.9 certification', 'AN-0146', 0.3),
  ],
  () => [
    {
      kind: 'worker.assigned',
      missionId: 'AN-0148',
      workerId: 'w-kestrel',
      payload: { taskId: 'AN-0148-T1' },
    },
    {
      kind: 'work.started',
      missionId: 'AN-0148',
      workerId: 'w-kestrel',
      payload: { taskId: 'AN-0148-T1', activity: 'Perimeter sweep (reserved crew placeholder)' },
    },
  ],
  () => [
    state('w-ada', 'IDLE', 'Recharging', undefined, null),
    state('w-otto', 'IDLE', 'Recharging', undefined, null),
  ],
  ({ at }) => [
    {
      kind: 'artifact.produced',
      missionId: 'AN-0145',
      workerId: 'w-mina',
      payload: {
        artifact: {
          id: 'art-0145-1',
          missionId: 'AN-0145',
          producedBy: 'w-mina',
          kind: 'report',
          title: 'Transport recommendation',
          summary:
            'Start with polling; add SSE for push; WebSocket only for bidirectional control.',
          createdAt: at,
        },
      },
    },
    {
      kind: 'mission.completed',
      missionId: 'AN-0145',
      workerId: 'w-mina',
      payload: {
        result: {
          outcome: 'SUCCESS',
          summary: 'Recommendation: polling first, SSE for push, WebSocket for control.',
          nextAction: 'Use this to choose the first live adapter transport.',
        },
      },
    },
    state('w-mina', 'COMPLETE', 'Report delivered', 'AN-0145', 1),
  ],
  () => [
    progress('AN-0146', 'w-hedda', 'AN-0146-T1', 0.7, 0.7),
    state('w-mina', 'IDLE', 'Reading papers', undefined, null),
  ],
  () => [
    {
      kind: 'certification.updated',
      missionId: 'AN-0146',
      workerId: 'w-hedda',
      payload: { status: 'CERTIFIED' },
    },
    {
      kind: 'mission.completed',
      missionId: 'AN-0146',
      workerId: 'w-hedda',
      payload: {
        result: {
          outcome: 'SUCCESS',
          summary: 'RC 0.9 certified on a clean sandbox.',
          nextAction: 'Release decision belongs to the Founder.',
        },
      },
    },
    state('w-hedda', 'COMPLETE', 'RC 0.9 certified', 'AN-0146', 1),
  ],
];

/** Follow-up beats triggered by a human approval decision. */
export function reactionsForDecision(approvalId: string, decision: ApprovalDecision): Beat[] {
  const plan: Record<string, Partial<Record<ApprovalDecision, Beat[]>>> = {
    'APR-031': {
      APPROVE: [
        () => [
          {
            kind: 'worker.unblocked',
            workerId: 'w-cyrus',
            missionId: 'AN-0144',
            payload: { blockerId: 'blk-apr-031' },
          },
          state('w-cyrus', 'WORKING', 'Rotating staging deploy key (simulated)', 'AN-0144', 0.2),
        ],
        () => [progress('AN-0144', 'w-cyrus', 'AN-0144-T2', 0.7, 0.8)],
        () => [
          {
            kind: 'task.completed',
            missionId: 'AN-0144',
            workerId: 'w-cyrus',
            payload: { taskId: 'AN-0144-T2' },
          },
          {
            kind: 'mission.completed',
            missionId: 'AN-0144',
            workerId: 'w-cyrus',
            payload: {
              result: {
                outcome: 'SUCCESS',
                summary: 'Staging deploy key rotated (simulated) and runbook published.',
                nextAction: 'Schedule the next rotation in 90 days.',
              },
            },
          },
          state('w-cyrus', 'COMPLETE', 'Rotation complete', 'AN-0144', 1),
          { kind: 'alert.resolved', payload: { alertId: 'ALR-008' } },
        ],
      ],
      DENY: [
        () => [
          state(
            'w-cyrus',
            'STOPPED',
            'Rotation denied by human authority; standing down',
            'AN-0144',
            null,
          ),
          { kind: 'alert.resolved', payload: { alertId: 'ALR-008' } },
        ],
      ],
      HOLD: [() => [state('w-cyrus', 'WAITING', 'On hold at the Founder Gate', 'AN-0144', null)]],
    },
    'APR-032': {
      APPROVE: [
        () => [
          {
            kind: 'worker.unblocked',
            workerId: 'w-juniper',
            missionId: 'AN-0143',
            payload: { blockerId: 'blk-apr-032' },
          },
          state('w-juniper', 'WORKING', 'Merging adapter contract (simulated)', 'AN-0143', 0.5),
        ],
        () => [
          {
            kind: 'mission.completed',
            missionId: 'AN-0143',
            workerId: 'w-juniper',
            payload: {
              result: {
                outcome: 'SUCCESS',
                summary: 'Adapter contract merged (simulated).',
                nextAction: 'Publish adapter authoring guide.',
              },
            },
          },
          state('w-juniper', 'COMPLETE', 'Contract merged', 'AN-0143', 1),
        ],
      ],
      DENY: [
        () => [state('w-juniper', 'STOPPED', 'Merge denied; changes parked', 'AN-0143', null)],
      ],
      HOLD: [() => [state('w-juniper', 'WAITING', 'On hold at the Founder Gate', 'AN-0143', null)]],
    },
  };
  return plan[approvalId]?.[decision] ?? [];
}

const ROUTINE_TITLES = [
  ['Flaky test triage', 'Identify and fix intermittently failing tests.'],
  ['Docs sweep', 'Refresh stale documentation pages.'],
  ['Log noise reduction', 'Downgrade chatty log lines and add structure.'],
  ['Dependency bump', 'Apply patch-level dependency updates and rerun tests.'],
  ['Dashboard a11y audit', 'Audit contrast, focus order and labels.'],
  ['Cache warmup job', 'Pre-warm build caches before nightly runs.'],
] as const;

/**
 * Procedurally generated routine mission, used after the opening script so
 * the demo keeps moving. Deterministic given the adapter seed.
 */
export function routineMissionBeats(ctx: BeatContext, missionNumber: number): Beat[] {
  const idle = ctx.snapshot.workers.filter(
    (w) => w.crewId === 'forge' && (w.state === 'IDLE' || w.state === 'COMPLETE'),
  );
  const worker = pick(ctx.rng, idle);
  const reviewer = ctx.snapshot.workers.find((w) => w.id === 'w-pim');
  const [title, objective] = pick(ctx.rng, ROUTINE_TITLES) ?? ROUTINE_TITLES[0];
  const id = `AN-${String(missionNumber).padStart(4, '0')}`;
  const taskId = `${id}-T1`;
  if (!worker) return [() => []];
  const w = worker.id;
  const estimate = ctx.rng() < 0.6 ? Math.round(10 + ctx.rng() * 30) * 60_000 : undefined;

  return [
    ({ at }) => [
      {
        kind: 'mission.created',
        missionId: id,
        payload: { mission: newMission(id, missionNumber, title, objective, at, estimate) },
      },
      { kind: 'worker.assigned', missionId: id, workerId: w, payload: { taskId } },
      state(w, 'PLANNING', `Planning: ${title}`, id, 0),
    ],
    () => [
      { kind: 'work.started', missionId: id, workerId: w, payload: { taskId, activity: title } },
    ],
    () => [progress(id, w, taskId, 0.35, 0.3)],
    ({ at }) => [
      progress(id, w, taskId, 0.7, 0.65),
      {
        kind: 'artifact.produced',
        missionId: id,
        workerId: w,
        payload: {
          artifact: {
            id: `art-${id}-1`,
            missionId: id,
            producedBy: w,
            kind: 'code',
            title: `${title.toLowerCase().replace(/\s+/g, '-')}.patch`,
            createdAt: at,
          },
        },
      },
    ],
    () => [
      { kind: 'task.completed', missionId: id, workerId: w, payload: { taskId } },
      {
        kind: 'review.requested',
        missionId: id,
        workerId: w,
        payload: { reviewerId: reviewer?.id },
      },
      state(w, 'WAITING', 'Waiting on review', id, null),
      ...(reviewer && reviewer.state === 'IDLE'
        ? [state(reviewer.id, 'REVIEWING', `Reviewing ${id}`, id, 0.3)]
        : []),
    ],
    ({ rng }) => {
      const pass = rng() < 0.85;
      const out: EventDraft[] = [
        pass
          ? {
              kind: 'review.passed',
              missionId: id,
              workerId: reviewer?.id,
              payload: { summary: 'Looks good.' },
            }
          : {
              kind: 'review.failed',
              missionId: id,
              workerId: reviewer?.id,
              payload: { summary: 'Changes requested.', findings: ['Missing test for edge case'] },
            },
        pass
          ? {
              kind: 'mission.completed',
              missionId: id,
              workerId: w,
              payload: {
                result: {
                  outcome: 'SUCCESS',
                  summary: `${title} done.`,
                  nextAction: 'None required.',
                },
              },
            }
          : {
              kind: 'mission.failed',
              missionId: id,
              workerId: w,
              payload: {
                result: {
                  outcome: 'FAILURE',
                  summary: 'Review rejected the change.',
                  nextAction: 'Re-plan and retry.',
                },
              },
            },
        state(
          w,
          pass ? 'COMPLETE' : 'IDLE',
          pass ? `${title} complete` : 'Regrouping after review',
          id,
          pass ? 1 : null,
        ),
      ];
      if (reviewer) out.push(state(reviewer.id, 'IDLE', 'Review queue clear', undefined, null));
      return out;
    },
    () => [state(w, 'IDLE', 'Recharging', undefined, null)],
  ];
}

/**
 * A mission the demo simulation creates. The demo is the (simulated) mission
 * store here, so it assigns the next lifetime ordinal itself; a real
 * ecosystem's store does that for live data, never the dashboard.
 */
export function newMission(
  id: string,
  ordinal: number,
  title: string,
  objective: string,
  at: string,
  estimateMs?: number,
): Mission {
  return {
    id,
    ordinal,
    title,
    objective,
    status: 'QUEUED',
    priority: 'normal',
    assignedWorkerIds: [],
    createdAt: at,
    estimate: estimateMs
      ? { durationMs: estimateMs, source: 'Demo planner', confidence: 'low' }
      : undefined,
    progress: 0,
    dependsOn: [],
    tasks: [{ id: `${id}-T1`, missionId: id, title, status: 'PENDING', dependsOn: [] }],
    artifacts: [],
    review: { id: `rev-${id}`, missionId: id, status: 'NOT_REQUESTED' },
    certification: 'NOT_REQUIRED',
    approvalIds: [],
  };
}
