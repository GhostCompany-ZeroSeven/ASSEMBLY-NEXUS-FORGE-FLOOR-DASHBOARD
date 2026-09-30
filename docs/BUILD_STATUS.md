# Build Status: Forge Floor Dashboard

_Operational continuity log. A later session should read this first._

- **Branch:** `claude/epic-cannon-zezh6m` (session branch; never merged to `main`)
- **Session 1:** `3a3e217` → `1d2600c` (foundation, phases A–Q)
- **Session 2:** `1d2600c` → hardening (this document); see `git log` for the head
- **Last updated:** 2026-09-30

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

## Verification (last run)

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

## Next autonomous actions

1. SSE `EventTransport` + event-stream adapter using `applyEvent`, once a backend exposes one.
2. Floor worker search/filter and room drill-down; mission list search.
3. Code-split feature routes, once the bundle passes about 500 kB.
4. Visual regression snapshots (Playwright screenshots) for key surfaces.
5. Localisation scaffolding for UI strings.
