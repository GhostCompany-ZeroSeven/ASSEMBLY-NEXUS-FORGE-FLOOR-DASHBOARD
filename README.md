# Forge Floor — Assembly Nexus Operations Dashboard

A backend-agnostic, open-source operations dashboard for AI agents and autonomous workflows:
live missions, worker states, reviews, approval gates, alerts, a visual workspace full of
characters, customizable themes, and pluggable adapters. Built for serious orchestration with a
little Snow Wolf chaos. 🐺⚡

> **The Forge took their hair as payment.** The default crew is a team of small lab-coated
> scientists with bald crowns and whatever hair survived around the sides.

> ⚠️ **Data provenance.** Out of the box the dashboard runs the **Local Demo Simulation**. Every
> worker, mission, approval and alert is simulated in your browser, and the UI labels it
> **DEMO · SIMULATED** everywhere. No Assembly Nexus backend is connected yet. See
> [docs/ADAPTERS.md](docs/ADAPTERS.md) for how to connect one.

## Surfaces

| Surface            | What it shows                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Command Center** | Stat tiles, featured-mission instrumentation, Founder Gate queue, floor preview, alerts, health, crew, activity                                                                                                   |
| **Forge Floor**    | Rooms (Planning, Research, Build, Security, Review, Certification, Ops, Founder Gate, Snow Wolf Den, Break). Workers walk between rooms as their state changes                                                    |
| **Missions**       | Mission board and per-mission control: elapsed/remaining clocks, tasks, dependencies, artifacts, review, certification, approvals, timeline, MISSION COMPLETE results                                             |
| **Workers**        | Worker cards, and a full-screen focus view with timeline, conversation panel, blockers, artifacts and telemetry                                                                                                   |
| **Approval Gates** | APPROVE / DENY / HOLD with a confirmation step, required notes, risk and reversibility, and a clear split between capability and authority                                                                        |
| **Alerts**         | INFO / NOTICE / WARNING / CRITICAL. Each alert says what happened, what is affected, what needs attention, and whether human action is required. An unacknowledged CRITICAL alert switches the shell to Red Alert |
| **Activity**       | Chronological stream built from structured events, filterable by category                                                                                                                                         |
| **Settings**       | Theme (Forge / Snow Wolf), motion, density, adapter capabilities, governance, rooms, characters, status mapping                                                                                                   |

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Demo controls are in the top bar (**SIM**): pause/resume, single-step, speed, and reset. The demo
never decides approvals itself. Pending gates stay pending until you act.

## Scripts

| Command                | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Vite dev server                                |
| `npm run build`        | Typecheck + production build to `dist/`        |
| `npm run preview`      | Serve the production build                     |
| `npm run typecheck`    | TypeScript project check                       |
| `npm run lint`         | ESLint (typescript-eslint, react-hooks)        |
| `npm run format:check` | Prettier check (`npm run format` to write)     |
| `npm test`             | Vitest unit + component tests (jsdom)          |
| `npm run verify`       | typecheck → lint → test → build (what CI runs) |

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
- Connecting a backend: [docs/ADAPTERS.md](docs/ADAPTERS.md)
- Build progress and next steps: [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md)

## Governance principles baked into the UI

- Only the configured human authority (`Founder #0007` in the first-party config) can decide a gate.
  Adapters must reject decisions from anyone else.
- A worker's **capabilities** (what it can do) are always shown apart from its **authority**
  (what a human has explicitly granted). Workers start with no authority, and the dashboard never
  grants it.
- A decision recorded by a demo adapter is marked **simulated**. A "LIVE" badge appears only when
  an adapter reports a verified backend.

## Accessibility

Keyboard navigable, with a skip link, focus management on navigation, labelled landmarks and
controls, and an accessible name for every floor token. Reduced motion is honoured (system setting
or a manual override in Settings). The Red Alert state stays static and does not strobe.
