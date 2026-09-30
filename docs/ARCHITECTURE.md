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

| Layer      | Path                       | Rules                                                                    |
| ---------- | -------------------------- | ------------------------------------------------------------------------ |
| Domain     | `src/domain`               | Pure TS. Types, events, reducer, selectors, formatting. No React.        |
| Adapters   | `src/adapters`             | The only place that knows about backends. Emits normalized data only.    |
| REST       | `src/adapters/rest`        | Config validation, HTTP+timeout, untrusted-payload normalizer, adapter.  |
| Governance | `src/domain/governance.ts` | Single decision rule set used by UI and every adapter.                   |
| Commands   | `src/features/command`     | Command palette, shortcut layer, keyboard reference.                     |
| Transport  | `src/adapters/transport`   | Moves raw messages. No domain knowledge.                                 |
| Config     | `src/config`               | Brand/product specifics. Only `main.tsx` imports the first-party config. |
| Store      | `src/store`                | React context wiring; hooks (`useSnapshot`, `useConfig`, `useNow`).      |
| Characters | `src/characters`           | `CharacterAvatar` resolves art from config; procedural SVG placeholders. |
| Features   | `src/features/*`           | One folder per surface.                                                  |
| Styles     | `src/styles`               | Tokens → base → components → shell → floor → features.                   |

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

## Loading and code splitting

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
