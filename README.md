# Forge Floor — Assembly Nexus Operations Dashboard

A backend-agnostic, open-source operations dashboard for AI agents and autonomous workflows:
live missions, worker states, reviews, approval gates, alerts, a visual workspace full of
characters, customizable themes, and pluggable adapters. Built for serious orchestration with a
little Snow Wolf chaos. 🐺⚡

> **The Forge took their hair as payment.** The default crew is a team of small lab-coated
> scientists with bald crowns and whatever hair survived around the sides.

> ⚠️ **Data provenance.** Out of the box the dashboard runs the **Local Demo Simulation**. Every
> worker, mission, approval and alert is simulated in your browser, and the UI labels it
> **DEMO · SIMULATED** everywhere. A **GenericRESTAdapter** can read a real backend that speaks the
> documented wire format, but **no Assembly Nexus backend is connected yet**. See
> [docs/ADAPTERS.md](docs/ADAPTERS.md).

## Surfaces

| Surface             | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Command Center**  | Situation board (what needs the Founder, live or simulated, backend health, running, blocked, failed, just completed), featured mission, Founder Gate queue, floor preview, alerts, health, crew, activity. A question it cannot answer from the data says **Unknown**                                                                                                                                                                                                               |
| **Forge Floor**     | Rooms (Planning, Research, Build, Security, Review, Certification, Ops, Founder Gate, Snow Wolf Den, Break). Workers walk between rooms as their state changes. Highlight filters, mission association, room panel; state shown as text and a glyph, never by colour alone                                                                                                                                                                                                           |
| **Missions**        | Mission board and per-mission control: elapsed/remaining clocks, tasks, dependencies, artifacts, review, certification, approvals, timeline, MISSION COMPLETE results                                                                                                                                                                                                                                                                                                                |
| **Workers**         | Worker cards, and a full-screen focus view with timeline, conversation panel, blockers, artifacts and telemetry                                                                                                                                                                                                                                                                                                                                                                      |
| **Approval Gates**  | APPROVE / DENY / HOLD with a confirmation step, required notes, risk and reversibility, and a clear split between capability and authority                                                                                                                                                                                                                                                                                                                                           |
| **Alerts**          | INFO / NOTICE / WARNING / CRITICAL. Each alert says what happened, what is affected, what needs attention, and whether human action is required. An unacknowledged CRITICAL alert switches the shell to Red Alert                                                                                                                                                                                                                                                                    |
| **Activity**        | Operations timeline of observed events, newest event time first. It keeps event time, arrival (path, received time, ARRIVED LATE) and the linked record's **Now** state apart. Filters: category, worker, mission, time range (incl. since last view) and ingest path                                                                                                                                                                                                                |
| **Brief**           | Founder morning/return brief: what changed since the last view (local checkpoint, UNKNOWN when not comparable), the Founder attention queue (source, reason, state, freshness, link; navigation only) and data/transport problems. Missing data shows UNKNOWN, never 0                                                                                                                                                                                                               |
| **Mission detail**  | Founder command surface: status and source, Founder attention for this mission (with "Why is this here?"), what changed since you last viewed THIS mission (local, UNKNOWN when not comparable), gates, a tagged timeline, participants and reported evidence (not certification)                                                                                                                                                                                                    |
| **Data quality**    | `#/quality`: why a page says UNKNOWN / STALE / PARTIAL / LAST KNOWN, one explicit dimension at a time (source, freshness, resources, event history and coverage, arrival paths, classified issues, local view memory). No single score                                                                                                                                                                                                                                               |
| **Command palette** | `Ctrl/⌘ + K`: commands plus **global search** across missions, workers, rooms, alerts, approval gates, artifacts and events. Each result shows its type, name, status, location and context; choosing one navigates and focuses it. Also: jump to what needs the Founder or to a data problem, open transport diagnostics, clear filters, switch language. Palette commands only navigate or change presentation; they never decide, grant or dispatch. Press `?` for every shortcut |
| **Settings**        | Theme (Forge / Snow Wolf), motion, density, adapter capabilities, governance, rooms, characters, status mapping                                                                                                                                                                                                                                                                                                                                                                      |

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Demo controls are in the top bar (**SIM**): pause/resume, single-step, speed, and reset. The demo
never decides approvals itself. Pending gates stay pending until you act.

### Try the GenericRESTAdapter locally

```bash
npm run mock:rest   # local mock backend on http://127.0.0.1:8787 (environment: mock)
VITE_FORGE_ADAPTER=rest VITE_FORGE_REST_BASE_URL=http://127.0.0.1:8787 npm run dev
```

With `VITE_FORGE_REST_STREAM=/stream` the mock also streams events. Bounded test-data controls
(`POST /__mock/events|bulk|fault|fixture`) inject late, duplicate or conflicting events, faults and
fixtures; see docs/ARCHITECTURE.md ("Adversarial mock runtime"). They are mock-only and are never
called by the dashboard.

The badge shows **LIVE · MOCK** only while the mock's health endpoint answers. To see the failure
states, inject a fault, for example
`curl "http://127.0.0.1:8787/__fail?resource=workers&mode=malformed"` (modes: `down`, `http500`,
`malformed`, `slow`, `off`). `VITE_*` variables are compiled into the client bundle, so never put
secrets in them.

## Scripts

| Command                        | Purpose                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                  | Vite dev server                                                                                                                                                |
| `npm run build`                | Typecheck + production build to `dist/`                                                                                                                        |
| `npm run preview`              | Serve the production build                                                                                                                                     |
| `npm run typecheck`            | TypeScript project check                                                                                                                                       |
| `npm run lint`                 | ESLint (typescript-eslint, react-hooks)                                                                                                                        |
| `npm run format:check`         | Prettier check (`npm run format` to write)                                                                                                                     |
| `npm test`                     | Vitest unit, component, conformance, governance and axe tests (jsdom)                                                                                          |
| `npm run test:e2e`             | Build, then Playwright: axe incl. contrast (English and Spanish), keyboard, reduced motion, runtime errors, overflow from 320px to 2560px, performance, visual |
| `npm run test:a11y`            | Only the accessibility audits (jsdom + browser)                                                                                                                |
| `npm run test:visual`          | Visual regression screenshots (see [docs/VISUAL_REGRESSION.md](docs/VISUAL_REGRESSION.md))                                                                     |
| `npm run test:visual:update`   | Rewrite visual baselines after an intended change (review the PNGs before committing)                                                                          |
| `npm run test:visual:ci-image` | Visual regression inside the pinned CI image (Docker); `:update` rewrites baselines there                                                                      |
| `npm run mock:rest`            | Local mock REST backend for the GenericRESTAdapter                                                                                                             |
| `npm run mock:runtime`         | App (`--mode e2e-runtime` bundle) + same-origin REST/SSE mock for the Phase 7 runtime suite (`npm run build:e2e-runtime` first)                                |
| `npm run verify`               | typecheck → lint → test → build (CI also runs format check and e2e)                                                                                            |

## Stack

Vite · React 19 · TypeScript (strict) · plain CSS with design tokens · Vitest + Testing Library ·
ESLint · Prettier. There is no UI framework, router, state library or icon font. Hash routing lets
the build be served as static files from anywhere.

## Architecture in one paragraph

UI components read only **normalized domain models** (`src/domain`). A single **adapter**
(`src/adapters`) connects to a backend, translates its payloads into those models, and emits
snapshots and structured events. A pure **reducer** applies events to snapshots, so any event-stream
backend can reuse it. **Transport** (polling now; SSE/WebSocket later) is kept separate from
adapters. **Configuration** (`src/config`) holds branding, governance, themes, rooms, crews,
characters, feature flags and status mappings, so Assembly Nexus is the first-party config rather
than a hard-coded dependency. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Customizing

- Brand, rooms, crews, characters, flags: [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- Languages (English, Spanish): [docs/LOCALIZATION.md](docs/LOCALIZATION.md)
- Screenshot baselines: [docs/VISUAL_REGRESSION.md](docs/VISUAL_REGRESSION.md)
- Connecting a backend: [docs/ADAPTERS.md](docs/ADAPTERS.md)
- Build progress and next steps: [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md)

## Governance principles baked into the UI

- Only the configured human authority (`Founder #0007` in the first-party config) can decide a gate.
  One shared rule set (`src/domain/governance.ts`) is enforced in the UI **and** in every adapter.
  No worker can decide, not even on its own request. Missing or malformed authority data blocks
  the decision. HOLD never counts as APPROVE.
- A worker's **capabilities** (what it can do) are always shown apart from its **authority**
  (what a human has explicitly granted). Workers start with no authority, and the dashboard never
  grants it.
- A decision recorded by a demo adapter is marked **simulated**. A REST decision counts only
  when the backend returns a matching decision record.
- **LIVE** appears only for a non-demo adapter that has a verified backend and a connected
  transport. Moving demo data can never produce LIVE.
- The regression suite `src/domain/governance.test.ts` encodes these rules. Do not weaken it.

## Failure states

Backend unavailable, timeout, malformed payload, partial data, stale data, reconnecting, adapter
error, empty queues, zero workers, unknown status, and unsupported capability each have an
explicit, tested presentation. Malformed data is dropped or shown as **UNKNOWN** and listed under
**PARTIAL DATA**. It is never shown as healthy. See [docs/ADAPTERS.md](docs/ADAPTERS.md#failure-states).

## Filters and search

Missions, Workers, Approval Gates, Alerts and the Floor have filter bars: text search, quick
segments with counts, sorting, and further options behind **More filters**. **Reset** clears
everything. Empty results say which case applies:

- "No missions match these filters": the data exists but is filtered out, with a Reset button.
- "No missions from the data source": the backend reported zero.
- "Missions data unavailable": the fetch failed, so the true number is unknown.

Filters, sorting and search text are kept in the URL (`#/missions?group=blocked&sort=priority`),
so refresh, deep links and Back/Forward restore the view. Invalid parameters fall back to the
defaults. URL state only changes what is shown: it never creates data or authority.

## Languages

The UI is available in **English** (default) and **Spanish**. The first visit follows the
browser's language. Choose explicitly under **Settings → Display → Language**, or with the palette
command "Switch language to …". Switching is instant and keeps the current view and data.
Identifiers, backend text and authority values (`Founder #0007`) are never translated.
Numbers, percentages and absolute dates use the language's formats (`Intl`), with 24-hour clock
times everywhere. For translation QA, open any page with `?pseudo=1` (diagnostic pseudo-locale:
accented, padded text that exposes hard-coded English, truncation and overflow; never stored).

## Data freshness and transport

The provenance badge shows the source (**LIVE**, **DISCONNECTED**, **DEMO · SIMULATED**) together
with any qualifier that also applies: **STALE**, **PARTIAL**, **LAST KNOWN DATA**. LIVE never
implies complete data. **Settings → Transport and freshness** shows the configured and active
transport (REST polling and/or the optional stream), fallback, stream state, last message,
last verification and intervals. Anything the adapter does not report shows as UNKNOWN.

## Keyboard

| Keys                         | Action                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `Ctrl/⌘ + K`                 | Command palette (always on)                                                            |
| `/`                          | Command palette                                                                        |
| `?`                          | Keyboard reference (in-app)                                                            |
| `G` then `C B F M W A L V S` | Command Center, Brief, Floor, Missions, Workers, Approvals, Alerts, Activity, Settings |
| `P` / `N`                    | Pause/resume, or step the demo simulation (demo only)                                  |
| `Esc`                        | Close dialog, or leave the worker focus view                                           |

Single-key shortcuts are ignored while typing, and you can switch them off in the keyboard
reference (WCAG 2.1.4).

## Accessibility

- **Keyboard:** everything is keyboard operable. There is a skip link, focus moves to the main
  content on navigation (not on first load), and modal dialogs trap and restore focus.
- **Semantics:** landmarks and controls are labelled, every floor token has an accessible name,
  and results and connection changes are announced.
- **Motion:** reduced motion is honoured, via the system setting or a Settings override. The Red
  Alert state is static and never strobes.
- **Automated checks:** axe runs on every surface and state (Red Alert, confirmation, dialogs,
  failure states) in jsdom, and again in Chromium with colour contrast (WCAG 2.2 AA tags).
  Playwright also verifies keyboard flows, focus visibility, reduced motion, and the absence of
  runtime errors and horizontal overflow from 320px to 2560px, including Spanish text, very long
  names and large counts.
- **Language:** `<html lang>` follows the UI language, so screen readers pronounce Spanish
  correctly, and axe runs on every surface in both languages.

## Licence

No open-source licence has been chosen yet. Choosing one is a Founder decision that must be made
before public release. Until then all rights are reserved.
