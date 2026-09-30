import type { DashboardEvent } from '@/domain/events';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type {
  Capability,
  DataProvenance,
  Mission,
  Review,
  SystemHealth,
  Task,
  Worker,
  WorkerMessage,
} from '@/domain/types';

/**
 * Deterministic seed scenario for the demo adapter. All timestamps are offsets
 * from `nowMs`, so the scenario always looks "current" but is reproducible.
 * Every name, mission and number here is fictional demo data.
 */

export const DEMO_PROVENANCE: DataProvenance = {
  mode: 'demo',
  adapterId: 'demo',
  adapterLabel: 'Local Demo Simulation',
  verifiedBackend: false,
  note: 'Simulated data generated in your browser. No backend is connected.',
};

const MIN = 60_000;
const HOUR = 60 * MIN;

const cap = (id: string, label: string): Capability => ({ id, label });

const CAPS = {
  plan: cap('plan', 'Mission planning'),
  code: cap('code', 'Write code'),
  build: cap('build', 'Run builds'),
  test: cap('test', 'Run tests'),
  research: cap('research', 'Research & benchmarks'),
  review: cap('review', 'Code review'),
  certify: cap('certify', 'Certification checks'),
  secrets: cap('secrets.read-metadata', 'Inspect secret metadata'),
  ops: cap('ops', 'Operate infrastructure'),
  recon: cap('recon', 'Perimeter reconnaissance'),
};

function noReview(missionId: string): Review {
  return { id: `rev-${missionId}`, missionId, status: 'NOT_REQUESTED' };
}

export function buildSeedSnapshot(nowMs: number): DashboardSnapshot {
  const at = (offsetMs: number) => new Date(nowMs + offsetMs).toISOString();

  const worker = (
    w: Omit<Worker, 'blockers' | 'authority' | 'stateSince'> &
      Partial<Pick<Worker, 'blockers' | 'authority'>> & { sinceMs: number },
  ): Worker => {
    const { sinceMs, ...rest } = w;
    return { blockers: [], authority: [], stateSince: at(-sinceMs), ...rest };
  };

  const task = (
    missionId: string,
    n: number,
    title: string,
    status: Task['status'],
    extra: Partial<Task> = {},
  ): Task => ({ id: `${missionId}-T${n}`, missionId, title, status, dependsOn: [], ...extra });

  const workers: Worker[] = [
    worker({
      id: 'w-bramwell',
      name: 'Bramwell Quench',
      role: 'Lead Planner',
      crewId: 'forge',
      characterId: 'bramwell',
      homeRoomId: 'planning',
      state: 'PLANNING',
      sinceMs: 22 * MIN,
      currentMissionId: 'AN-0141',
      currentTaskId: 'AN-0141-T2',
      currentActivity: 'Sequencing Q4 operations milestones',
      progress: 0.4,
      capabilities: [CAPS.plan, CAPS.research],
    }),
    worker({
      id: 'w-ada',
      name: 'Ada Sprocket',
      role: 'Build Engineer',
      crewId: 'forge',
      characterId: 'ada',
      homeRoomId: 'build',
      state: 'WORKING',
      sinceMs: 71 * MIN,
      currentMissionId: 'AN-0142',
      currentTaskId: 'AN-0142-T2',
      currentActivity: 'Wiring telemetry ingest into the event bus',
      progress: 0.58,
      capabilities: [CAPS.code, CAPS.build, CAPS.test],
    }),
    worker({
      id: 'w-otto',
      name: 'Otto Ferrule',
      role: 'Build Engineer',
      crewId: 'forge',
      characterId: 'otto',
      homeRoomId: 'build',
      state: 'WORKING',
      sinceMs: 64 * MIN,
      currentMissionId: 'AN-0142',
      currentTaskId: 'AN-0142-T3',
      currentActivity: 'Hardening ingest backpressure',
      progress: 0.35,
      capabilities: [CAPS.code, CAPS.build],
    }),
    worker({
      id: 'w-mina',
      name: 'Mina Voltz',
      role: 'Research Scientist',
      crewId: 'forge',
      characterId: 'mina',
      homeRoomId: 'research',
      state: 'WORKING',
      sinceMs: 40 * MIN,
      currentMissionId: 'AN-0145',
      currentTaskId: 'AN-0145-T1',
      currentActivity: 'Comparing SSE and WebSocket fan-out',
      progress: 0.3,
      capabilities: [CAPS.research, CAPS.code],
    }),
    worker({
      id: 'w-cyrus',
      name: 'Cyrus Anvil',
      role: 'Security Warden',
      crewId: 'forge',
      characterId: 'cyrus',
      homeRoomId: 'security',
      state: 'WAITING',
      sinceMs: 18 * MIN,
      currentMissionId: 'AN-0144',
      currentTaskId: 'AN-0144-T2',
      currentActivity: 'Waiting at the Founder Gate for key-rotation approval',
      progress: null,
      capabilities: [CAPS.secrets, CAPS.review],
      blockers: [
        {
          id: 'blk-apr-031',
          description: 'Needs human approval: rotate staging deploy key (APR-031)',
          dependsOn: { kind: 'approval', id: 'APR-031' },
          since: at(-18 * MIN),
        },
      ],
    }),
    worker({
      id: 'w-pim',
      name: 'Pim Calloway',
      role: 'Reviewer',
      crewId: 'forge',
      characterId: 'pim',
      homeRoomId: 'review',
      state: 'REVIEWING',
      sinceMs: 26 * MIN,
      currentMissionId: 'AN-0143',
      currentActivity: 'Reviewing adapter contract changes',
      progress: 0.7,
      capabilities: [CAPS.review, CAPS.test],
    }),
    worker({
      id: 'w-hedda',
      name: 'Hedda Crucible',
      role: 'Certification Officer',
      crewId: 'forge',
      characterId: 'hedda',
      homeRoomId: 'certification',
      state: 'CERTIFYING',
      sinceMs: 33 * MIN,
      currentMissionId: 'AN-0146',
      currentTaskId: 'AN-0146-T1',
      currentActivity: 'Running release-candidate certification suite',
      progress: 0.45,
      capabilities: [CAPS.certify, CAPS.test],
    }),
    worker({
      id: 'w-rook',
      name: 'Rook Tallow',
      role: 'Operations',
      crewId: 'forge',
      characterId: 'rook',
      homeRoomId: 'operations',
      state: 'IDLE',
      sinceMs: 12 * MIN,
      currentActivity: 'On call',
      capabilities: [CAPS.ops],
    }),
    worker({
      id: 'w-juniper',
      name: 'Juniper Flux',
      role: 'Build Apprentice',
      crewId: 'forge',
      characterId: 'juniper',
      homeRoomId: 'build',
      state: 'IDLE',
      sinceMs: 25 * MIN,
      currentActivity: 'Tidying the workbench',
      capabilities: [CAPS.code, CAPS.test],
    }),
    worker({
      id: 'w-kestrel',
      name: 'Kestrel Frost',
      role: 'Snow Wolf Scout',
      crewId: 'snow-wolf',
      characterId: 'kestrel',
      homeRoomId: 'snow-wolf-den',
      state: 'IDLE',
      sinceMs: 50 * MIN,
      currentActivity: 'Standing by (reserved crew placeholder)',
      capabilities: [CAPS.recon],
    }),
  ];

  const missions: Mission[] = [
    {
      id: 'AN-0139',
      title: 'Mission timer instrumentation',
      objective: 'Add elapsed/remaining instrumentation to every mission lifecycle stage.',
      status: 'COMPLETE',
      priority: 'normal',
      assignedWorkerIds: ['w-ada', 'w-juniper'],
      createdAt: at(-3 * HOUR),
      startedAt: at(-2.25 * HOUR),
      completedAt: at(-25 * MIN),
      estimate: { durationMs: 2 * HOUR, source: 'Planner estimate', confidence: 'medium' },
      progress: 1,
      dependsOn: [],
      tasks: [
        task('AN-0139', 1, 'Define timing contract', 'DONE', { assigneeId: 'w-ada', progress: 1 }),
        task('AN-0139', 2, 'Instrument lifecycle stages', 'DONE', {
          assigneeId: 'w-juniper',
          progress: 1,
        }),
      ],
      artifacts: [
        {
          id: 'art-0139-1',
          missionId: 'AN-0139',
          producedBy: 'w-ada',
          kind: 'code',
          title: 'mission-timing.ts',
          summary: 'Timing contract and helpers.',
          createdAt: at(-70 * MIN),
        },
        {
          id: 'art-0139-2',
          missionId: 'AN-0139',
          producedBy: 'w-juniper',
          kind: 'test-result',
          title: 'Timing suite — 42 passed',
          createdAt: at(-40 * MIN),
        },
      ],
      review: {
        id: 'rev-AN-0139',
        missionId: 'AN-0139',
        reviewerId: 'w-pim',
        status: 'PASSED',
        requestedAt: at(-50 * MIN),
        completedAt: at(-35 * MIN),
        summary: 'Clean contract; no findings.',
      },
      certification: 'CERTIFIED',
      approvalIds: [],
      result: {
        outcome: 'SUCCESS',
        summary: 'Timing instrumentation merged behind feature flag.',
        nextAction: 'Enable flag on the Forge Floor dashboard.',
      },
    },
    {
      id: 'AN-0140',
      title: 'Legacy queue migration',
      objective: 'Move the legacy job queue onto the new event bus without downtime.',
      status: 'FAILED',
      priority: 'high',
      assignedWorkerIds: ['w-otto'],
      createdAt: at(-6 * HOUR),
      startedAt: at(-5.5 * HOUR),
      completedAt: at(-3.2 * HOUR),
      progress: 0.6,
      dependsOn: [],
      tasks: [
        task('AN-0140', 1, 'Dual-write shim', 'DONE', { assigneeId: 'w-otto', progress: 1 }),
        task('AN-0140', 2, 'Cutover', 'FAILED', { assigneeId: 'w-otto', progress: 0.2 }),
      ],
      artifacts: [
        {
          id: 'art-0140-1',
          missionId: 'AN-0140',
          producedBy: 'w-otto',
          kind: 'report',
          title: 'Cutover failure report',
          summary: 'Ordering guarantees violated under replay.',
          createdAt: at(-3.2 * HOUR),
        },
      ],
      review: noReview('AN-0140'),
      certification: 'NOT_REQUIRED',
      approvalIds: [],
      result: {
        outcome: 'FAILURE',
        summary: 'Cutover aborted: message ordering not preserved during replay.',
        nextAction: 'Re-plan with ordered partitions.',
      },
    },
    {
      id: 'AN-0141',
      title: 'Q4 operations roadmap',
      objective: 'Draft the Q4 roadmap for the Forge Floor and adapter ecosystem.',
      status: 'ACTIVE',
      priority: 'normal',
      assignedWorkerIds: ['w-bramwell'],
      createdAt: at(-50 * MIN),
      startedAt: at(-45 * MIN),
      progress: 0.4,
      dependsOn: [],
      tasks: [
        task('AN-0141', 1, 'Collect crew input', 'DONE', { assigneeId: 'w-bramwell', progress: 1 }),
        task('AN-0141', 2, 'Sequence milestones', 'IN_PROGRESS', {
          assigneeId: 'w-bramwell',
          progress: 0.4,
        }),
      ],
      artifacts: [],
      review: noReview('AN-0141'),
      certification: 'NOT_REQUIRED',
      approvalIds: [],
    },
    {
      id: 'AN-0142',
      title: 'Forge Floor telemetry ingest',
      objective: 'Ingest worker telemetry into the event bus with backpressure and replay.',
      status: 'ACTIVE',
      priority: 'high',
      assignedWorkerIds: ['w-ada', 'w-otto'],
      createdAt: at(-80 * MIN),
      startedAt: at(-72 * MIN),
      estimate: { durationMs: 2 * HOUR, source: 'Planner estimate', confidence: 'medium' },
      progress: 0.58,
      dependsOn: ['AN-0139'],
      tasks: [
        task('AN-0142', 1, 'Schema for telemetry events', 'DONE', {
          assigneeId: 'w-ada',
          progress: 1,
        }),
        task('AN-0142', 2, 'Event bus wiring', 'IN_PROGRESS', {
          assigneeId: 'w-ada',
          progress: 0.58,
        }),
        task('AN-0142', 3, 'Backpressure & replay', 'IN_PROGRESS', {
          assigneeId: 'w-otto',
          progress: 0.35,
          dependsOn: ['AN-0142-T1'],
        }),
      ],
      artifacts: [
        {
          id: 'art-0142-1',
          missionId: 'AN-0142',
          producedBy: 'w-ada',
          kind: 'document',
          title: 'telemetry-schema.md',
          createdAt: at(-40 * MIN),
        },
      ],
      review: noReview('AN-0142'),
      certification: 'PENDING',
      approvalIds: [],
    },
    {
      id: 'AN-0143',
      title: 'Adapter contract hardening',
      objective: 'Stabilise the adapter contract so third-party backends can target it.',
      status: 'WAITING_REVIEW',
      priority: 'normal',
      assignedWorkerIds: ['w-juniper'],
      createdAt: at(-4 * HOUR),
      startedAt: at(-3.07 * HOUR),
      progress: 0.9,
      dependsOn: [],
      tasks: [
        task('AN-0143', 1, 'Type contracts', 'DONE', { assigneeId: 'w-juniper', progress: 1 }),
        task('AN-0143', 2, 'Contract tests', 'DONE', { assigneeId: 'w-juniper', progress: 1 }),
      ],
      artifacts: [
        {
          id: 'art-0143-1',
          missionId: 'AN-0143',
          producedBy: 'w-juniper',
          kind: 'code',
          title: 'adapter-contract.ts',
          createdAt: at(-35 * MIN),
        },
      ],
      review: {
        id: 'rev-AN-0143',
        missionId: 'AN-0143',
        reviewerId: 'w-pim',
        status: 'IN_REVIEW',
        requestedAt: at(-27 * MIN),
      },
      certification: 'NOT_REQUIRED',
      approvalIds: [],
    },
    {
      id: 'AN-0144',
      title: 'Credential rotation runbook',
      objective: 'Rotate the staging deploy key and document the rotation runbook.',
      status: 'WAITING_APPROVAL',
      priority: 'high',
      assignedWorkerIds: ['w-cyrus'],
      createdAt: at(-60 * MIN),
      startedAt: at(-52 * MIN),
      progress: 0.5,
      dependsOn: [],
      tasks: [
        task('AN-0144', 1, 'Draft runbook', 'DONE', { assigneeId: 'w-cyrus', progress: 1 }),
        task('AN-0144', 2, 'Rotate staging key', 'BLOCKED', { assigneeId: 'w-cyrus' }),
      ],
      artifacts: [
        {
          id: 'art-0144-1',
          missionId: 'AN-0144',
          producedBy: 'w-cyrus',
          kind: 'document',
          title: 'key-rotation-runbook.md',
          createdAt: at(-20 * MIN),
        },
      ],
      review: noReview('AN-0144'),
      certification: 'NOT_REQUIRED',
      approvalIds: ['APR-031'],
    },
    {
      id: 'AN-0145',
      title: 'Research: realtime transport options',
      objective: 'Recommend polling vs SSE vs WebSocket for live dashboard updates.',
      status: 'ACTIVE',
      priority: 'normal',
      assignedWorkerIds: ['w-mina'],
      createdAt: at(-45 * MIN),
      startedAt: at(-40 * MIN),
      estimate: { durationMs: 90 * MIN, source: 'Researcher estimate', confidence: 'low' },
      progress: 0.3,
      dependsOn: [],
      tasks: [
        task('AN-0145', 1, 'Benchmark transports', 'IN_PROGRESS', {
          assigneeId: 'w-mina',
          progress: 0.3,
        }),
      ],
      artifacts: [],
      review: noReview('AN-0145'),
      certification: 'NOT_REQUIRED',
      approvalIds: [],
    },
    {
      id: 'AN-0146',
      title: 'Certify release candidate 0.9',
      objective: 'Run the certification suite against release candidate 0.9.',
      status: 'ACTIVE',
      priority: 'high',
      assignedWorkerIds: ['w-hedda'],
      createdAt: at(-40 * MIN),
      startedAt: at(-34 * MIN),
      estimate: { durationMs: 75 * MIN, source: 'Certification suite history', confidence: 'high' },
      progress: 0.45,
      dependsOn: [],
      tasks: [
        task('AN-0146', 1, 'Certification suite', 'IN_PROGRESS', {
          assigneeId: 'w-hedda',
          progress: 0.45,
        }),
      ],
      artifacts: [],
      review: {
        id: 'rev-AN-0146',
        missionId: 'AN-0146',
        status: 'PASSED',
        summary: 'Pre-review passed.',
      },
      certification: 'IN_PROGRESS',
      approvalIds: [],
    },
    {
      id: 'AN-0147',
      title: 'Nightly dependency audit',
      objective: 'Audit third-party dependencies for advisories and licence drift.',
      status: 'QUEUED',
      priority: 'low',
      assignedWorkerIds: [],
      createdAt: at(-15 * MIN),
      dependsOn: [],
      tasks: [task('AN-0147', 1, 'Scan dependency tree', 'PENDING')],
      artifacts: [],
      review: noReview('AN-0147'),
      certification: 'NOT_REQUIRED',
      approvalIds: [],
    },
    {
      id: 'AN-0148',
      title: 'Snow Wolf recon: perimeter scan',
      objective: 'Placeholder mission reserved for the Snow Wolf crew.',
      status: 'QUEUED',
      priority: 'low',
      assignedWorkerIds: [],
      createdAt: at(-10 * MIN),
      dependsOn: [],
      tasks: [task('AN-0148', 1, 'Perimeter sweep', 'PENDING')],
      artifacts: [],
      review: noReview('AN-0148'),
      certification: 'NOT_REQUIRED',
      approvalIds: [],
    },
  ];

  const approvals: DashboardSnapshot['approvals'] = [
    {
      id: 'APR-030',
      title: 'Enable timing flag in staging',
      action: 'Turn on the mission-timing feature flag for the staging dashboard.',
      rationale: 'AN-0139 passed review and certification.',
      risk: 'low',
      reversible: true,
      missionId: 'AN-0139',
      requestedBy: 'w-ada',
      requestedAt: at(-30 * MIN),
      status: 'APPROVED',
      requiredAuthority: 'Founder #0007',
      decision: {
        decision: 'APPROVE',
        decidedBy: 'Founder #0007',
        decidedAt: at(-27 * MIN),
        note: 'Seeded demo decision.',
        delivery: 'simulated',
      },
    },
    {
      id: 'APR-031',
      title: 'Rotate staging deploy key',
      action:
        'Revoke the current staging deploy key and issue a new one. Running deploy jobs will fail until they pick up the new key.',
      rationale: 'Scheduled rotation; key is 91 days old (policy: 90).',
      risk: 'high',
      reversible: false,
      missionId: 'AN-0144',
      requestedBy: 'w-cyrus',
      requestedAt: at(-18 * MIN),
      status: 'PENDING',
      requiredAuthority: 'Founder #0007',
    },
  ];

  mapApprovalsIntoMissions(missions, approvals);

  const health: SystemHealth = {
    status: 'DEGRADED',
    checkedAt: at(-30_000),
    components: [
      { id: 'orchestrator', label: 'Orchestrator', status: 'NOMINAL', latencyMs: 42 },
      { id: 'event-bus', label: 'Event bus', status: 'NOMINAL', latencyMs: 8 },
      {
        id: 'build-runners',
        label: 'Build runners',
        status: 'DEGRADED',
        detail: 'Queue latency above threshold',
        latencyMs: 1840,
      },
      { id: 'artifact-store', label: 'Artifact store', status: 'NOMINAL', latencyMs: 61 },
      { id: 'cert-sandbox', label: 'Certification sandbox', status: 'NOMINAL', latencyMs: 120 },
    ],
  };

  const alerts: DashboardSnapshot['alerts'] = [
    {
      id: 'ALR-007',
      severity: 'WARNING',
      title: 'Build runner latency elevated',
      whatHappened: 'Median build queue wait rose to 1.8s (threshold 1.0s).',
      affected: [
        { kind: 'system', id: 'build-runners', label: 'Build runners' },
        { kind: 'mission', id: 'AN-0142', label: 'AN-0142 Telemetry ingest' },
      ],
      attention: 'Builds may take longer; no action needed unless it keeps climbing.',
      humanActionRequired: false,
      raisedAt: at(-14 * MIN),
    },
    {
      id: 'ALR-008',
      severity: 'NOTICE',
      title: 'Approval waiting at the Founder Gate',
      whatHappened: 'Cyrus Anvil requested approval to rotate the staging deploy key.',
      affected: [{ kind: 'approval', id: 'APR-031', label: 'APR-031 Rotate staging deploy key' }],
      attention: 'AN-0144 cannot continue until a decision is made.',
      humanActionRequired: true,
      raisedAt: at(-18 * MIN),
    },
  ];

  const messages: WorkerMessage[] = [
    {
      id: 'msg-1',
      workerId: 'w-ada',
      direction: 'from-worker',
      author: 'Ada Sprocket',
      body: 'Schema is locked. Moving on to event bus wiring — ETA depends on runner latency.',
      sentAt: at(-38 * MIN),
      delivery: 'simulated',
    },
    {
      id: 'msg-2',
      workerId: 'w-cyrus',
      direction: 'from-worker',
      author: 'Cyrus Anvil',
      body: 'Runbook drafted. I will not rotate the key until the Founder Gate opens.',
      sentAt: at(-18 * MIN),
      delivery: 'simulated',
    },
  ];

  const events = buildSeedHistory(at);

  return {
    provenance: DEMO_PROVENANCE,
    generatedAt: at(0),
    workers,
    missions,
    approvals,
    alerts,
    events,
    messages,
    health,
    quality: { partial: false, issues: [] },
  };
}

function mapApprovalsIntoMissions(
  missions: Mission[],
  approvals: DashboardSnapshot['approvals'],
): void {
  for (const a of approvals) {
    const m = missions.find((x) => x.id === a.missionId);
    if (m && !m.approvalIds.includes(a.id)) m.approvalIds.push(a.id);
  }
}

/** Past events so the activity stream has history on first load. */
function buildSeedHistory(at: (ms: number) => string): DashboardEvent[] {
  let n = 0;
  const id = () => `seed-${++n}`;
  const e = <E extends DashboardEvent>(ev: Omit<E, 'id'>): E =>
    ({ id: id(), via: 'simulated', receivedAt: at(0), ...ev }) as E;
  return [
    e({
      kind: 'mission.failed',
      at: at(-3.2 * HOUR),
      missionId: 'AN-0140',
      workerId: 'w-otto',
      payload: {
        result: {
          outcome: 'FAILURE',
          summary: 'Cutover aborted: message ordering not preserved during replay.',
        },
      },
    }),
    e({
      kind: 'work.started',
      at: at(-72 * MIN),
      missionId: 'AN-0142',
      workerId: 'w-ada',
      payload: { taskId: 'AN-0142-T1', activity: 'Drafting telemetry schema' },
    }),
    e({
      kind: 'work.started',
      at: at(-64 * MIN),
      missionId: 'AN-0142',
      workerId: 'w-otto',
      payload: { taskId: 'AN-0142-T3', activity: 'Hardening ingest backpressure' },
    }),
    e({
      kind: 'work.started',
      at: at(-45 * MIN),
      missionId: 'AN-0141',
      workerId: 'w-bramwell',
      payload: { activity: 'Collecting crew input' },
    }),
    e({
      kind: 'work.started',
      at: at(-40 * MIN),
      missionId: 'AN-0145',
      workerId: 'w-mina',
      payload: { taskId: 'AN-0145-T1' },
    }),
    e({
      kind: 'artifact.produced',
      at: at(-40 * MIN),
      missionId: 'AN-0142',
      workerId: 'w-ada',
      payload: {
        artifact: {
          id: 'art-0142-1',
          missionId: 'AN-0142',
          producedBy: 'w-ada',
          kind: 'document',
          title: 'telemetry-schema.md',
          createdAt: at(-40 * MIN),
        },
      },
    }),
    e({
      kind: 'worker.state_changed',
      at: at(-34 * MIN),
      missionId: 'AN-0146',
      workerId: 'w-hedda',
      payload: { state: 'CERTIFYING', activity: 'Running release-candidate certification suite' },
    }),
    e({
      kind: 'review.passed',
      at: at(-35 * MIN),
      missionId: 'AN-0139',
      workerId: 'w-pim',
      payload: { summary: 'Clean contract; no findings.' },
    }),
    e({
      kind: 'approval.decided',
      at: at(-27 * MIN),
      missionId: 'AN-0139',
      payload: {
        approvalId: 'APR-030',
        record: {
          decision: 'APPROVE',
          decidedBy: 'Founder #0007',
          decidedAt: at(-27 * MIN),
          delivery: 'simulated',
        },
      },
    }),
    e({
      kind: 'review.requested',
      at: at(-27 * MIN),
      missionId: 'AN-0143',
      workerId: 'w-juniper',
      payload: { reviewerId: 'w-pim' },
    }),
    e({
      kind: 'mission.completed',
      at: at(-25 * MIN),
      missionId: 'AN-0139',
      payload: {
        result: {
          outcome: 'SUCCESS',
          summary: 'Timing instrumentation merged behind feature flag.',
        },
      },
    }),
    e({
      kind: 'worker.state_changed',
      at: at(-22 * MIN),
      missionId: 'AN-0141',
      workerId: 'w-bramwell',
      payload: { state: 'PLANNING', activity: 'Sequencing Q4 operations milestones' },
    }),
    e({
      kind: 'approval.requested',
      at: at(-18 * MIN),
      missionId: 'AN-0144',
      workerId: 'w-cyrus',
      payload: {
        request: {
          id: 'APR-031',
          title: 'Rotate staging deploy key',
          action: 'Revoke and reissue the staging deploy key.',
          rationale: 'Scheduled rotation.',
          risk: 'high',
          reversible: false,
          missionId: 'AN-0144',
          requestedBy: 'w-cyrus',
          requestedAt: at(-18 * MIN),
          status: 'PENDING',
          requiredAuthority: 'Founder #0007',
        },
      },
    }),
    e({
      kind: 'alert.raised',
      at: at(-14 * MIN),
      payload: {
        alert: {
          id: 'ALR-007',
          severity: 'WARNING',
          title: 'Build runner latency elevated',
          whatHappened: '',
          affected: [],
          attention: '',
          humanActionRequired: false,
          raisedAt: at(-14 * MIN),
        },
      },
    }),
    e({
      kind: 'mission.created',
      at: at(-10 * MIN),
      missionId: 'AN-0148',
      payload: {
        mission: {
          id: 'AN-0148',
          title: 'Snow Wolf recon: perimeter scan',
          objective: '',
          status: 'QUEUED',
          priority: 'low',
          assignedWorkerIds: [],
          createdAt: at(-10 * MIN),
          dependsOn: [],
          tasks: [],
          artifacts: [],
          review: { id: 'rev-AN-0148', missionId: 'AN-0148', status: 'NOT_REQUESTED' },
          certification: 'NOT_REQUIRED',
          approvalIds: [],
        },
      },
    }),
  ].sort((a, b) => a.at.localeCompare(b.at));
}
