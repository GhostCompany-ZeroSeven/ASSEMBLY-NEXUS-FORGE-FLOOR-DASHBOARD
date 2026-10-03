import { ANN_CONTRACT_VERSION, type AnnFeedSource, type AnnFeedV1 } from './contract';

/**
 * Deterministic SIMULATED ANN v1 feed. Not a server, not a transport, not
 * Assembly Nexus: an in-memory fixture that exercises the contract with
 * representative truth, including the uncomfortable cases (completed but
 * uncertified, unknown ordinal, unknown worker role and state, unstated risk
 * and reversibility, degraded and unknown health).
 *
 * Its one Founder decision is a SIMULATED fixture: it is normalized with
 * `delivery: 'simulated'` and decides nothing real.
 */
export type AnnMockVariant = 'normal' | 'stale' | 'unknown';
/** `unavailable` = the source itself fails (for error-state review); no feed exists. */
export type AnnMockSourceVariant = AnnMockVariant | 'unavailable';

const MIN = 60_000;

export function annMockFeed(
  variant: AnnMockVariant,
  nowMs: number,
  humanAuthority: string,
): AnnFeedV1 {
  // A stale feed is one whose source stopped producing 10 minutes ago.
  const t0 = variant === 'stale' ? nowMs - 10 * MIN : nowMs;
  const at = (offsetMs: number) => new Date(t0 + offsetMs).toISOString();

  const feed: AnnFeedV1 = {
    contract: ANN_CONTRACT_VERSION,
    source: { id: 'ann-mock-01', name: 'ANN mock feed', kind: 'ann-mock' },
    snapshot: { id: `ann-mock-${variant}`, generatedAt: at(-5_000) },
    sourceMode: 'SIMULATED',
    missions: [
      {
        id: 'ann-msn-7f3a',
        ordinal: 142,
        title: 'Forge Floor telemetry ingest',
        objective: 'Ingest worker telemetry into the event bus with backpressure.',
        lifecycle: 'ACTIVE',
        priority: 'high',
        assignedWorkerIds: ['ann-w-ada'],
        createdAt: at(-4 * 60 * MIN),
        startedAt: at(-72 * MIN),
        progressPct: 58,
        estimate: { durationMs: 120 * MIN, source: 'Planner estimate', confidence: 'medium' },
        review: { status: 'NOT_REQUESTED' },
        certification: { status: 'PENDING' },
      },
      {
        id: 'ann-msn-91c0',
        ordinal: 144,
        title: 'Credential rotation runbook',
        objective: 'Rotate the staging deploy key.',
        lifecycle: 'WAITING_APPROVAL',
        priority: 'high',
        assignedWorkerIds: ['ann-w-cyrus'],
        createdAt: at(-90 * MIN),
        startedAt: at(-52 * MIN),
        review: { status: 'NOT_REQUESTED' },
        certification: { status: 'NOT_REQUIRED' },
        approvalIds: ['ann-apr-031', 'ann-apr-032'],
      },
      {
        // Completed, review passed, NOT certified: completion never implies certification.
        id: 'ann-msn-2b88',
        ordinal: 139,
        title: 'Mission timer instrumentation',
        objective: 'Instrument mission timers.',
        lifecycle: 'COMPLETE',
        priority: 'normal',
        assignedWorkerIds: ['ann-w-ada'],
        createdAt: at(-6 * 60 * MIN),
        startedAt: at(-5 * 60 * MIN),
        completedAt: at(-25 * MIN),
        progressPct: 100,
        review: { status: 'PASSED', completedAt: at(-30 * MIN) },
        certification: { status: 'PENDING' },
        result: { outcome: 'SUCCESS', summary: 'Timers instrumented; certification pending.' },
      },
      {
        id: 'ann-msn-55d1',
        ordinal: 140,
        title: 'Legacy queue migration',
        lifecycle: 'FAILED',
        priority: 'normal',
        createdAt: at(-8 * 60 * MIN),
        startedAt: at(-7 * 60 * MIN),
        completedAt: at(-3 * 60 * MIN),
        review: { status: 'NOT_REQUESTED' },
        certification: { status: 'NOT_REQUIRED' },
        result: { outcome: 'FAILURE', summary: 'Migration aborted on schema drift.' },
      },
      {
        // The source reported no ordinal: shown by its own id, never numbered here.
        id: 'ann-msn-e410',
        title: 'Research: realtime transport options',
        lifecycle: 'QUEUED',
        priority: 'low',
        createdAt: at(-20 * MIN),
        review: { status: 'NOT_REQUESTED' },
        certification: { status: 'NOT_REQUIRED' },
      },
    ],
    workers: [
      {
        id: 'ann-w-ada',
        name: 'Ada Sprocket',
        role: 'Build Engineer',
        state: 'WORKING',
        stateSince: at(-72 * MIN),
        crewId: 'forge',
        characterId: 'ada',
        currentMissionId: 'ann-msn-7f3a',
        currentActivity: 'Wiring backpressure into the ingest path',
        progressPct: 58,
        capabilities: [{ id: 'write-code', label: 'Write code' }],
      },
      {
        id: 'ann-w-cyrus',
        name: 'Cyrus Anvil',
        role: 'Security Warden',
        state: 'WAITING',
        stateSince: at(-18 * MIN),
        crewId: 'forge',
        characterId: 'cyrus',
        currentMissionId: 'ann-msn-91c0',
        capabilities: [{ id: 'inspect-secrets', label: 'Inspect secret metadata' }],
      },
      {
        // Role not reported and a state this dashboard does not know: both stay UNKNOWN.
        id: 'ann-w-7c2',
        name: 'Unregistered worker 7c2',
        state: 'MEDITATING' as unknown as string,
        crewId: 'forge',
      },
    ],
    approvals: [
      {
        id: 'ann-apr-031',
        title: 'Rotate staging deploy key',
        action: 'Revoke the current staging deploy key and issue a new one.',
        rationale: 'Key is 91 days old (policy: 90).',
        missionId: 'ann-msn-91c0',
        requestedBy: 'ann-w-cyrus',
        requestedAt: at(-18 * MIN),
        requiredAuthority: humanAuthority,
        risk: 'high',
        reversible: false,
        status: 'PENDING',
      },
      {
        // Risk and reversibility not stated by the source: both stay unknown.
        id: 'ann-apr-032',
        title: 'Purge stale deploy artifacts',
        action: 'Delete deploy artifacts older than 30 days.',
        missionId: 'ann-msn-91c0',
        requestedBy: 'ann-w-cyrus',
        requestedAt: at(-12 * MIN),
        requiredAuthority: humanAuthority,
        status: 'PENDING',
      },
      {
        // SIMULATED Founder decision fixture.
        id: 'ann-apr-030',
        title: 'Enable timing flag in staging',
        action: 'Turn on the mission-timing feature flag for staging.',
        missionId: 'ann-msn-2b88',
        requestedBy: 'ann-w-ada',
        requestedAt: at(-30 * 60 * MIN),
        requiredAuthority: humanAuthority,
        risk: 'low',
        reversible: true,
        status: 'APPROVED',
        decision: {
          decision: 'APPROVE',
          authority: 'FOUNDER',
          decidedBy: humanAuthority,
          decidedAt: at(-27 * 60 * MIN),
          note: 'Simulated fixture decision.',
        },
      },
    ],
    alerts: [
      {
        id: 'ann-alr-007',
        severity: 'WARNING',
        title: 'Build runner latency elevated',
        whatHappened: 'Median build queue wait rose to 1.8s (threshold 1.0s).',
        attention: 'Builds may take longer.',
        raisedAt: at(-14 * MIN),
        humanActionRequired: false,
        affected: [{ kind: 'system', id: 'build-runners', label: 'Build runners' }],
      },
    ],
    activity: [
      {
        id: 'ann-act-1',
        kind: 'work.started',
        at: at(-72 * MIN),
        missionId: 'ann-msn-7f3a',
        workerId: 'ann-w-ada',
        summary: 'Started ingest backpressure work',
      },
      {
        id: 'ann-act-2',
        kind: 'worker.assigned',
        at: at(-52 * MIN),
        missionId: 'ann-msn-91c0',
        workerId: 'ann-w-cyrus',
      },
      {
        id: 'ann-act-3',
        kind: 'review.requested',
        at: at(-40 * MIN),
        missionId: 'ann-msn-2b88',
      },
    ],
    health: {
      status: 'DEGRADED',
      checkedAt: at(-30_000),
      components: [
        { id: 'orchestrator', label: 'Orchestrator', status: 'NOMINAL', latencyMs: 42 },
        {
          id: 'build-runners',
          label: 'Build runners',
          status: 'DEGRADED',
          detail: 'Queue latency above threshold',
          latencyMs: 1840,
        },
        { id: 'memory', label: 'Memory service', status: 'UNKNOWN' },
      ],
    },
  };

  if (variant === 'unknown') {
    // Health not reported and approvals unavailable: UNKNOWN, never "all clear".
    delete (feed as Partial<AnnFeedV1>).health;
    delete (feed as Partial<AnnFeedV1>).approvals;
  }
  return feed;
}

/** In-memory source over the mock feed (no network, no timers). */
export class MockAnnFeedSource implements AnnFeedSource {
  readonly transport = 'in-memory-mock' as const;
  constructor(
    private readonly variant: AnnMockSourceVariant,
    private readonly humanAuthority: string,
    private readonly now: () => number = Date.now,
  ) {}
  load(): Promise<unknown> {
    if (this.variant === 'unavailable')
      return Promise.reject(new Error('simulated source failure (mock)'));
    return Promise.resolve(annMockFeed(this.variant, this.now(), this.humanAuthority));
  }
}
