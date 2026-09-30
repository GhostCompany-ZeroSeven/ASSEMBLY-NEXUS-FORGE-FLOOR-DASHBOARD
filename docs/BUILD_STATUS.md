# Build Status: Forge Floor Dashboard

_Operational continuity log. A later session should read this first._

- **Branch:** `claude/epic-cannon-zezh6m` (session branch; never merged to `main`)
- **Session 1:** `3a3e217` → `1d2600c` (foundation, phases A–Q)
- **Session 2:** `1d2600c` → `7ae4ed8` (hardening, generic adapter, accessibility)
- **Session 3:** `7ae4ed8` → UI/UX product hardening (Phase 3); see `git log` for the head
- **Last updated:** 2026-09-30

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

## Verification (last run, session 3)

| Check                  | Result                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run format:check` | pass                                                                                                      |
| `npm run typecheck`    | pass (app, and node/e2e)                                                                                  |
| `npm run lint`         | pass (0 warnings)                                                                                         |
| `npm test` (Vitest)    | **266/266** across 24 files (unit, integration, adapter and transport conformance, governance, jsdom axe) |
| `npm run test:e2e`     | **59/59** in CI mode: axe + contrast, keyboard, runtime/overflow, performance, 25 visual baselines        |
| `npm run build`        | pass                                                                                                      |

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

## Known limitations

- Visual baselines were generated in the session's Linux Chromium (Playwright 1.56.1), not in
  the pinned CI image. If CI shows only sub-pixel text differences, regenerate them in the image
  (`docs/VISUAL_REGRESSION.md`).
- While an SSE stream is healthy, REST health is re-verified every `resyncIntervalMs` (60s by
  default). The stream heartbeat covers connectivity in between.
- The SSE contract is this project's mock contract, not an Assembly Nexus API.
- A partial first sync can show LIVE (the backend is verified) together with STALE ("no complete
  sync yet"). Both labels are accurate, but the Founder may want a stricter LIVE rule.

## Next autonomous actions

1. Confirm the visual baselines in the pinned CI image, and regenerate there if needed.
2. Localisation scaffolding for UI strings.
3. Stream-state detail in Settings (state, attempts, last event id).
4. A persisted filter state per surface in the URL for Missions, Workers and Approvals (the
   Floor already does this).
5. An adapter for the real Assembly Nexus contract, once the Founder decides it.
