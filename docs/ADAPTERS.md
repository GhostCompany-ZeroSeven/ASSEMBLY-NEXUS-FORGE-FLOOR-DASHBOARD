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

## ANN adapter readiness: what the UI never guesses

ANN / ADA / ALPHA / Forge systems → ANN adapter → normalized snapshot → UI. The ANN dashboard
feed contract v1 (below) implements this boundary against a **simulated mock feed only**; no live
ANN connection exists. These fields are **source truth**: the adapter must report them, and when it
does not, the UI shows UNKNOWN / NOT REPORTED and never derives them:

| Field                         | Never derived from                                | When missing or invalid                        |
| ----------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Mission ordinal               | array index, count, timestamp, sort order         | UNKNOWN; mission shown by its source id        |
| Approval decision / authority | viewing, opening, worker capability, demo actions | gate stays pending; demo decisions "simulated" |
| Certification                 | review state, completion, artifacts               | UNKNOWN (never certified)                      |
| Health                        | "no error seen", a rendered page, demo simulation | UNKNOWN (neutral), never lime                  |
| Live / connected              | demo data, cached data                            | SIMULATED / DISCONNECTED / LAST KNOWN          |
| Elapsed / remaining time      | estimate guesses, `now` for a finished mission    | dashes + "not reported" / "inconsistent"       |
| Worker identity / Associate   | Visual Forge Floor artwork, character art         | id only                                        |

Colour follows the same rule: one function per family of facts (`healthTone`, the
`*_STATUS_META` tables in `domain/status.ts`) decides the tone, and `success` (lime) is reserved
for data-backed positive outcomes. `connected` (turquoise) only says data is flowing. A
simulated "nominal" is simulated amber. Tests: `src/domain/truthfulColour.test.ts`,
`src/app/truthfulHealth.test.tsx`, `src/app/hostileData.test.tsx` (malformed data on every
route).

## ANN dashboard feed contract v1 (`src/adapters/ann/`)

**Status: contract + read-only adapter + deterministic SIMULATED mock feed. Not connected to any
Assembly Nexus system. Not production-ready. No transport is implemented.** The Local Demo
Simulation is a separate adapter and is unchanged.

The chain of distinctions this module keeps explicit, in code and in the UI:

> schema validity ≠ source authenticity ≠ Founder authority ≠ certification ≠ mission completion ≠
> successful deployment, and display ≠ reality.

The dashboard, the adapter, the normalizer and (in future) the transport are **not authority**. A
feed is evidence presented to the dashboard; conforming to the schema does not make it trustworthy.

| Module          | Responsibility                                                                    |
| --------------- | --------------------------------------------------------------------------------- |
| `contract.ts`   | version, wire shape, enums, bounds, error codes, the `AnnFeedSource` interface    |
| `normalize.ts`  | the ONE normalization boundary: `normalizeAnnFeed(raw, { now, humanAuthority })`  |
| `AnnAdapter.ts` | read-only `DashboardAdapter` over any `AnnFeedSource`                             |
| `mockFeed.ts`   | deterministic simulated v1 envelope (`normal`, `stale`, `unknown`, `unavailable`) |

Select it with `adapter: { kind: 'ann-mock', humanAuthority }` or, in development,
`VITE_FORGE_ADAPTER=ann-mock npm run dev` (review variants: `?ann=stale|unknown|unavailable`). The
browser suite builds it with `npm run build:e2e-ann` (`.env.e2e-ann`) and serves it on port 4177.

**Version.** `contract` must equal `assembly-nexus.dashboard-feed.v1` exactly. Missing, unknown or
near-miss versions are rejected (`UNSUPPORTED_CONTRACT`). No negotiation, no downgrade.

**Envelope.** Required: `contract`, `source { id, kind }`, `snapshot { id, generatedAt }`,
`sourceMode`. Collections `missions`, `workers`, `approvals`, `alerts`, `activity`: a missing or
non-array collection is **unavailable** (shown as UNKNOWN), an empty array is a valid empty
collection. `health` missing = health UNKNOWN. **Unknown properties are ignored**: normalization
reads only the documented fields and builds fresh objects, so an extra property cannot reach the
model or change any decision. The input is first deep-copied into null-prototype objects (own
enumerable keys, JSON-like values only, bounded size and depth): keys such as `__proto__`,
`constructor` or `prototype` are inert data, inherited or polluted properties are never read, and a
record with a replaced prototype or a non-plain value is unreadable (dropped and counted).

**Source mode.** Exact strings only (no trimming, no case folding). `SIMULATED` (shown as
simulated), `LIVE` (a **source claim**, not proof: shown as live only once a future transport
verifies the connection; this adapter never verifies, so LIVE displays as not verified),
`UNKNOWN` (rejected: the dashboard will not show data it cannot classify as live or simulated).
Missing or unrecognised modes are rejected; nothing becomes LIVE. A mock or the Local Demo
Simulation declaring LIVE is rejected as contradictory. The adapter reports a separate trust state
(`AnnAdapter.trust()`): `sourceMode` (the claim), `transport` (`IN_MEMORY_MOCK` | `UNVERIFIED`),
`snapshotAuthenticity` and `decisionAuthenticity` (always `NOT_ESTABLISHED` in v1).

**Missions.** `id` is the opaque source identity (routing). `ordinal` is accepted only as a
non-negative safe integer from the source; strings, fractions, negatives and duplicates are
UNKNOWN (the mission is shown by its id). Lifecycle values must match exactly; anything else is
UNKNOWN. `COMPLETE`/`FAILED` need a valid completion time; a completion time on a running mission
is a contradiction (UNKNOWN). Progress is percent 0..100 and never implies completion. Estimates
outside (0, 400 days] are ignored ("No estimate"). An unstated priority is `unknown` (shown "not
stated", sorted with high), never "normal".

**Certification and review.** Explicit only. Missing evidence is UNKNOWN. `CERTIFIED`/`REJECTED`
need a decider and time; `CERTIFIED` is accepted only on a `COMPLETE` mission. Completion, a passed
review, a SUCCESS result or 100% progress never certify.

**Authority.** v1 carries no authority grants (capabilities never become authority). Who may
decide comes from the deployment's `governance.humanAuthority`, never from feed text: a request's
`requiredAuthority` is kept only when it is exactly that authority; anything else ("ROOT",
"FOUNDER VERIFIED", "NO APPROVAL REQUIRED", a near-miss) is not displayed, the request cannot be
decided, and any decision on it is rejected. A Founder decision is accepted only when
`authority: "FOUNDER"`, the decider is exactly (no trimming, case or Unicode tolerance) the
configured authority, the decider is neither the requester nor any worker, the decision is at or
after the request (same source clock, no skew), and any `approvalId`/`missionId` it carries matches
its request. Otherwise `APPROVED`/`DENIED` become UNKNOWN; a decision on a PENDING request is
ignored.

Worker records and requests whose name, id or role **folds** to contain the reserved authority or
the word "founder" are dropped as impersonation. Folding (NFKC, invisible characters removed,
common Cyrillic/Greek lookalikes mapped, "zero"/"seven" spelled out, punctuation and spacing
dropped, leading zeros dropped) is used ONLY to reject: "Founder #007", "Founder Zero Seven",
"Fоunder" (Cyrillic о) and "Co-Founder" are all caught. It is deliberately broad (fail closed); it
is not a universal confusables engine (residual: exotic scripts not in the small lookalike map).

**Structural validity is not authenticity.** v1 has no trusted transport and no signatures. An
accepted decision is a structurally valid, **source-asserted** Founder decision
(`assurance: "source-asserted"`; `delivery: "simulated"` for simulated feeds). The UI labels a
non-simulated one "Reported by the data source — not independently verified". The dashboard never
claims it verified a Founder decision. Risk, reversibility and expiry not stated stay unknown
(`risk: "unknown"`, `reversible: null`); unknown reversibility is confirmed like an irreversible
action.

**Health.** NOMINAL needs a current report time, at least one component, and every component
NOMINAL. Missing, null, empty, unparseable, stale (> 5 min) or self-contradictory health (overall
better than its worst component) is UNKNOWN. A CRITICAL overall with nominal components stays
CRITICAL (conservative). No alerts, a reachable source or (in future) transport success never mean
healthy.

**Freshness and time.** All judgements use the injected evaluation time, never a hidden clock. A
snapshot older than 120 s is marked STALE (the existing stale banner and amber health rules apply);
exactly 120 s is still fresh. A snapshot more than 60 s in the future is rejected (exactly 60 s is
accepted). A record time later than its snapshot (+60 s) is invalid. Times from the same source are
compared without skew (completion before start, decision before request: invalid by even 1 ms).
Certification evidence does not expire in v1: it is a historical fact, current as of the snapshot,
and the snapshot's own freshness governs.

**Activity.** History only: `worker.assigned`, `work.started`, `task.completed`,
`review.requested`. Activity can never carry approval, certification, outcome, health or alert
claims; such entries are dropped and free text is never interpreted.

**Contradictions.** Security-sensitive (identity, authority, envelope mode): reject the feed or
the record. Presentation contradictions: keep the safe subset, the disputed field is UNKNOWN.
Duplicate ids drop every copy, and a collection with unreadable records is marked incomplete.

**Bounds.** missions 2 000, workers 1 000, approvals 1 000, alerts 1 000, health components 200:
exactly the bound is accepted, one more rejects the whole feed (hidden records could hide a gate or
a failure; a trimmed snapshot is never shown as complete). Activity (history only) keeps the newest
500 and says it was truncated. Identifiers are never truncated: an id longer than 200 characters,
padded, or with control characters is not an identity (truncation could make two ids collide).
Presentation text is bounded (titles 300, names/roles 120, other text 2 000) and rendered as text.

**Alerts.** An unstated or unrecognised severity is `UNKNOWN`: neutral, ranked with WARNING, never
INFO and never silently turned into a stated severity; the alert is kept.

**Errors.** `UNSUPPORTED_CONTRACT`, `MALFORMED_ENVELOPE`, `CONTRADICTORY_ENVELOPE`,
`SOURCE_MODE_UNKNOWN`, `RESOURCE_LIMIT`, `SOURCE_UNAVAILABLE`, `READ_ONLY`. A failed load shows
the dashboard's error state, never an empty healthy dashboard. Transport error text never reaches
the UI.

**Read-only.** The adapter cannot decide approvals, acknowledge alerts, message workers, dispatch
work, certify, deploy or write back to ANN. It runs no timers and no polling; `refresh()` re-reads
once when called.

Tests: `src/adapters/ann/normalize.test.ts` (contract and hostile matrix),
`src/adapters/ann/hardening.test.tsx` (impersonation, self-approval, certification, ordinal, health,
source-mode and malformed-value tables, object shape, string/collection/time bounds, store-level
read-only), `src/adapters/ann/AnnAdapter.test.ts`, the shared conformance suite (read-only
variant), `src/app/annIntegration.test.tsx` and the browser suite `e2e/ann.spec.ts`.

### Future read-only transport trust contract (design only; nothing below is implemented)

Trust ladder, kept separate from `sourceMode`:

| Level                | Means                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------- |
| `SIMULATED`          | data produced by a mock/demo; nothing real                                              |
| `UNVERIFIED`         | bytes arrived from somewhere; who sent them is not established (v1 for any real source) |
| `TRANSPORT_VERIFIED` | the channel's peer is proven to be the expected endpoint (e.g. mutually authenticated)  |
| `SNAPSHOT_SIGNED`    | the snapshot is signed by a key bound to the ANN source and verifies (freshly)          |
| `DECISION_SIGNED`    | an individual Founder decision is signed by a key held only by the Founder and verifies |

**A. Connectivity proves** only that a channel delivered bytes, and (with an authenticated channel)
which endpoint sent them, at about when.
**B. It does not prove** that the content is true, that the endpoint is the authoritative ANN
store, that any Founder decision was made by the Founder, health, certification, or freshness of
the facts inside. HTTP 200 is not healthy.
**C. Source identity (a verified signature over the snapshot) proves** the snapshot was produced by
the holder of the ANN source key and was not altered in transit.
**D. It does not prove** the ANN source's facts are right, nor that a decision inside it was made by
the Founder (the source could relay or invent one).
**E. Calling a Founder decision authenticated requires** a signature over the decision record
(decision, request id, mission id, decided-at, nonce/sequence) by a key bound to the Founder
identity (held by the Founder, not by ANN), verified by the dashboard against a pinned public key
configured by the deployment, not fresher than a bound, and not replayed.
**F. Attach authenticity to both:** the snapshot (source integrity and freshness) and each decision
(Founder authenticity). Neither substitutes for the other.
**G. Stale evidence** (expired signature validity, old snapshot, unknown key) drops the level back
to `UNVERIFIED` for display; it never upgrades and is never cached as verified.
**H. UI:** simulated → existing SIMULATED badge; live-but-unverified → "not verified" (today's
`disconnected`/source-asserted labels); transport verified → live, decisions still "reported by
the source"; decision signed → the only state in which a decision may be shown as authenticated.
**I. Layers:** channel verification belongs to the transport; signature verification and the
trust level per snapshot/decision are produced at the normalization boundary (pure, given verified
inputs and pinned keys) and carried in the normalized domain (`AnnTrust`, decision `assurance`).
Components only render the level; they never compute it.
**J. Smallest safe next step:** a read-only local transport that reports `UNVERIFIED` honestly
(load + parse + the existing normalizer, no write path, no credentials), with the trust fields
plumbed to the UI. Signatures are a later, separate, Founder-gated mission.
