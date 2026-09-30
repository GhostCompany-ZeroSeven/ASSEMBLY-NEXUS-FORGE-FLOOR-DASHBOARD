# Architecture

```
┌──────────────────────── UI (src/features, src/components, src/app) ────────────────────────┐
│  Command Center · Forge Floor · Missions · Workers · Approvals · Alerts · Activity · Settings │
│         reads: normalized DashboardSnapshot + DashboardConfig via React context              │
└───────────────▲──────────────────────────────────────────────────────▲──────────────────────┘
                │ snapshot / connection updates                        │ decide / ack / message
┌───────────────┴──────────── store (src/store) ───────────────────────┴──────────────────────┐
│ DashboardProvider (one adapter) · ConfigProvider · PreferencesProvider (theme, motion)     │
└───────────────▲─────────────────────────────────────────────────────────────────────────────┘
                │ DashboardAdapter contract (src/adapters/types.ts)
┌───────────────┴──────────────┬───────────────────────────────┬─────────────────────────────┐
│ DemoAdapter (implemented)    │ RestAdapter (implemented)     │ AssemblyNexus (future)      │
│ seed + scripted beats        │ REST + optional SSE stream    │ contract = Founder decision │
└───────────────┬──────────────┴───────────────┬───────────────┴─────────────────────────────┘
                │ applyEvent (src/domain/reducer.ts)  │ EventTransport (src/adapters/transport)
                ▼                                     ▼
          pure domain model (src/domain)        polling · SSE (mock contract) · WebSocket (not built)
```

## Layers

| Layer      | Path                       | Rules                                                                     |
| ---------- | -------------------------- | ------------------------------------------------------------------------- |
| Domain     | `src/domain`               | Pure TS. Types, events, reducer, selectors, formatting. No React.         |
| Adapters   | `src/adapters`             | The only place that knows about backends. Emits normalized data only.     |
| REST       | `src/adapters/rest`        | Config validation, HTTP+timeout, untrusted-payload normalizer, adapter.   |
| Governance | `src/domain/governance.ts` | Single decision rule set used by UI and every adapter.                    |
| Commands   | `src/features/command`     | Command palette, shortcut layer, keyboard reference.                      |
| Transport  | `src/adapters/transport`   | Moves raw messages. No domain knowledge.                                  |
| Config     | `src/config`               | Brand/product specifics. Only `main.tsx` imports the first-party config.  |
| Store      | `src/store`                | React context wiring; hooks (`useSnapshot`, `useConfig`, `useNow`).       |
| i18n       | `src/i18n`                 | Typed catalogs (en, lazy es), formatters, `<html lang>`. Display only.    |
| URL state  | `src/app/urlState.ts`      | Validated, bounded view state in the hash query. Never data or authority. |
| Characters | `src/characters`           | `CharacterAvatar` resolves art from config; procedural SVG placeholders.  |
| Features   | `src/features/*`           | One folder per surface.                                                   |
| Styles     | `src/styles`               | Tokens → base → components → shell → floor → features.                    |

## Key decisions

1. **Snapshot + structured events.** Adapters publish whole snapshots, plus the events that
   produced them when they have them. Events are typed and discriminated by `kind`, and the
   activity stream, timelines and descriptions all derive from them. Nothing is stored as
   free-form log text.
2. **Pure, idempotent reducer.** `applyEvent` ignores duplicate event ids and unknown entities, so
   replayed or out-of-scope events do not corrupt state. The event log is capped at 500 entries.
3. **No invented precision.** Missing progress shows "n/a" with a striped bar. Missing estimates
   show `--:--:--` and "NO ESTIMATE PROVIDED". Finished missions freeze their duration.
4. **Provenance is always visible.** `displayMode()` in `src/domain/provenance.ts` computes the
   badge. LIVE needs a non-demo adapter, a verified backend and a connected transport; anything
   less renders as DISCONNECTED. `snapshot.quality` (last sync, stale threshold, partial flag,
   issue list) drives the stale, partial and malformed-data banners.
5. **Governance is one rule set, enforced at every layer.** `checkDecision` and
   `assertHumanDecisionAllowed` (`src/domain/governance.ts`) decide whether a decision is allowed:
   - only the named human authority may decide
   - no worker may decide, by id or by name, including on its own request
   - missing, blank or worker-named authority blocks the decision
   - only PENDING or HELD requests are open
     The UI uses the same check to decide whether to show decision buttons. Both adapters call it
     before recording or sending anything. The demo script is structurally unable to decide
     approvals, because only `submitApprovalDecision` emits `approval.decided`. A real backend must
     enforce the same rules again server-side against an authenticated identity.
6. **Capability ≠ authority.** These are separate fields (`capabilities`, `authority`) on
   `Worker`, rendered in separate UI groups.
7. **Floor placement is data-driven.** `stateRoutes` maps each state to a room, `'home'` means the
   worker's station, and workers waiting on an approval go to `approvalRoomId`. Tokens are
   absolutely positioned by percentage, and CSS transitions animate the walk between rooms.
   Below 900px the plan collapses into stacked rooms.
8. **Hash routing, no router dependency.** Static hosting needs no server rewrites.
9. **Fail safe on unknown data.** `UNKNOWN` is a first-class worker, mission and approval state.
   `mapWorkerState` falls back to it instead of guessing. `UNKNOWN` is never in flight, never
   decidable, and never styled as healthy.
10. **Keyboard layer.** One global handler (`useGlobalShortcuts`): Ctrl/⌘+K always works, and
    single-key shortcuts are optional (WCAG 2.1.4) and inactive while typing or while a dialog is
    open. Dialogs share one accessible `Dialog` primitive, and the rest of the app is made
    `inert` while one is open.
11. **Plain CSS with tokens.** Themes swap custom properties. `[data-tone]` drives every status
    color. Reduced motion disables all animation and transitions globally.

## Real-time readiness

`DashboardAdapter.subscribe` is transport-agnostic. For incremental backends, keep a snapshot
in the adapter, call `applyEvent` for each normalized event, and publish the result. Use
`createPollingTransport` for REST polling.

`createSseTransport` (`src/adapters/transport/sse.ts`) implements the same `EventTransport`
interface. It has explicit states, a heartbeat timeout, capped exponential backoff, a retry limit
followed by a stop, `lastEventId` resume, a message size limit and no credentials. The
RestAdapter uses it only when `rest.stream` is configured. Stream messages are re-normalized
(`src/adapters/rest/stream.ts`) and applied with `applyEvent`. While the stream is healthy, REST
re-syncs are slowed. If the stream fails, polling takes over and the badge says
`POLL (FALLBACK)`. The stream contract is this project's own mock contract. It is not an
Assembly Nexus API. A WebSocket transport is not built.

## Localization

See [LOCALIZATION.md](LOCALIZATION.md). English is the typed source catalog.
Spanish must match it at compile time and loads as its own chunk. Status
labels are keyed by enum values, governance refusals are localized by code,
and the domain never reads display text. A test forbids rendered glyphs that
the bundled fonts do not cover, which keeps screenshots environment-independent.

## URL-persisted view state

Missions, Workers, Approvals, Alerts and Activity keep their filters, sorting
and search text in the hash query (`#/missions?group=blocked&sort=priority&q=…`),
so refresh, deep links and Back/Forward restore the view. The Floor already kept
its selection there. `useUrlState(defaults, schema)`:

- parses each parameter with a codec (`oneOf`, `text`, `idOrAll`, `flag`). Unknown,
  malformed or oversized values fall back to the default, text is capped at 100
  characters and stripped of control characters, and ids are format-checked;
- pushes a history entry for discrete choices and replaces it while typing;
- omits defaults, so URLs stay short and human-readable, and keeps other features'
  parameters (except the one-shot `focus`).

URL state is view state only. An unknown worker id filters to nothing, and the
select shows it as "not in current data". It never creates a record, and it never
carries or implies authority (see `governance.phase4.test.tsx`).

## Data freshness model

`selectFreshness()` (`src/domain/freshness.ts`) returns one **source** plus
independent **qualifiers**:

| Source       | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| SIMULATED    | Demo adapter. Never LIVE, never "complete".                |
| LIVE         | Verified backend + connected transport (the current rule). |
| DISCONNECTED | Not verified, or not connected.                            |
| REPLAY       | Recorded data.                                             |

| Qualifier  | Meaning                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| STALE      | Last complete sync is older than `staleAfterMs` (or there never was one). |
| PARTIAL    | Some resources failed or records were dropped.                            |
| UNKNOWN    | Named resources could not be loaded; their answers are Unknown.           |
| LAST_KNOWN | Disconnected, but earlier verified data is still shown.                   |

They combine: LIVE + PARTIAL, LIVE + STALE, DISCONNECTED + LAST KNOWN DATA.
`complete` is true only for LIVE with no qualifier. **Transport LIVE ≠ complete
data**: an open stream never implies completeness. The provenance badge shows
the qualifiers next to the source, and Settings shows the full breakdown.

**Open Founder decision, deliberately not made here:** whether LIVE should
require a complete first sync. The model describes the current rule and makes
every combination visible instead of choosing.

## Activity observability

Each activity entry shows what changed, when (exact ISO time on hover), and
only the references the event carries explicitly: worker, mission, and the
approval, alert or artifact id from its payload. It also shows how the event
arrived (`STREAM`, `POLL` or `SIM`, stamped by the adapter at ingest). No room is
shown, because events do not record where a worker was at the time. The log is
bounded (500 events in memory, 200 shown), and the Activity page can filter by
category, worker and mission (URL-persisted).

### Operations timeline (Phase 5)

The Activity page is now an operations timeline built only from observed events,
ordered by **event time** (newest first) and never interpolated. Each entry
keeps three facts apart:

- **Event time** is the source's claimed `at`. It is shown as a 24-hour time and
  is the exact value in the tooltip.
- **Arrival** is the adapter-stamped `via` and `receivedAt`. With "Show arrival
  details" it shows "received HH:MM:SS". An **ARRIVED LATE** marker appears when
  an event was received after another event whose event time is later. Events
  that arrived together, such as a history load, are never flagged against each
  other.
- **Now** is the linked mission's or worker's current state from the latest
  data. It is labelled as current, never as the state when the event happened.
  It reads "no longer reported" when the record is gone.

The filters are category, worker, mission, time range (15m, 1h, 6h or 24h, or
"since my last view") and ingest path (stream, poll or simulated). All of them
are URL-persisted and validated. The page states where retained history starts
and says when the 500-event log is at capacity.

Ingest facts belong to the first arrival. A REST re-sync that lists an event
already received over the stream keeps `via: stream` and the original
`receivedAt` (Phase 5 defect fix).

## Founder brief, change digest and attention queue (Phase 5)

The brief lives at `#/brief` (nav "Brief", `G then B`, and the palette command
"What changed since I last looked?"). It is information and navigation only.

- **Last-view checkpoint** (`domain/checkpoint.ts`, `store/lastView.ts`,
  `store/LastViewProvider.tsx`):
  - A bounded fingerprint of ids and enum states per resource, plus the newest
    event time, the source id and the mode. It stores no labels, no authority
    and no decisions.
  - A resource that could not be loaded is stored as absent, not empty.
  - Parsing is fail-closed. A wrong version, bad time, future time, unknown
    enum, oversized map or wrong type rejects the whole record; unknown fields
    are dropped, and maps have no prototype.
  - It is saved on `pagehide` and when the tab is hidden, but only from
    complete, connected data; otherwise the older complete checkpoint is kept.
  - After at least 5 minutes away, the saved view becomes the baseline.
  - "Mark all as seen" and "Forget last view" are explicit controls.
- **Change digest** (`domain/digest.ts`):
  - A per-category count is a number only when both sides are known.
    Otherwise it is `null` (UNKNOWN) with a reason: `no-baseline`,
    `different-source`, `unavailable-then`, `unavailable-now`,
    `history-truncated` or `baseline-truncated`.
  - A missing record is reported as "no longer reported", never as deleted or
    completed.
  - The event count is exact only when retained history reaches back to the
    checkpoint. Otherwise it is UNKNOWN, with "at least N retained" as a
    labelled lower bound.
  - Late arrivals of old events are not counted as happening since.
  - Records are compared by id, so renamed labels are not reported as changes.
  - The item list is capped at 150, and counts stay exact.
- **Attention queue** (`domain/attention.ts`): each entry has a source, reason,
  current state, freshness and target, and is derived only from explicit facts:
  - an open gate whose required authority is the human authority
  - an open gate that cannot be decided (authority missing or a worker)
  - a gate whose status is UNKNOWN
  - an unresolved, unacknowledged alert that says human action is required
  - an unavailable resource (the queue is marked INCOMPLETE, and its count is
    UNKNOWN)
  - items shown from stale or disconnected data

  Severity alone never creates attention, and room location never does. Related
  records are only those the data links explicitly.

- **Brief** (`domain/brief.ts`): shows RUNNING, COMPLETED (with "since last
  view"), BLOCKED, FAILED, NEEDS FOUNDER, NEW SINCE LAST VIEW, and data or
  transport problems, next to the freshness source and its qualifiers. Missing
  inputs make a figure UNKNOWN, never 0.

### Cross-surface context

Links appear only where the data carries a relationship:

- Mission detail and worker focus link to their filtered timeline.
- Approval gates list the alerts that name them as affected.
- Queue items link to the gate's mission and to the workers blocked on it.
- The activity stream links the ids an event carries.

## Founder command intelligence (Phase 6)

### Event coverage (`domain/eventCoverage.ts`)

"How many events happened since a view?" is answered only as far as the
evidence allows:

| State            | Meaning                                                                                                | UI                        |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------- |
| `exact`          | The retained log still holds the newest event the view had seen, so every later event it lists is here | `EXACT` + count           |
| `lower-bound`    | New events were observed but earlier ones may have been dropped                                        | `AT LEAST` + "at least N" |
| `unknown`        | Events unavailable now or then, or nothing new while coverage is unproven                              | `UNKNOWN` (never 0)       |
| `not-applicable` | No comparable view                                                                                     | `NO COMPARABLE VIEW`      |

Rules:

- Event **ids are opaque**: they answer "seen before?" and never "which came
  first". Lexical order is not chronology.
- **No clock is compared with another clock.** A view stores a watermark
  (the ids it had seen, plus the newest event's id and source time). Coverage
  is proven by identity overlap. The newest-seen event must still be
  retained, because retention drops the EARLIEST OBSERVED events first
  (Phase 7; see below), and no event-history gap may have been detected since
  the view.
- "New" means _newly observed_, so an old event that arrives late is counted
  once (and flagged ARRIVED LATE in the timeline).

Phase 5 compared source event times with the browser-clock view time. With a
skewed source clock, that could present a wrong count as exact. It was fixed
in Phase 6; checkpoint schema v2 carries the watermark, and v1 records are
discarded and reported as "outdated".

### Mission checkpoints and mission digest (`domain/missionView.ts`)

Each mission has its own local "last viewed" record, stored in
`forge-floor:mission-views`.

- **Storage:** at most 50 missions (most recent first) and 1 MB, validated
  fail-closed.
- **Contents:** ids and enum states only, per area:
  - status, result present, assignment
  - assigned workers' states, linked gates' statuses
  - alerts naming the mission, artifact ids
  - the mission's event watermark
  - which resources were unavailable, and the freshness at the time
- **When it is recorded:**
  - automatically, on leaving the mission view, hiding the tab or closing the
    page, but only from complete, connected data
  - explicitly, with "Mark mission as seen"
  - removed with "Forget this mission view"
- **Scope:** local only. Nothing is sent to the backend. It is not an
  acknowledgement, approval, completion or certification.
- **No global fallback:** a mission never viewed says so (it does not
  inherit the global last view).

Digest rules:

- Each area is compared only when known then and now. Otherwise it is
  UNKNOWN, with a reason: unavailable then or now, mission not reported, or
  history not covered.
- Records that disappear are "no longer reported", and records that return
  are "reported again". Neither means deleted, completed or resumed.
- "Nothing changed" is shown only when every area was comparable and event
  coverage is exact. Otherwise it says "cannot say" (snapshot equality does
  not rule out a change that reverted).

### Mission Control markers (`domain/missionMarkers.ts`)

| Marker        | Definition                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| NEW           | In the data now, but not listed by the comparable global last view (same source, missions loaded then and now)        |
| CHANGED       | Has its own view record from the same source, and a mission-record change or a new mission event is proven since then |
| NEEDS FOUNDER | A linked gate is in the attention queue as `PENDING_FOUNDER_GATE`                                                     |

Every marker is text, with an accessible explanation (not colour alone). No
marker means "not proven", not "proven absent".

Filter `?since=new|changed` and sort `?sort=activity` both come from these
definitions. Sort by activity uses the latest source event time, and
missions with no retained event go last.

### Attention explanations (`domain/attentionExplain.ts`)

Each queue entry shows its explanation under "Why is this here?":

- a stable reason code
- the triggering source fact
- what is known and what is unknown
- source time and data-received time
- freshness
- where acting is possible

| Code                             | Trigger                                                     | Action surface     |
| -------------------------------- | ----------------------------------------------------------- | ------------------ |
| `PENDING_FOUNDER_GATE`           | Gate PENDING/HELD; required authority = the human authority | Approval gate card |
| `GATE_AUTHORITY_INVALID`         | Open gate; required authority missing or a worker           | Approval gate card |
| `GATE_STATUS_UNRECOGNIZED`       | Gate status UNKNOWN                                         | Approval gate card |
| `ALERT_EXPLICIT_HUMAN_ACTION`    | Alert says human action required; not acknowledged/resolved | Alert card         |
| `DATA_UNAVAILABLE_AFFECTS_QUEUE` | Approvals or alerts could not be loaded (queue incomplete)  | none               |
| `DATA_NOT_CURRENT`               | Disconnected or stale data while items are shown            | none               |

Severity is shown as context and is never a trigger on its own. The order is
the table order, then oldest source time, then id. There is no score, weight
or prediction.

### Data-quality inspector (`#/quality`, `domain/dataQuality.ts`)

The inspector shows explicit dimensions and deliberately no single score:

- source (adapter, environment, verified, transport, connection)
- freshness (last complete sync, stale threshold, snapshot time)
- per-resource availability
- event history (retained / capacity, oldest and newest source times,
  coverage since the last view, newest event, most recently received event)
- arrival path counts
- classified issues (resource unavailable, record dropped, value repaired,
  transport, other), with adapter messages behind disclosure and never stack
  traces
- local view storage state, with "Forget all mission views"

It is reached from the brief, Settings → Transport and the palette. It has
no sidebar item.

### Evidence, search provenance, scoped timelines

- **Artifacts** are shown as reported evidence: who reported them, "not
  verified by the dashboard", and "an artifact is not certification".
  Certification is shown separately. The UI re-checks that links are http(s)
  (the adapter already enforces this).
- **Search results** carry `SIMULATED`, `REPLAY`, `LAST KNOWN` or `STALE`
  when the data is not LIVE and current.
- **Timeline scoping** uses `?approval=` and `?alert=` (events that
  explicitly name them), `?mission=` (with "NEW SINCE YOUR VIEW" tags from
  that mission's view) and a stated retained-history boundary.
- **Events vs empty:** when the events resource is unavailable, the timeline
  says UNKNOWN, never "No activity yet".
- **REST re-sync keeps observed events:** events already observed (for
  example over the stream) that a listing omits are kept, bounded to 500 with
  the oldest dropped first. Ingest facts keep their first arrival.

## Adversarial mock runtime and event truth (Phase 7)

Phase 7 exercises the Phase 6 claims against a real HTTP + Server-Sent Events
**mock** backend. Nothing here is the Assembly Nexus contract.

### Mock runtime and its test-data controls

| Piece                                      | Role                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `scripts/mock/backend.ts`                  | Wire format v1 from demo seed data, per-tenant in-memory state, SSE, and the bounded `/__mock/*` controls |
| `scripts/mock-runtime-server.ts`           | Serves the `--mode e2e-runtime` bundle and the mock under `/mockapi` on the same origin (127.0.0.1 only)  |
| `scripts/mock-rest-server.ts`              | Manual mock for `npm run dev` (`npm run mock:rest`); same core, plus the legacy `GET /__fail`             |
| `e2e/runtimeMock.ts`, `e2e/phase7.spec.ts` | Browser client and the runtime scenario suite                                                             |

The controls are **TEST/DEMO DATA CONTROL, never ANN authority control**:

- `POST /__mock/events` injects events by stream, listing or both (at most 50
  per call, 8 KB each). A `raw` stream message can be malformed on purpose.
  Line breaks are removed, so injected text cannot add SSE fields.
- `POST /__mock/bulk` generates up to 2,000 synthetic progress events.
- `POST /__mock/fault` makes one resource (`http500`, `down`, `malformed`,
  `slow`, `empty`) or the stream (`down`, `silent`, `malformed`) fail.
- `POST /__mock/fixture` runs one op from a closed list: hide or restore a
  mission, patch a mission's status, title or summary (bounded strings), set a
  mission's artifacts, add a PENDING gate or an alert record, set the listing
  window, clear events, or reset.
- There is no decision, grant, dispatch, deploy or code-execution operation.
  There are no file writes and no proxying, and every body is capped at 64 KB.
- The dashboard never calls these routes (`governance.phase7.test.ts`).

Each test uses its own origin (`http://<tenant>.localhost:4176`). That gives
it its own mock data and its own browser storage, so the tests run in
parallel.

### Arrival and occurrence

- `at` is the source's claimed event time. `receivedAt` is when this dashboard
  first observed the event (its own clock). Neither is ever rewritten.
- The event log is kept in **first-observation order**. Consumers that need
  event-time order sort by `at` (timeline) or by `receivedAt` (ARRIVED LATE
  detection).
- The log is bounded (500) by dropping the **earliest observed** first.
  Dropped ids are remembered (up to 5,000), so a re-listing or re-delivery is
  not re-admitted as a new arrival. A late event, with an old `at` and a new
  arrival, is therefore never the first to go.
- The snapshot's `generatedAt` is the arrival time. A skewed or late source
  time never becomes "when this data was produced".

### REST and SSE reconciliation (`RestAdapter.mergeObserved`)

| Case                                             | Behaviour                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Observed on the stream, absent from the listing  | Kept (Phase 6). A listing that omits it is not evidence it did not happen                                  |
| In the listing, never streamed                   | Added with `via: poll` and its arrival time                                                                |
| In both, same facts                              | One event; the first ingest path and arrival time are kept                                                 |
| Same id, different kind, time, mission or worker | The first observation is kept and never rewritten. The conflict is a data-quality issue (`event-conflict`) |
| Same id twice in one listing                     | Counted once and reported as `duplicate-delivery`, at record level. The events resource stays available    |
| A listing sharing no id with the previous one    | History gap: the source window moved past events that may never have been observed (`history-gap`)         |

Event ids are treated as unique identities (the mock contract's rule, not an
ANN guarantee). Payloads are not compared, because the stream and listing paths
normalize them differently.

### History gaps and coverage

`quality.eventHistoryGapAt` records the latest gap, on the dashboard clock.
Coverage is never EXACT across a gap after the view
(`historyGapSince(quality, checkpoint.at)` compares two dashboard-clock
times). It is LOWER_BOUND ("at least N") when something new was observed, and
UNKNOWN otherwise. The inspector shows "History continuity", and the unknown
area names the gap. Continuity assumes a listing is a contiguous most-recent
window; that is a mock-contract assumption to confirm against the real
contract.

### Data-quality classes

Issues now carry an adapter-set `code` for classes that are not about one
resource or record: `event-conflict`, `history-gap` and `duplicate-delivery`.
Classification never reads message text, so backend text cannot promote itself
to another class. Search results are labelled PARTIAL DATA when some resources
failed.

## Adapter contract conformance (Phase 8)

The Phase 7 assumptions are now explicit rules with profiles, an executable runner and an
inspector panel. See [CONTRACT_CONFORMANCE.md](CONTRACT_CONFORMANCE.md).

Architecturally, the change is this: EXACT event coverage now also requires the
**build-declared** contract profile to guarantee id uniqueness, id stability and contiguous
listing windows (`historyAssured`, reason `contract-unassured`). A REST backend with no declared
profile is never EXACT. The test builds declare the mock profile.

## Loading and code splitting

- `main.tsx` loads the viewer's language catalog (English is bundled, Spanish is a
  separate chunk) before first render, alongside the adapter.
- `main.tsx` loads only the configured adapter, through a dynamic import in
  `src/adapters/loadAdapter.ts`. A REST build never downloads the demo simulation, and a demo
  build never downloads the REST adapter.
- Each surface is a `React.lazy` chunk (`src/app/surfaces.ts`). Once the first surface
  renders, the others are prefetched while the browser is idle.
- The palette and keyboard reference are deliberately **not** lazy. A lazy dialog lost the
  keystrokes typed right after Ctrl+K, and focus could not be restored when it closed.
- Loading shows an accessible status (`SurfaceLoading`). A failed chunk load shows
  `SurfaceErrorBoundary` with a Retry that creates a fresh lazy import, instead of a blank page.
- A surface marks itself `data-surface="ready"` once rendered. Tests and visual snapshots wait
  on that.

## Performance guards

- One shared interval per refresh rate for every clock (`useNow` → `src/store/hooks.ts`),
  not one per component.
- Bounded state: the event log (500), worker messages (300) and finished demo missions (60).
- Long lists render incrementally (`useIncremental` + "Show more").
- `?demo=stress` loads a deterministic 120-worker, 400-mission, 5,000-event dataset.
  `src/test/perf.test.tsx` and `e2e/performance.spec.ts` hold the budgets: interval count,
  render time and long tasks.

## Verification layers

| Layer                               | Tool                              | Location                                                |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------- |
| Domain/reducer/time                 | Vitest                            | `src/domain/*.test.ts`                                  |
| Governance regressions              | Vitest                            | `src/domain/governance.test.ts`                         |
| Adapter behaviour                   | Vitest + in-memory backend        | `src/adapters/**/*.test.ts`, `src/test/fakeBackend.ts`  |
| Adapter conformance                 | Shared suite                      | `src/test/conformance.ts`                               |
| UI flows/failure states             | Testing Library (jsdom)           | `src/app/*.test.tsx`, `src/features/command/*.test.tsx` |
| Structural a11y                     | axe-core (jsdom)                  | `src/test/a11y.test.tsx`                                |
| Browser a11y/keyboard/runtime       | Playwright + @axe-core/playwright | `e2e/*.spec.ts`                                         |
| Transport conformance               | Vitest + fake EventSource         | `src/adapters/transport/conformance.test.ts`            |
| Phase-3 governance + static guard   | Vitest                            | `src/domain/governance.phase3.test.ts`                  |
| Visual regression                   | Playwright screenshots            | `e2e/visual.spec.ts`, `e2e/__screenshots__`             |
| Performance budgets                 | Vitest + Playwright               | `src/test/perf.test.tsx`, `e2e/performance.spec.ts`     |
| Phase-4 governance                  | Vitest                            | `src/app/governance.phase4.test.tsx`                    |
| i18n parity + glyph coverage        | Vitest                            | `src/i18n/*.test.ts`                                    |
| URL state                           | Vitest + Playwright               | `src/app/urlState.test.tsx`, `e2e/phase4.spec.ts`       |
| Adversarial SSE/REST                | Vitest + fake EventSource         | `src/adapters/rest/stream.adversarial.test.ts`          |
| Mobile/ultrawide + Spanish          | Playwright                        | `e2e/phase4.spec.ts`                                    |
| Event truth (late/dup/conflict/gap) | Vitest + fake EventSource         | `src/adapters/rest/eventTruth.test.ts`                  |
| Phase-7 governance + static guards  | Vitest                            | `src/app/governance.phase7.test.ts`                     |
| Adversarial mock runtime            | Playwright + real HTTP/SSE mock   | `e2e/phase7.spec.ts`, `scripts/mock-runtime-server.ts`  |
| Contract conformance runner         | Vitest + in-process mock probe    | `src/domain/contract/conformance.test.ts`               |
| Phase-8 governance                  | Vitest                            | `src/app/governance.phase8.test.tsx`                    |
| Contract inspector (browser)        | Playwright + runtime mock         | `e2e/phase8.spec.ts`                                    |
