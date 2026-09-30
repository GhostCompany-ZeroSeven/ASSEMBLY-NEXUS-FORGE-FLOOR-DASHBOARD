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

| Layer                             | Tool                              | Location                                                |
| --------------------------------- | --------------------------------- | ------------------------------------------------------- |
| Domain/reducer/time               | Vitest                            | `src/domain/*.test.ts`                                  |
| Governance regressions            | Vitest                            | `src/domain/governance.test.ts`                         |
| Adapter behaviour                 | Vitest + in-memory backend        | `src/adapters/**/*.test.ts`, `src/test/fakeBackend.ts`  |
| Adapter conformance               | Shared suite                      | `src/test/conformance.ts`                               |
| UI flows/failure states           | Testing Library (jsdom)           | `src/app/*.test.tsx`, `src/features/command/*.test.tsx` |
| Structural a11y                   | axe-core (jsdom)                  | `src/test/a11y.test.tsx`                                |
| Browser a11y/keyboard/runtime     | Playwright + @axe-core/playwright | `e2e/*.spec.ts`                                         |
| Transport conformance             | Vitest + fake EventSource         | `src/adapters/transport/conformance.test.ts`            |
| Phase-3 governance + static guard | Vitest                            | `src/domain/governance.phase3.test.ts`                  |
| Visual regression                 | Playwright screenshots            | `e2e/visual.spec.ts`, `e2e/__screenshots__`             |
| Performance budgets               | Vitest + Playwright               | `src/test/perf.test.tsx`, `e2e/performance.spec.ts`     |
| Phase-4 governance                | Vitest                            | `src/app/governance.phase4.test.tsx`                    |
| i18n parity + glyph coverage      | Vitest                            | `src/i18n/*.test.ts`                                    |
| URL state                         | Vitest + Playwright               | `src/app/urlState.test.tsx`, `e2e/phase4.spec.ts`       |
| Adversarial SSE/REST              | Vitest + fake EventSource         | `src/adapters/rest/stream.adversarial.test.ts`          |
| Mobile/ultrawide + Spanish        | Playwright                        | `e2e/phase4.spec.ts`                                    |
