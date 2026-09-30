import type { DashboardEvent } from '@/domain/events';
import { assertHumanDecisionAllowed } from '@/domain/governance';
import { applyEvent } from '@/domain/reducer';
import type { DashboardSnapshot } from '@/domain/snapshot';
import type { ApprovalDecisionRecord, DataProvenance, WorkerMessage } from '@/domain/types';
import type {
  AdapterCapabilities,
  AdapterListener,
  ApprovalDecisionInput,
  DashboardAdapter,
  SimulationControls,
  TransportDiagnostics,
} from '../types';
import { createRng } from './rng';
import {
  OPENING_SCRIPT,
  reactionsForDecision,
  routineMissionBeats,
  type Beat,
  type EventDraft,
} from './script';
import { buildSeedSnapshot, DEMO_PROVENANCE } from './seed';
import { buildStressSnapshot } from './stress';

export interface DemoAdapterOptions {
  /** Milliseconds between simulation steps at 1× speed. */
  tickMs?: number;
  seed?: number;
  /** Start ticking automatically after connect. Default true. */
  autoRun?: boolean;
  /** `stress` loads a large deterministic dataset for performance testing. */
  scale?: 'standard' | 'stress';
  /** Injected clock for deterministic tests. */
  now?: () => number;
  /** Injected timer functions for tests. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/**
 * Local, deterministic simulation of an agent operations backend.
 *
 * It is honest about what it is: provenance mode is `demo`, `verifiedBackend`
 * is false, and every decision/message it records is marked `simulated`.
 */
export class DemoAdapter implements DashboardAdapter {
  readonly id = 'demo';
  readonly label = 'Local Demo Simulation';
  readonly capabilities: AdapterCapabilities = {
    realtime: true,
    approvals: true,
    alertAcknowledgement: true,
    messaging: true,
    simulationControls: true,
  };

  readonly simulation: SimulationControls;

  /** The demo has no network transport: everything is simulated in the browser. */
  diagnostics(): TransportDiagnostics {
    return { configured: 'simulated', active: 'simulated' };
  }

  private readonly opts: Required<Omit<DemoAdapterOptions, 'setInterval' | 'clearInterval'>> &
    Pick<DemoAdapterOptions, 'setInterval' | 'clearInterval'>;
  private snapshot: DashboardSnapshot | null = null;
  private listeners = new Set<AdapterListener>();
  private queue: Beat[] = [];
  private rng: () => number;
  private idCounter = 0;
  private missionCounter = 150;
  private timer: unknown = null;
  private running = false;
  private speed = 1;
  private simListeners = new Set<() => void>();

  constructor(options: DemoAdapterOptions = {}) {
    this.opts = {
      tickMs: options.tickMs ?? 3500,
      seed: options.seed ?? 7,
      autoRun: options.autoRun ?? true,
      scale: options.scale ?? 'standard',
      now: options.now ?? (() => Date.now()),
      setInterval: options.setInterval,
      clearInterval: options.clearInterval,
    };
    this.rng = createRng(this.opts.seed);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.simulation = {
      isRunning: () => self.running,
      setRunning: (run) => {
        if (run) self.start();
        else self.stop();
        self.notifySim();
      },
      step: () => self.step(),
      setSpeed: (m) => {
        self.speed = Math.min(8, Math.max(0.25, m));
        if (self.running) {
          self.stop();
          self.start();
        }
        self.notifySim();
      },
      getSpeed: () => self.speed,
      reset: () => self.reset(),
      onChange: (listener) => {
        self.simListeners.add(listener);
        return () => self.simListeners.delete(listener);
      },
    };
  }

  provenance(): DataProvenance {
    return DEMO_PROVENANCE;
  }

  async connect(): Promise<DashboardSnapshot> {
    if (!this.snapshot) this.reset(false);
    if (this.opts.autoRun) this.start();
    return this.current();
  }

  subscribe(listener: AdapterListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect(): void {
    this.stop();
    this.listeners.clear();
  }

  getSnapshot(): DashboardSnapshot {
    return this.current();
  }

  async submitApprovalDecision(input: ApprovalDecisionInput): Promise<ApprovalDecisionRecord> {
    const request = assertHumanDecisionAllowed(this.current(), input);
    const at = this.nowIso();
    const record: ApprovalDecisionRecord = {
      decision: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: at,
      note: input.note,
      delivery: 'simulated',
    };
    this.emit([
      {
        kind: 'approval.decided',
        missionId: request.missionId,
        payload: { approvalId: request.id, record },
      },
    ]);
    // Reactions run before the rest of the story so the floor responds quickly.
    this.queue.unshift(...reactionsForDecision(request.id, input.decision));
    return record;
  }

  async acknowledgeAlert(alertId: string, by: string): Promise<void> {
    const alert = this.current().alerts.find((a) => a.id === alertId);
    if (!alert) throw new Error(`Unknown alert ${alertId}`);
    if (alert.acknowledgedAt) return;
    this.emit([{ kind: 'alert.acknowledged', payload: { alertId, by } }]);
  }

  async sendWorkerMessage(workerId: string, body: string, author: string): Promise<WorkerMessage> {
    if (!this.current().workers.some((w) => w.id === workerId)) {
      throw new Error(`Unknown worker ${workerId}`);
    }
    const message: WorkerMessage = {
      id: this.nextId('msg'),
      workerId,
      direction: 'to-worker',
      author,
      body,
      sentAt: this.nowIso(),
      // Nothing receives this. The UI shows it as simulated / undelivered.
      delivery: 'simulated',
    };
    this.emit([{ kind: 'message.posted', workerId, payload: { message } }]);
    return message;
  }

  /* ----------------------------------------------------------------------- */

  /** Advance one beat. Public for tests and the "step" control. */
  step(): void {
    const snap = this.current();
    if (this.queue.length === 0) {
      this.queue.push(...routineMissionBeats(this.context(snap), this.missionCounter++));
    }
    const beat = this.queue.shift();
    if (!beat) return;
    this.emit(beat(this.context(snap)));
  }

  private context(snapshot: DashboardSnapshot) {
    return {
      snapshot,
      at: this.nowIso(),
      rng: this.rng,
      nextId: (p: string) => this.nextId(p),
    };
  }

  private emit(drafts: EventDraft[]): void {
    if (drafts.length === 0) return;
    const at = this.nowIso();
    let snap = this.current();
    const events: DashboardEvent[] = [];
    for (const draft of drafts) {
      const event = {
        ...draft,
        id: this.nextId('evt'),
        at,
        via: 'simulated',
        receivedAt: at,
      } as DashboardEvent;
      snap = applyEvent(snap, event);
      events.push(event);
    }
    this.snapshot = pruneFinishedMissions(snap);
    for (const l of this.listeners) l({ type: 'snapshot', snapshot: this.snapshot, events });
  }

  private notifySim(): void {
    for (const l of this.simListeners) l();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    const ms = this.opts.tickMs / this.speed;
    const set = this.opts.setInterval ?? ((fn, t) => setInterval(fn, t));
    this.timer = set(() => this.step(), ms);
  }

  private stop(): void {
    this.running = false;
    if (this.timer !== null) {
      const clear =
        this.opts.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
      clear(this.timer);
    }
    this.timer = null;
  }

  private reset(notify = true): void {
    this.rng = createRng(this.opts.seed);
    this.idCounter = 0;
    this.missionCounter = 150;
    this.queue = [...OPENING_SCRIPT];
    this.snapshot = this.initialSnapshot();
    if (notify) {
      const snap = this.snapshot;
      for (const l of this.listeners) l({ type: 'snapshot', snapshot: snap });
    }
  }

  private current(): DashboardSnapshot {
    if (!this.snapshot) this.snapshot = this.initialSnapshot();
    return this.snapshot;
  }

  private initialSnapshot(): DashboardSnapshot {
    return this.opts.scale === 'stress'
      ? buildStressSnapshot(this.opts.now())
      : buildSeedSnapshot(this.opts.now());
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${String(this.idCounter).padStart(5, '0')}`;
  }

  private nowIso(): string {
    return new Date(this.opts.now()).toISOString();
  }
}

/** A long-running demo keeps generating missions; retain at most this many finished ones. */
export const MAX_FINISHED_MISSIONS = 60;

function pruneFinishedMissions(s: DashboardSnapshot): DashboardSnapshot {
  const finished = s.missions.filter((m) => m.status === 'COMPLETE' || m.status === 'FAILED');
  if (finished.length <= MAX_FINISHED_MISSIONS) return s;
  const drop = new Set(
    finished
      .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))
      .slice(0, finished.length - MAX_FINISHED_MISSIONS)
      .map((m) => m.id),
  );
  return { ...s, missions: s.missions.filter((m) => !drop.has(m.id)) };
}
