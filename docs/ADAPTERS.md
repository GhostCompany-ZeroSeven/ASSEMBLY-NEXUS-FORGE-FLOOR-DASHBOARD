# Writing an adapter

An adapter connects the dashboard to a backend. It owns transport, authentication, payload
translation and state mapping, and it gives the UI only the normalized types in `src/domain/types.ts`.

## Contract (`src/adapters/types.ts`)

```ts
interface DashboardAdapter {
  id: string;
  label: string;
  capabilities: {
    realtime: boolean;
    approvals: boolean;
    alertAcknowledgement: boolean;
    messaging: boolean;
    simulationControls: boolean;
  };
  provenance(): DataProvenance;
  connect(): Promise<DashboardSnapshot>;
  subscribe(listener): () => void; // { type: 'snapshot' | 'connection', ... }
  disconnect(): void;
  submitApprovalDecision(input): Promise<ApprovalDecisionRecord>;
  acknowledgeAlert(alertId, by): Promise<void>;
  sendWorkerMessage?(workerId, body, author): Promise<WorkerMessage>;
}
```

## Honesty requirements (non-negotiable)

1. Report `provenance.mode: 'live'` and `verifiedBackend: true` **only** after the backend
   connection has actually been established and verified. Otherwise the UI shows DISCONNECTED.
2. `submitApprovalDecision` must forward the human decision verbatim. Return
   `delivery: 'delivered'` only once the backend has acknowledged it. Never auto-approve.
3. Reject decisions where `decidedBy !== request.requiredAuthority`.
4. Never fabricate worker replies. If messaging is not supported, set `capabilities.messaging: false`
   and leave out `sendWorkerMessage`.
5. Leave out optional numbers (`progress`, `estimate`, `latencyMs`) the backend does not provide,
   rather than sending 0.

## Minimal polling adapter sketch

```ts
import { createPollingTransport } from '@/adapters/transport/polling';
import { mapWorkerState } from '@/domain/status';

export class RestAdapter implements DashboardAdapter {
  readonly id = 'rest';
  readonly label = 'REST backend';
  readonly capabilities = {
    realtime: true,
    approvals: true,
    alertAcknowledgement: true,
    messaging: false,
    simulationControls: false,
  };
  private snapshot!: DashboardSnapshot;
  private verified = false;
  private listeners = new Set<AdapterListener>();
  private transport = createPollingTransport({
    intervalMs: 5000,
    poll: (signal) => fetch(`${this.baseUrl}/state`, { signal }).then((r) => r.json()),
  });

  constructor(private baseUrl: string) {}

  provenance() {
    return {
      mode: this.verified ? 'live' : 'disconnected',
      adapterId: this.id,
      adapterLabel: this.label,
      verifiedBackend: this.verified,
    } as const;
  }

  async connect() {
    this.snapshot = this.translate(await (await fetch(`${this.baseUrl}/state`)).json());
    this.verified = true;
    this.transport.start(
      (raw) => this.publish(this.translate(raw)),
      (err) =>
        this.listeners.forEach((l) =>
          l({ type: 'connection', status: 'reconnecting', message: String(err) }),
        ),
    );
    return this.snapshot;
  }

  private translate(raw: BackendState): DashboardSnapshot {
    // Map backend shapes → domain types here. Use mapWorkerState(raw.status, config.statusMapping).
  }
  // ...subscribe/publish/disconnect/submitApprovalDecision/acknowledgeAlert
}
```

For event streams (SSE/WebSocket), keep the current snapshot and fold incoming normalized events
with `applyEvent` from `src/domain/reducer.ts`. It is idempotent on event ids.

## Registering

```ts
import { registerAdapter } from '@/adapters/createAdapter';
registerAdapter('my-backend', () => new RestAdapter('https://…'));
// config.adapter = { kind: 'custom', id: 'my-backend' }
```

Or pass an adapter instance straight to the app: `<App config={config} adapter={myAdapter} />`.

## AssemblyNexusAdapter (planned)

Not implemented. It needs the Assembly Nexus control-plane API contract (endpoints, auth, event
schema). Credentials must come from the deployment environment and must never be committed or
bundled into client code. A backend-for-frontend or proxy is likely required. This decision
belongs to the Founder.
