# Adapters

An adapter connects the dashboard to one backend. It owns transport, payload translation and state
mapping, and it gives the UI only the normalized types in `src/domain/types.ts`. UI components never
import an adapter.

| Adapter                 | Status              | Provenance shown                                            |
| ----------------------- | ------------------- | ----------------------------------------------------------- |
| `DemoAdapter`           | Implemented         | **DEMO · SIMULATED**, always                                |
| `RestAdapter` (generic) | Implemented, tested | **LIVE** only while verified, otherwise **DISCONNECTED**    |
| `AssemblyNexusAdapter`  | Not implemented     | Needs Founder decisions (see the end of this document)      |
| SSE / WebSocket         | Not implemented     | Would reuse `applyEvent` and the `EventTransport` interface |

## Contract (`src/adapters/types.ts`)

```ts
interface DashboardAdapter {
  id: string;
  label: string;
  capabilities: { realtime; approvals; alertAcknowledgement; messaging; simulationControls };
  provenance(): DataProvenance;
  connect(): Promise<DashboardSnapshot>; // resolve with an honest snapshot, even when disconnected
  subscribe(listener): () => void; // { type: 'snapshot' } | { type: 'connection', status, message }
  disconnect(): void; // idempotent; no updates afterwards
  submitApprovalDecision(input): Promise<ApprovalDecisionRecord>;
  acknowledgeAlert(alertId, by): Promise<void>;
  sendWorkerMessage?(workerId, body, author): Promise<WorkerMessage>; // only if capabilities.messaging
  diagnostics?(): TransportDiagnostics; // optional, read-only; see "Transport diagnostics"
}
```

### Transport diagnostics

`diagnostics()` feeds **Settings → Transport and freshness**. It reports the configured and
active transport, stream state, failed attempts, the last stream message (including heartbeats),
the last accepted stream event, rejected stream messages, the last successful REST verification,
the last REST attempt, and the configured intervals. Rules:

- Values the adapter does not know stay `undefined` and are shown as **UNKNOWN**. An adapter
  without `diagnostics()` shows UNKNOWN throughout. Nothing is guessed.
- It must never contain URLs, headers, tokens or credentials (tested). Base URLs can reveal
  internal hosts, so the diagnostics carry none.
- The demo adapter reports `simulated`: there is no network transport at all.

### Event ingest path (`via`)

Every event carries `via: 'stream' | 'poll' | 'simulated'`, stamped by the **adapter** at ingest.
A value in the backend payload is ignored. The Activity view shows it per event (observability
only; it says nothing about whether the event's claims are authorized).

## Provenance model

`DataProvenance = { mode, adapterId, adapterLabel, verifiedBackend, environment?, note? }`.
The badge is computed by `displayMode()` (`src/domain/provenance.ts`):

| Condition                                                                  | Badge                           |
| -------------------------------------------------------------------------- | ------------------------------- |
| `adapterId === 'demo'` or `mode === 'demo'`                                | DEMO · SIMULATED                |
| `mode === 'live'` **and** `verifiedBackend` **and** connection `connected` | LIVE (+ environment, e.g. MOCK) |
| `mode === 'live'` without any one of the above                             | DISCONNECTED                    |
| `mode === 'disconnected'` / `'replay'`                                     | DISCONNECTED / REPLAY           |

`snapshot.quality = { lastSuccessfulSyncAt?, staleAfterMs?, partial, issues[] }` drives the
stale, partial and malformed-data banners.

## Honesty requirements (enforced by the conformance suite)

1. Never report `verifiedBackend: true` unless the backend has just proven itself. For the REST
   adapter, that means a valid health payload in the latest cycle.
2. Forward human decisions verbatim. Report `delivery: 'delivered'` only after the backend returns
   a matching decision record, and that record must itself pass governance: the required human
   authority as `decidedBy`, never a worker (**HTTP success ≠ trusted result**). Never
   auto-approve, and never update approval state optimistically.
3. Run `assertHumanDecisionAllowed()` (`src/domain/governance.ts`) before sending anything.
4. Never fabricate worker replies. Without messaging, leave out `sendWorkerMessage`.
5. Leave out numbers the backend does not provide (`progress`, `estimate`, `latencyMs`). Do not send 0.
6. Drop malformed records, or mark them UNKNOWN, and report each one in `quality.issues`.

## GenericRESTAdapter

`src/adapters/rest/` contains the adapter (`RestAdapter.ts`), config validation (`config.ts`),
HTTP with timeouts (`http.ts`) and the normalizer (`normalize.ts`).

### Configuration

```ts
{
  kind: 'rest',
  rest: {
    baseUrl: 'https://ops.example.com/api',   // or a same-origin path such as '/api/forge'
    label: 'Ops backend',
    endpoints: {                               // defaults shown; optional ones may be omitted
      health: '/health', workers: '/workers', missions: '/missions', approvals: '/approvals',
      alerts: '/alerts', events: '/events',
      decide: '/approvals/:id/decision',       // omit → decisions disabled (capability off)
      acknowledge: '/alerts/:id/acknowledge',  // omit → acknowledgement disabled
    },
    pollIntervalMs: 5000,     // clamped 1s..5min
    requestTimeoutMs: 8000,   // clamped 0.5s..60s
    staleAfterMs: 15000,      // default 3 × poll interval
    statusMapping: { running: 'WORKING' },   // raw → WorkerState
    credentials: 'omit',      // or 'same-origin' for a same-origin proxy cookie; 'include' is refused
  },
}
```

`resolveRestConfig` rejects:

- non-http(s) URLs
- URLs carrying `user:pass@` credentials
- secret-looking query parameters (`token=`, `api_key=`, `secret=`, …)
- protocol-relative endpoints
- cross-origin credentialed requests

### Security boundary

The adapter runs in the browser, so it carries **no credentials**: no auth headers, no tokens, and
no secrets in URLs or in `VITE_*` variables (those are compiled into the bundle). An authenticated
backend needs a **same-origin server-side proxy** (backend-for-frontend) that:

1. authenticates the human operator (session cookie → `credentials: 'same-origin'`),
2. holds the backend credentials server-side,
3. **stamps `decidedBy` from the authenticated identity** rather than trusting the browser's claim,
4. enforces the governance rules again server-side.

The dashboard's governance checks are defence in depth. They do not replace server-side
authorization.

### Wire format v1

Each GET returns either the list or `{ "<resource>": [...] }`. Records use the domain field names
(`src/domain/types.ts`); states may be free-form strings that go through `statusMapping`.

| Endpoint                       | Shape                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `GET /health`                  | `{ status, checkedAt?, components?: [...], environment? }`                                     |
| `GET /workers`                 | `{ workers: Worker[] }`. `id` and `name` required                                              |
| `GET /missions`                | `{ missions: Mission[] }`. `id` and `title` required                                           |
| `GET /approvals`               | `{ approvals: ApprovalRequest[] }`. `id`, `title`, `requestedBy`, `requestedAt` required       |
| `GET /alerts`                  | `{ alerts: Alert[] }`. `id`, `title`, `raisedAt` required                                      |
| `GET /events`                  | `{ events: DashboardEvent[] }`. Unknown kinds or malformed payloads are dropped                |
| `POST /approvals/:id/decision` | body `{ decision, note, decidedBy }` → `{ record: { decision, decidedBy, decidedAt, note? } }` |
| `POST /alerts/:id/acknowledge` | body `{ by }` → any 2xx                                                                        |

### Optional SSE stream (mock contract, not an Assembly Nexus API)

Push updates are **optional**. REST polling stays supported and stays the source of full state
and LIVE verification. The contract below is this dashboard's own. It is implemented by the local
mock (`npm run mock:rest`, `/stream`) and the test doubles. **No Assembly Nexus SSE endpoint is
known or assumed.**

```ts
rest: {
  // …
  stream: {
    path: '/stream',            // relative to baseUrl; secret-looking query params are refused
    heartbeatTimeoutMs: 20000,  // no message/heartbeat for this long → stale → reconnect (2s..120s)
    maxRetries: 5,              // consecutive failures before falling back to polling (0..20)
    resyncIntervalMs: 60000,    // full REST re-sync while the stream is healthy (≥ pollIntervalMs)
  },
}
```

For local development, `VITE_FORGE_REST_STREAM=/stream` enables it.

Wire format:

| SSE event   | `data:`                                               | Effect                                      |
| ----------- | ----------------------------------------------------- | ------------------------------------------- |
| `forge`     | one `DashboardEvent` as JSON (`src/domain/events.ts`) | Re-normalized, then applied by `applyEvent` |
| `heartbeat` | anything                                              | Resets the heartbeat timer only             |
| `message`   | same as `forge` (default event name)                  | Same as `forge`                             |
| `id:`       | event id                                              | Sent back as `?lastEventId=` on reconnect   |

Behaviour (`src/adapters/transport/sse.ts`, `src/adapters/rest/stream.ts`):

- **States:** `connecting → open`, `stale`, `retrying`, `failed`, `closed`. The adapter exposes
  them through `getStreamState()`, and stream problems are listed as data issues. The provenance
  badge shows `STREAM`, `POLL` or `POLL (FALLBACK)`, and a fallback also shows a banner.
- **Bounded reconnect:** exponential backoff from 1s, capped at 30s. After `maxRetries`
  consecutive failures the stream stops and the adapter falls back to polling. That is shown
  as a data issue and never silently.
- **LIVE only when verified:** a stream that is open does not make the dashboard LIVE on its
  own. The REST health check must also succeed. While the stream is healthy, its heartbeats are
  what show continued connectivity, and the REST health payload is re-checked only every
  `resyncIntervalMs`. A health endpoint that fails while the same server's stream stays up is
  therefore noticed within that interval, not within `pollIntervalMs`. Lower
  `resyncIntervalMs` if that window matters. The throttle applies **only while the backend is
  verified**: once verification is lost, REST re-checks at the normal poll interval even with the
  stream open, and a stream that reconnects while unverified triggers an immediate re-check. A
  Phase 4 runtime test found that an open stream had delayed recovery by up to 60s.
- **Retry counting:** the failure count resets only when a message or heartbeat arrives, not when
  the connection merely opens. A stream that connects but never delivers still reaches
  `maxRetries` and falls back.
- **Recovery after giving up:** once the stream is `failed`, a successful REST verification
  re-arms it, but only after a 5-minute cool-down (`STREAM_RECOVERY_MS`). That allows at most one
  new, itself bounded, attempt series per cool-down: no reconnect storm.
- **Ordering:** no ordering guarantee is assumed. Duplicate event ids are applied once. A
  `worker.state_changed` older than the worker's current `stateSince` is kept in the log but does
  not roll the worker's state back.
- **Polling backoff:** while REST fails, polling backs off exponentially up to 60s, so after an
  outage verification can take up to that long to return (sooner if the stream reconnects).
- **Untrusted input:** each message is size-limited (256 KiB) and parsed. Unknown kinds,
  malformed payloads and invalid JSON are dropped and reported. Approval decisions are checked
  against governance, and an `approval.requested` that arrives already decided is rejected.
- **No credentials:** `EventSource` is always created with `withCredentials: false`.
- **Clean disconnect:** `disconnect()` closes the source and clears every timer.

The transport conformance suite (`src/adapters/transport/conformance.test.ts`) pins these rules.

### Event reconciliation (REST + SSE)

The REST listing and the stream are reconciled by event **id** (see
docs/ARCHITECTURE.md, "Adversarial mock runtime and event truth"):

- The first observation of an id wins. Later copies never change it, and
  copies with different facts are reported as conflicts.
- Events observed only on the stream survive re-syncs.
- The log drops the earliest observed events first and does not re-admit them.
- A listing with no overlap with the previous one is recorded as a history
  gap, and coverage is then never exact.

These rules assume ids are unique and a listing is a contiguous most-recent
window. That is this project's mock contract. Phase 8 makes these assumptions explicit rules
with profiles and a runner ([CONTRACT_CONFORMANCE.md](CONTRACT_CONFORMANCE.md)). A build
declares its backend's profile with `contractProfile` (or `VITE_FORGE_CONTRACT_PROFILE`); today
only `mock` exists. Without a declaration, no source guarantee is assumed and event coverage is
never EXACT. **Confirm both against the real
Assembly Nexus contract before relying on them.**

### Normalization rules (fail safe, never fail healthy)

- A record missing identity fields is **dropped** and reported.
- Duplicate ids are dropped and reported.
- Unknown worker, mission or approval status becomes **UNKNOWN**. It is never mapped to a healthy
  state or to PENDING.
- An approval with a missing `requiredAuthority` stays visible, but decisions on it are disabled.
- Unknown risk becomes `critical`, unknown reversibility becomes irreversible, unknown alert
  severity becomes WARNING, and unknown `humanActionRequired` becomes `true`.
- `APPROVED`/`DENIED` without a valid decision record becomes **UNKNOWN**.
- An authority grant without `grantedBy`/`grantedAt` is dropped. Capabilities are never promoted
  to authority.
- Invalid progress becomes `null` (shown as "n/a"). An invalid estimate is ignored ("NO
  ESTIMATE"). Non-http artifact links are removed.

## Failure states

| Situation                  | What the dashboard does                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Backend unavailable        | DISCONNECTED badge, "Data source unavailable" alert, Retry button, and no verified data shown                   |
| Request timeout            | Recorded as `Request timed out` under the failing resource                                                      |
| Malformed payload          | PARTIAL DATA banner with an expandable issue list. "Worker data unavailable" is never shown as "zero workers"   |
| Partial data               | Last-good data kept per resource, and the snapshot marked partial                                               |
| Stale data                 | STALE DATA banner once `lastSuccessfulSyncAt` is older than `staleAfterMs`                                      |
| Reconnecting               | "Reconnecting" banner. LIVE is dropped and health goes to UNKNOWN (no stale NOMINAL)                            |
| Adapter error at connect   | Full-screen adapter error with Retry, and no empty dashboard pretending to be fine                              |
| Empty queue / zero workers | Explicit empty states                                                                                           |
| Resource fetch failed      | "… data unavailable" and situation answers of "Unknown". Never "Nothing", "All quiet" or "No decisions waiting" |
| Unknown status             | "Unknown state" / "Unknown status" badge, dashed token plate on the floor                                       |
| Unsupported capability     | Decision buttons hidden with an explanation. Acknowledge and messaging hidden                                   |

## Conformance suite

`src/test/conformance.ts` exports `describeAdapterConformance(name, makeSubject)`, and
`src/adapters/conformance.test.ts` runs it against both adapters. It checks:

- snapshot invariants: unique ids, known states, grant provenance, and decided approvals that
  carry a record
- provenance truthfulness
- capability flags that match the implemented methods
- unsubscribe and idempotent `disconnect()`
- governance refusals for unknown ids, the wrong authority, empty authority, any worker, the
  requester itself, closed requests, and invalid decisions
- honest `delivery` on valid decisions

To add an adapter, register it there and make the suite pass.

```ts
describeAdapterConformance('MyAdapter', () => ({
  adapter: new MyAdapter(testConfig),
  expectedDelivery: 'delivered',
  pendingApprovalId: 'A-1',
  decidedApprovalId: 'A-0',
  humanAuthority: 'Founder #0007',
}));
```

## Registering a custom adapter

```ts
import { registerAdapter } from '@/adapters/createAdapter';
registerAdapter('my-backend', () => new MyAdapter(/* … */));
// config.adapter = { kind: 'custom', id: 'my-backend' }
```

## Before real Assembly Nexus integration (Founder decisions)

1. **API contract:** Assembly Nexus endpoints or event schema. Either conform to wire format v1
   (then the generic adapter works as is) or write an `AssemblyNexusAdapter` that maps into the
   domain types.
2. **Auth and proxy:** where the backend-for-frontend runs, how the Founder authenticates, and
   how `decidedBy` is bound to that identity server-side.
3. **Credentials:** a secrets store for the proxy. Never the browser bundle.
4. **Hosting:** where the dashboard and proxy are deployed. Deployment is a Founder-gated action.
5. **Transport:** polling is enough to start. An optional SSE stream is implemented against a
   mock contract (above). Whether Assembly Nexus exposes a stream, and in what format, is still
   to be decided.
