# Build Status: Forge Floor Dashboard

_Operational continuity log. A later session should read this first._

- **Branch:** `claude/epic-cannon-zezh6m` (session branch; never merged to `main`)
- **Session 1:** `3a3e217` → `1d2600c` (foundation, phases A–Q)
- **Session 2:** `1d2600c` → `7ae4ed8` (hardening, generic adapter, accessibility)
- **Session 3:** `7ae4ed8` → `0d77f3a` (UI/UX product hardening, Phase 3)
- **Session 4:** `0d77f3a` → product hardening Phase 4; see `git log` for the head
- **Last updated:** 2026-09-30

## Session 4: product hardening (Phase 4)

Continuity was verified at the start: branch `claude/epic-cannon-zezh6m`, HEAD `0d77f3a` (matching
the remote), `main` at `3a3e217`, a clean tree, six Phase 3 commits and no AI co-author trailers.
The baseline stack passed first: 266 unit tests, 59 browser tests.

### Delivered

| Objective                        | Result                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI visual baseline certification | Rendered in the pinned image (`playwright:v1.56.1-noble`). The glyph fallback was removed at its source, so the session and CI renders are byte-identical (31/31). The tolerance is strict (≤20 px); see VISUAL_REGRESSION.md               |
| Localization                     | English (default) and Spanish. Typed catalogs with compile-time parity, lazy Spanish chunk, `<html lang>`, a Settings control and palette command, browser language as the initial preference, validated storage, localized config text     |
| URL state                        | Missions, Workers, Approvals, Alerts and Activity. Validated, bounded, readable params; Back/Forward, refresh and deep links; fail-safe parsing                                                                                             |
| Transport diagnostics            | Settings → Transport and freshness: configured/active transport, fallback, stream state, attempts, last message/event, rejected messages, last REST verification/attempt, intervals. UNKNOWN when not reported, and no addresses or secrets |
| Freshness model                  | One source (SIMULATED, LIVE, DISCONNECTED, REPLAY) plus coexisting qualifiers (STALE, PARTIAL, UNKNOWN, LAST KNOWN DATA). `complete` is never inferred from transport, and the Founder's LIVE rule is not decided                           |
| Observability                    | Per event: exact time, explicit worker/mission/approval/alert/artifact links, ingest path (STREAM/POLL/SIM). No invented room. Bounded log. Activity filters by category, worker and mission                                                |
| Command palette                  | Switch language, transport diagnostics, jump to Founder attention, jump to unavailable resources, clear filters. Navigation and presentation only                                                                                           |
| Mobile/ultrawide                 | 320, 390, 768, 1080p, 1440 and 2560 with Spanish text, large counts, very long names and titles, palette and room panel: no horizontal overflow                                                                                             |
| Accessibility                    | axe (WCAG 2.2 AA incl. contrast) on every surface in Spanish; `<html lang>`; focus restore in the Spanish palette; accessible scroll regions for wide tables                                                                                |
| Governance                       | `src/app/governance.phase4.test.tsx`: localized label, URL, search, palette, transport-vs-complete, HTTP-success, SSE-claim rules plus static guards                                                                                        |

### Defects found and fixed this session (each with regression coverage)

| Defect                                                                                                                                                                                                               | Fix                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Governance:** an HTTP 200 whose decision record named a _worker_ as `decidedBy` was accepted as a confirmed decision                                                                                               | The confirmed record must itself pass `checkDecision` (required human authority, never a worker) |
| **Recovery:** with the stream open, REST re-verification was throttled to `resyncIntervalMs` (60s) even while unverified, so the badge stayed DISCONNECTED against a healthy backend (found in the real-browser run) | Throttle only while verified; a stream reopening while unverified re-verifies immediately        |
| **Ordering:** a late or out-of-order `worker.state_changed` rolled a worker back to an older state                                                                                                                   | Events older than the worker's `stateSince` are logged but do not change the current state       |
| **Stream recovery:** once the stream gave up (`failed`) it never came back until a reload                                                                                                                            | Re-armed after a verified REST sync and a 5-minute cool-down (bounded, no storm)                 |
| **Visual baselines environment-dependent:** `→` fell outside the bundled font subsets                                                                                                                                | Drawn arrow icon; glyph-coverage test over catalogs, config and TSX/CSS                          |
| **Visual tolerance too loose:** a 1% budget hid real layout shifts, so 3 stale Phase 3 baselines went unnoticed                                                                                                      | Strict budget (≤20 px, threshold 0.1); the stale baselines were investigated and regenerated     |
| **Layout:** very long unbreakable names overflowed worker cards, gate cards and stacked rooms (320–768px)                                                                                                            | `overflow-wrap: anywhere` + `min-width: 0` on content containers                                 |
| **Copy regression during extraction:** three worker-state descriptions were retyped differently                                                                                                                      | Restored; a test now keeps the English catalog identical to the domain labels                    |

### Bundle

| Measure                                              | Phase 3 end                  | Phase 4                                                                       |
| ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Entry chunk                                          | 256.27 kB / 80.84 kB gzip    | 303.60 kB / 96.75 kB gzip                                                     |
| Largest entry contributors (measured via source map) | react-dom 207 kB             | react-dom 207 kB, English catalog 26 kB, search/commands/palette/i18n runtime |
| Spanish catalog                                      | n/a                          | separate chunk, 29.90 kB / 10.30 kB gzip, loaded only for Spanish             |
| Adapter chunks                                       | Demo 35.09 kB, REST 27.85 kB | Demo 35.19 kB, REST 29.20 kB (diagnostics)                                    |

Before the split, the entry was 332.9 kB / 104.5 kB gzip with both catalogs bundled. Lazy-loading
Spanish saved 29.3 kB raw for English users.

### Performance (measured, same machine, same stress run, 5 runs each)

| Median                       | Phase 3 build | Phase 4 build |
| ---------------------------- | ------------- | ------------- |
| First render, stress floor   | 512 ms        | 519 ms        |
| Worst long task at 4× for 8s | 95 ms         | 85 ms         |
| Total long-task time         | 147 ms        | 85 ms         |

No regression, so no optimization was made. Repeated language switching leaves no timer growth
(browser test), and locale switching does not reload or reconnect.

### Runtime browser exercise (real mock server, REST + SSE)

- English and Spanish at 390, 820, 1440 and 2560: `LIVE · STREAM` / `EN VIVO · FLUJO`, correct
  `<html lang>`, no overflow, demo code never loaded, Spanish chunk loaded only for Spanish.
- Fault sequence (exact badge reads):

  | Step                        | Badge                                            |
  | --------------------------- | ------------------------------------------------ |
  | healthy                     | LIVE · STREAM, complete                          |
  | malformed message           | LIVE · STREAM (rejected counted)                 |
  | stream crash                | LIVE · POLL (FALLBACK)                           |
  | health down during fallback | DISCONNECTED · STALE · PARTIAL · LAST KNOWN DATA |
  | stream back                 | LIVE · STREAM                                    |

- Zero page errors. The only console errors were the browser logging the injected 503s and
  dropped connections.

## Session 3: UI/UX product hardening (Phase 3)

Continuity was verified at the start: branch `claude/epic-cannon-zezh6m`, HEAD `7ae4ed8`, a clean
tree, and `main` untouched.

### Delivered

| Objective           | Result                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSE transport       | Optional `rest.stream`. Bounded reconnect, heartbeat staleness, explicit states, polling fallback, `lastEventId` resume, size limit, and no credentials. Built on a mock contract only, with transport conformance tests |
| Global search       | In the palette: missions, workers, rooms, alerts, approval gates, artifacts and events. Each result shows type, name, status, location and context, then navigates and focuses                                           |
| Filters and sorting | Floor, Missions, Workers, Approvals, Alerts. Distinct filtered, source-zero and unavailable empty states                                                                                                                 |
| Visual regression   | 25 deterministic Playwright baselines (demo and REST mock) from phone to 2560px. CI runs them in a pinned image. See `docs/VISUAL_REGRESSION.md`                                                                         |
| Code splitting      | Lazy surfaces and adapters, idle prefetch, an accessible loading state, and retry after a chunk-load failure                                                                                                             |
| Floor UX            | Highlight filters, mission association, room panel, overflow chips, SVG state glyphs plus text (never colour alone), and a movement live region                                                                          |
| Cross-navigation    | Mission ↔ worker ↔ room ↔ approval ↔ alert ↔ artifact, only through relationships present in the data                                                                                                                    |
| Operations overview | Situation board. Answers **Unknown** when the underlying data could not be fetched                                                                                                                                       |
| Character system    | Poses (idle, working, moving, blocked, waiting-founder, complete, failed) and per-room art. Presentation only, never identity or authority                                                                               |
| Performance         | Shared clocks (210 intervals → ≤4 under stress), bounded retention, and a `?demo=stress` dataset with budgets                                                                                                            |
| Governance          | `governance.phase3.test.ts`: 10 requirement blocks plus a static guard proving there is no alternate approval path                                                                                                       |

### Defects found and fixed this session (each with regression coverage)

| Defect                                                                                                                                              | Fix                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A failed missions or approvals fetch showed "Nothing", "All quiet", "No decisions waiting" and "No open alerts"                                     | Situation answers become **Unknown**. Panels and lists say "… data unavailable"          |
| An SSE stream that connects but never delivers retried forever (the count reset on open) and never fell back                                        | The count resets only on delivered data. Unit test for the silent stream                 |
| A lazy palette lost keys typed right after Ctrl+K and could not restore focus (the frame went inert before mount)                                   | Dialogs load eagerly (about 3 kB)                                                        |
| Horizontal page overflow on phones with real-backend data: the filter bar grid track grew to min-content                                            | `minmax(0, 1fr)` track. New 320px stress e2e test (it failed at 434px before the fix)    |
| Worker cards (300px minimum) and panel header actions overflowed at 320px                                                                           | `min(300px, 100%)` columns, and wrapping panel headers                                   |
| Activity reference links were below the 24×24 target size once fonts were bundled (WCAG 2.2 SC 2.5.8)                                               | 24px minimum targets with spacing                                                        |
| No sorting on Workers or Alerts                                                                                                                     | Attention, name or time-in-state sort for workers; severity, newest or oldest for alerts |
| Earlier this session: 210 live intervals under stress, missing SSE fallback semantics, alert grammar, forced capitalisation, phone situation layout | Fixed in `bad3b58`…`ef3bf8e`                                                             |

### Bundle

| Measure                            | Before (start of session)  | After                                                                |
| ---------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Entry chunk                        | 395.92 kB / 116.29 kB gzip | 256.27 kB / 80.84 kB gzip                                            |
| With the Phase 3 features, unsplit | 434.21 kB / 127.07 kB gzip | n/a                                                                  |
| Adapter chunks                     | in entry                   | Demo 35.09 kB, REST 27.85 kB (only the configured one loads)         |
| Fonts                              | system fonts               | Inter and JetBrains Mono, about 88 kB of latin woff2 (unicode-range) |

### Runtime browser exercise

- **Demo:** all surfaces run in Chromium at 390, 820, 1440, 1920 and 2560px through the e2e suite
  and the visual baselines.
- **Local mock backend** (`npm run mock:rest`, REST + `/stream`, real server):
  - LIVE · MOCK · STREAM at phone, tablet, desktop and wide, with no horizontal overflow
  - the demo chunk never downloads
  - a malformed stream message shows as a data warning
  - a stream crash shows POLL (FALLBACK) and a banner, and polling continues
  - health down during fallback shows DISCONNECTED, and recovery returns LIVE
  - the stream reconnects and shows STREAM again
  - zero console or page errors

## Session 2: hardening, generic adapter, accessibility

### Verification of session 1 (independent)

- Branch, HEAD and remote matched the report. The tree was clean, and the commit had no AI
  co-author trailer.
- The suite passed: 51 tests, typecheck, lint, format and build.
- Architecture claims hold: no UI code imports the demo adapter, only `main.tsx` imports the
  first-party config, and reduced-motion CSS covers both the system setting and the override.

### Defects found and fixed (each with regression coverage)

| Defect                                                                                                    | Fix                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A malformed request naming a worker as `requiredAuthority` could let that worker decide                   | Shared `governance.ts`: workers (by id or name) and the requester can never decide   |
| Unknown backend states silently mapped to `WAITING`                                                       | `UNKNOWN` state for workers, missions and approvals; `mapWorkerState` defaults to it |
| Prototype keys (`constructor`, `toString`) resolved as state mappings                                     | `hasOwnProperty` guard                                                               |
| `DashboardProvider` forced status to `connected` after `connect()`, overwriting the adapter's own `error` | Adapter-reported status wins                                                         |
| The top-bar health link pointed at `#/#health`, which rendered "Not found"                                | Link fixed                                                                           |
| Initial page load moved focus into `main`, so Tab skipped the skip link and header                        | Focus moves only on navigation                                                       |
| Segment clocks used `aria-label` on a plain `div` (prohibited ARIA)                                       | `role="group"` + `aria-labelledby`, real text value                                  |
| Faint text contrast was 4.1:1, the danger chip 4.31:1, and in-text links relied on colour only            | Tokens raised to ≥4.7:1; body links underlined                                       |
| The "Working" badge wrapped in the mission crew list                                                      | Selector fixed                                                                       |

### Delivered

- **GenericRESTAdapter** (`src/adapters/rest`):
  - bounded, validated config: no credentials or secret-looking URLs, clamped timing, `omit` or
    `same-origin` cookies only
  - per-request timeouts
  - an untrusted-payload normalizer that reports every issue
  - per-resource partial and last-good handling, and stale tracking
  - LIVE only when verified
  - decisions count only on backend confirmation, with no optimistic state
- **Adapter conformance suite** (`src/test/conformance.ts`), run against Demo and REST.
- **Failure states:**
  - unavailable, timeout, malformed, partial, stale, reconnecting and adapter error, the last with
    a Retry screen
  - empty queue, and zero workers vs unavailable worker data
  - unknown status and unsupported capability
- **Governance regression suite** (`src/domain/governance.test.ts`): the Founder's 10 requirements.
- **Accessibility:**
  - axe in jsdom on every surface and state
  - Playwright + axe in Chromium with contrast (WCAG 2.2 AA tags), including the Snow Wolf theme
    and phone width
  - keyboard, focus-visibility, focus-trap and reduced-motion e2e tests
- **Command palette + keyboard layer:**
  - Ctrl/⌘+K, `/`, `?`, and G-sequences for navigation
  - P/N to pause or step the demo, Esc handling
  - an in-app reference with an off switch for single-key shortcuts (WCAG 2.1.4)
  - an accessible `Dialog` primitive, with the background made `inert`
- **Visual polish:**
  - balanced stat rows (4×2 or 8×1) and no brand wrap
  - wider layout on 2560px screens
  - two-column stacked floor on tablets
  - a Founder Gate explanation note
  - dashed styling for UNKNOWN floor tokens
  - "Simulated result" tag on demo mission results
- **Local mock REST backend** (`npm run mock:rest`) with failure injection. It was verified end to
  end in Chromium: LIVE·MOCK → HOLD delivered → PARTIAL DATA → DISCONNECTED/Reconnecting → LIVE.
- **CI:** a second job runs the Playwright browser suite and uploads the report on failure.

## Verification (last run, session 4)

| Check                                                   | Result                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run format:check`                                  | pass                                                                                       |
| `npm run typecheck`                                     | pass (app, and node/e2e)                                                                   |
| `npm run lint`                                          | pass (0 warnings)                                                                          |
| `npm test` (Vitest)                                     | **331/331** across 33 files                                                                |
| — adapter conformance / REST adapter, config, normalize | 16/16 · 17/17 · 11/11 · 15/15                                                              |
| — transport conformance / SSE / stream / adversarial    | 10/10 · 10/10 · 9/9 · 9/9                                                                  |
| — governance (phase 2 / 3 / 4)                          | 23/23 · 24/24 · 16/16                                                                      |
| — i18n parity, formatting, glyph coverage, UI           | 9/9 · 4/4 · 4/4                                                                            |
| — URL state / freshness / diagnostics / activity refs   | 9/9 · 6/6 · 5/5 · 3/3                                                                      |
| — UI flows, failure states, a11y (jsdom), perf          | 11/11 · 15/15 · 15/15 · 12/12                                                              |
| `npm run test:e2e`                                      | **83/83** in CI mode: a11y 15, keyboard 7, runtime 6, performance 6, phase 4 18, visual 31 |
| Visual suite in the pinned CI image                     | 31/31, twice                                                                               |
| `npm run build`                                         | pass                                                                                       |

### Session 3 verification (historical)

| Check               | Result                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest) | **266/266** across 24 files (unit, integration, adapter and transport conformance, governance, jsdom axe) |
| `npm run test:e2e`  | **59/59** in CI mode: axe + contrast, keyboard, runtime/overflow, performance, 25 visual baselines        |

### Session 2 verification (historical)

| Check                           | Result                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`             | pass                                                                                                     |
| `npm run lint`                  | pass (0 warnings)                                                                                        |
| `npm run format:check`          | pass                                                                                                     |
| `npm test` (Vitest)             | **172/172** across 15 files                                                                              |
| — adapter conformance           | 16/16 (Demo + REST)                                                                                      |
| — REST adapter/config/normalize | 43/43                                                                                                    |
| — governance regressions        | 23/23                                                                                                    |
| — axe structural (jsdom)        | 15/15                                                                                                    |
| — UI failure states             | 12/12                                                                                                    |
| — palette/shortcuts             | 12/12                                                                                                    |
| `npm run test:e2e` (Playwright) | **27/27** (axe + contrast, keyboard, reduced motion, runtime errors and overflow at 390/820/1440/2560px) |
| `npm run build`                 | pass (396 kB JS / 116 kB gzip)                                                                           |

## What remains simulated

- All demo data: workers, missions, approvals, alerts, events and messages.
- Demo approval decisions, marked `delivery: 'simulated'`.
- Demo messages, marked "Not delivered — demo". No replies are ever generated.
- Demo mission results, tagged "Simulated result".
- The mock REST server is a local test double. It echoes `decidedBy` without authentication.

## Founder decisions required

1. **Licence** before any public release. None has been chosen, and none should be added until
   the Founder decides.
2. **Assembly Nexus integration:**
   - the API contract (conform to wire format v1, or write a dedicated adapter)
   - the auth approach
   - the backend-for-frontend or proxy location
   - where credentials live
3. **Deployment and hosting** of the dashboard and proxy.
4. **LIVE rule:** whether LIVE should require a complete first sync. Today it means "verified
   backend + connected transport", with STALE, PARTIAL and UNKNOWN shown alongside it. The
   freshness model can represent either choice.
5. **Assembly Nexus event stream:** whether one exists, and its contract. The SSE path is built
   against this project's mock contract only.

## Known limitations

- While an SSE stream is healthy **and the backend is verified**, REST health is re-verified every
  `resyncIntervalMs` (60s by default). A health endpoint failing while the stream stays up is
  noticed within that window. Once unverified, re-checks run at the poll interval.
- After a REST outage, polling backs off up to 60s, so returning to LIVE can take up to that long
  (sooner when the stream reconnects).
- The CI browser job has not yet run on GitHub for this branch; the pinned image was verified
  locally with Docker. The CI workflow itself is unchanged.
- Only English and Spanish are provided. Config text is localized for the first-party config only.
  `main.tsx`'s pre-React startup error message is English.
- The SSE contract is this project's mock contract, not an Assembly Nexus API.
- A partial first sync can show LIVE (the backend is verified) together with STALE ("no complete
  sync yet"). Both labels are accurate, but the Founder may want a stricter LIVE rule.

## Next autonomous actions

1. Watch the first GitHub CI run of the browser job in the pinned image, and act on any diffs.
2. Locale-aware number and date formatting beyond relative times (e.g. `Intl.DateTimeFormat`
   for absolute timestamps).
3. A small "what changed since I last looked" view built from the bounded event log.
4. Optional runtime translation QA: a pseudo-locale for catching truncation and hard-coded text.
5. An adapter for the real Assembly Nexus contract, once the Founder decides it.
