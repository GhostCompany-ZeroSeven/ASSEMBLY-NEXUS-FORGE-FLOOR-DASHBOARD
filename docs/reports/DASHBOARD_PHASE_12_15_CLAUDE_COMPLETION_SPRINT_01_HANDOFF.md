# Dashboard Phase 12–15 — Claude Operational Completion Sprint 01 — Handoff

Status: **READY FOR FOUNDER REVIEW — UNCOMMITTED WORKING TREE.** Per the
directive, nothing was committed, pushed, merged or deployed, and no pull
request was opened.

## A. Starting commit

- Base HEAD: `fb69208a049246a5dc85ca17ea91853af8a02252`
  (`feat(visual-floor): seal Founder-approved Phase 11 universe integration`).
- Parent: `e16f1cfb08b48aefc1ad66661514c3173c745299`. **Base match: YES.**
- HEAD is still `fb69208` at handoff. All work below is uncommitted and
  unstaged.

## B. Mission

`DASHBOARD-PHASE-12-15-CLAUDE-OPERATIONAL-COMPLETION-SPRINT-01-RESUME`. It
carries the Founder amendment `CROWN_TOP_TARGET_COUNT=9`; that amendment is
blocked (see H).

## C. Architecture discovered

- **Stack:** Vite 8, React 19, TypeScript strict, Vitest (jsdom), and
  Playwright 1.56.1. Visual baselines are rendered only in the pinned image
  `mcr.microsoft.com/playwright:v1.56.1-noble`.
- **Data:** adapters (`demo`, `rest`) produce a `DashboardSnapshot` that
  carries `provenance` (mode demo/live/replay/disconnected, `adapterId`), a
  `Freshness` (source SIMULATED/LIVE/DISCONNECTED/REPLAY plus qualifiers) and
  `AdapterCapabilities`.
- **Approval decisions** carry `delivery: 'delivered' | 'simulated'`.
- **Routing:** hash router (`href.*`, `withQuery`). Deep-link focus uses
  `?focus=<id>` together with `Panel focusId` / `useFocusTarget`.
- **i18n:** `src/i18n/en.ts` is the type source (`Messages = typeof en`);
  `es.ts` must match it. Pseudo-locale and glyph-coverage guards run in e2e
  and unit tests.
- **Gap found:** before this sprint there was no single place that decided
  what a control does or what the dashboard may claim. Each page made its own
  reading, and on the visual floor "ASSOCIATES ONLINE" was derived from
  worker activity. This sprint adds that shared module.

## D. Work done per phase

**Phase 12 — operational vocabulary and action safety.** New module
`src/domain/operational.ts`, pure and the single source of truth:

- `classifyOperation(op, {mode, capabilities})` gives each operation one of
  NAVIGATION / LOCAL_PRESENTATION / READ_ONLY_INSPECTION / DEMO_SIMULATION /
  FOUNDER_GATED_OPERATION / UNAVAILABLE, plus a `founderGated` flag. In demo
  mode every operation is DEMO_SIMULATION. On a live backend, an operation the
  adapter cannot deliver is UNAVAILABLE. Replay and disconnected never offer a
  real operation.
- `ActionClassTag` is shown next to every state-changing control: approval
  decisions, alert acknowledgement and worker messages.
- Each approval decision button is `aria-describedby` a note: "Demo decision:
  recorded only in this browser and marked simulated. It is not a Founder
  approval of anything real."

**Phase 13 — operational surfaces.**

- **Mission lifecycle ladder** (`MissionLifecyclePanel`), the false-green
  guard. It reports work → tests → review → certification → Founder decision →
  deployment, each rung read from its own field:
  - Tests are only ever "evidence reported", never "passed".
  - A Founder decision made in demo mode is flagged "simulated decision".
  - Deployment is always NOT_TRACKED.
  - There are no percentages anywhere.
- **Approval gates:**
  - an "Expires" fact (a real time, or "No expiry reported")
  - a page note: "Viewing or opening a gate never authorizes it."
- **Workers:**
  - a note "A worker is not an Associate"
  - "Runtime / model: Not reported by the data source" (never invented)
- **Missions:** a new "Review required" group (`?group=review`).
- **Header health link:** now deep-links to the health explanation
  (`#/?focus=health`).

**Phase 14 — source, claim and health truthfulness.**

- **Connection claim** (`selectConnectionClaim`):
  - CONNECTED only for a LIVE and complete source
  - otherwise PARTIALLY_CONNECTED (with reasons), DISCONNECTED, REPLAY or
    DEMO_SIMULATED
  - shown in the Data Quality inspector
- **Source class** (`classifySource`): DEMO / REMOTE / UNKNOWN. LOCAL is
  reserved because no local adapter exists. The UI states that "Remote is not
  the same as authoritative."
- **Explained health** (`HealthReportPanel` replaces the colour-only panel):
  - who reported it ("Simulated by the demo. No backend reported this.")
  - when it was checked
  - why (non-nominal components, or "unexplained")
  - each component's status in words
  - an explicit "Not covered by any health report" list: frontend, Associates,
    deployment
- **Situation board** in demo mode reads "Simulated: Degraded — From the demo
  simulation. No backend."
- **Truthfulness defect fixed:** on the visual floor HUD, the Associates row
  is now always `UNKNOWN (not connected)`. It was previously ONLINE/STANDBY,
  inferred from worker activity. The basis text for "Forge Floor online" now
  reads "this dashboard page only".

**Phase 15 — hardening and verification.**

- axe (WCAG 2.2 AA) passes on all changed surfaces in English, and the
  Spanish sweep passes per route.
- Keyboard reach to the health explanation is covered.
- No overflow at 320/390/1440 px in en and es.
- Pseudo-locale sweep shows no clipping or untranslated text.
- Two layout defects were found and fixed:
  - the alert footer wrapped "Acknowled/ge" in the narrow Command Center
    column
  - the action tag clipped under pseudo-locale (fixed with a flex-wrap footer
    and `overflow-wrap: break-word`)
- Visual baselines were re-rendered in the pinned image and every diff was
  reviewed.
- Assets re-hashed: 42/42.
- Founder review captures were produced (see F).

## E. Files changed and why

New:

| File                                                          | Why                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/domain/operational.ts`                                   | Action classes, connection claim, lifecycle ladder, health report, source class |
| `src/domain/operational.test.ts`                              | 18 unit tests for the above                                                     |
| `src/components/ActionClassTag.tsx`                           | Visible action-safety tag                                                       |
| `src/features/missions/MissionLifecyclePanel.tsx`             | Lifecycle ladder panel                                                          |
| `src/features/command-center/HealthReportPanel.tsx`           | Explained health panel                                                          |
| `src/app/governance.phase12.test.tsx`                         | 15 rendered-app governance tests (demo and live REST)                           |
| `e2e/phase12.spec.ts`                                         | 11 browser tests: axe, keyboard, overflow, es, pseudo                           |
| `visual-review/phase-12-15-claude-completion-sprint-01/*.png` | 12 Founder review captures                                                      |
| this file                                                     | Continuation dossier                                                            |

Modified:

- **UI wiring:**
  - `Shell.tsx`: health link
  - `AlertCard.tsx`, `ApprovalGateCard.tsx`, `ApprovalsPage.tsx`,
    `ConversationPanel.tsx`: action classes and notes
  - `CommandCenter.tsx`: uses `HealthReportPanel`
  - `SituationBoard.tsx`: simulated health wording
  - `MissionDetail.tsx`: ladder
  - `MissionsPage.tsx`, `filters.ts`, `urlSchemas.ts`: review group
  - `QualityPage.tsx`: source class and claim
  - `WorkersPage.tsx`, `WorkerFocus.tsx`: worker ≠ Associate, runtime not
    reported
- **Visual floor:** `visual-floor/model.ts` and `model.test.ts`: Associates
  are UNKNOWN.
- **i18n:** `en.ts`, `es.ts`: new `ops` block, `missions.group.review`, and
  situation strings.
- **Styles:**
  - `components.css`: action tag, action note, ladder
  - `features.css`: the alert footer wraps
- **Tests:** `e2e/phase4.spec.ts`: the Spanish axe sweep is split into one
  test per route, with identical assertions (fixes the timeout root cause).
- **`e2e/__screenshots__/*.png`:** 31 baselines re-rendered in the pinned
  image:
  - 7 visual-floor baselines: environmental, see G
  - 24 baselines with intentional Phase 12–14 UI changes

Untouched:

- `public/` (assets and manifest)
- `docs/FOUNDER_VISUAL_CANON.md`
- `src/features/visual-floor/scene/`
- ADA, Project Empire and C5 Manager
- `docs/reports/DASHBOARD_PHASE_11_FOUNDER_VISUAL_REPAIR_01_REPORT.md`
  (pre-existing untracked file; left as-is and not staged)

## F. Test commands and results (final run, after all fixes)

| Command                                                          | Result                                           |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| `npm run format:check`                                           | PASS                                             |
| `npm run typecheck`                                              | PASS                                             |
| `npm run lint`                                                   | PASS                                             |
| `npm test`                                                       | 650/650 passed (54 files); base was 616          |
| `npm run test:conformance`                                       | 15/15                                            |
| `npm run build` / `build:e2e-rest` / `build:e2e-runtime`         | PASS / PASS / PASS                               |
| `npx playwright test $(ls e2e/*.spec.ts \| grep -v visual.spec)` | 176/176 passed; base was 155 passed and 1 failed |
| `npm run test:visual:ci-image` (pinned image)                    | 49/49; base was 42/49                            |
| Asset re-hash vs `manifest.json` (sha256 + byte size)            | 42/42 match                                      |
| `git diff --check`                                               | clean                                            |

Bundle: entry chunk 281.63 kB; CommandCenter 12.75 kB; MissionDetail
16.56 kB; VisualForgeFloorPage 55.79 kB. No new dependencies.

Review captures are in `visual-review/phase-12-15-claude-completion-sprint-01/`:

- 01 Command Center
- 02 Visual Forge Floor
- 03a Review-required missions
- 03b Lifecycle ladder (AN-0144)
- 04 Workers
- 05 Approval gates
- 06 Founder attention / alerts
- 07 Activity
- 08 Mobile operational (390 px)
- 09 Mobile visual floor (390 px)
- 10 Health explained
- 11 Data quality source/claim

## G. Known failures

- **Pre-existing, environmental:**
  - **CI #12 on `fb69208` was red.** All 7 visual-floor baselines at base had
    been rendered outside the pinned image (different clock and font wrap; the
    content is identical). They were re-rendered in the pinned image and now
    pass.
  - **The `phase4` Spanish axe sweep timed out at 30 s on the untouched base**
    (about 24 s alone, slower under load). The root cause is one test doing 7
    full axe scans. It is now split into one test per route and passes.
- **New:** none remaining. Two pseudo-locale failures appeared mid-sprint
  after the first alert-footer fix (`nowrap` tag) and were fixed with
  `overflow-wrap: break-word`. The final runs above are fully green.
- **CI not run:** nothing was pushed, so remote CI on this work has not run.

## H. Remaining work

1. **Crown-Top #9 "Goggle Scientist": BLOCKED.**
   - The amendment requires the Founder-approved visual reference "already
     provided in the conversation". No such image exists in this session, and
     this environment cannot produce Founder-grade raster art.
   - `CROWN_TOP_COUNT` stays 8, and the original eight (including Mr. Shades
     and Shades II) are preserved.
   - To unblock, deliver two Founder-approved files, as Phase 11 did:
     - `crown-top-scientist-09-goggles.png` (source)
     - a transparent WebP derivative
   - Then:
     - add them to `public/assets/founder-universe/` and `manifest.json` as new
       entries (do not alter the 42 existing hashes)
     - add `sci-9` to `scene/founderAssets.ts` and a ninth desk/role to the
       scene
     - update the `toHaveLength(8)` Crown-Top assertions in
       `universe.test.tsx`, `model.test.ts` and `consistency.test.tsx`
     - update `FOUNDER_VISUAL_CANON.md`
     - re-render the 7 visual-floor baselines
2. **LOCAL source class** is reserved but has no adapter. It needs a
   local-file adapter before the class can ever be displayed.
3. **Deployment rung** is NOT_TRACKED. It needs a deployment signal in the
   data contract; never infer one.
4. **Worker runtime/model** is "not reported". It needs a contract field.
5. **Remote CI** for this working tree, once the Founder authorizes a commit
   and push.

## I. Governance

- No commit, push, PR, merge, deploy, rebase, amend or force-push. `main` is
  untouched. Git identity is unchanged:
  - repo-local: Founder Zero Seven
  - global: untouched
- No new dependencies, network calls, credentials, shell/subprocess, `eval`,
  dynamic imports, telemetry or secrets.
- No Associate runtime and no backend fantasy. No control claims an
  authority it does not have:
  - Demo decisions are labelled simulations before any click.
  - Live decisions are FOUNDER_GATED_OPERATION.
  - Unsupported decisions are UNAVAILABLE.
- UNKNOWN stays UNKNOWN: Associates, deployment, runtime/model, and missing
  approval data on the ladder.
- Nothing is staged. The pre-existing untracked Phase 11 visual-repair report
  is preserved and excluded.

## J. Canon verification

| Canon item              | Result                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 11 assets         | 42/42 sha256 and byte-size match; zero diff under `public/`, `docs/FOUNDER_VISUAL_CANON.md` and `src/features/visual-floor/scene/`                       |
| Crown-Tops              | 8 (`sci-1`…`sci-8`). Mr. Shades preserved; Shades II preserved (`sci-7`, `crown-top-scientist-07-shades-ii-transparent.webp`). Ninth not added (blocked) |
| Baby Ghost (lime)       | Preserved, distinct from the blue 07 Ghost Sprites                                                                                                       |
| Sacred Cyber Skull      | Preserved                                                                                                                                                |
| Snow Wolf Crew          | Exactly 8 (`consistency.test.tsx`, `universe.test.tsx`, `model.test.ts` all pass)                                                                        |
| Founder focal hierarchy | Unchanged; the visual-floor baselines' diffs were environmental only                                                                                     |

## K. Resume instructions

1. `cd` to the repo and confirm `git rev-parse HEAD` = `fb69208…`, with the
   working tree as listed in E.
2. Run `npm ci` if `node_modules` is missing, then run section F's commands.
   - Free ports first: `fuser -k 4173/tcp 4175/tcp 4176/tcp`.
   - For visuals, Docker must be running (`dockerd` via nohup if needed).
3. On Founder authorization: stage only the files in E. Exclude
   `docs/reports/DASHBOARD_PHASE_11_FOUNDER_VISUAL_REPAIR_01_REPORT.md`.
   Commit with the repo-local identity and no AI co-author trailers. Push,
   then confirm CI is green.

## L. Recommended next mission

`DASHBOARD-PHASE-12-15-FOUNDER-REVIEW-AND-PRESERVATION-01`:

1. The Founder reviews the 12 captures.
2. On approval, commit and push this working tree as one sealed change.
3. Verify remote CI is green.

Crown-Top #9 follows as its own mission once the Founder supplies the
approved reference art.
