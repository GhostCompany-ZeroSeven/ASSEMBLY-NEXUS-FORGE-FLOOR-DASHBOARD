# Visual regression

`e2e/visual.spec.ts` captures screenshots of the key dashboard states and
compares them with the committed baselines in `e2e/__screenshots__/`. CI (the
`browser` job) fails on any real difference, and uploads the
actual/expected/diff images as the `visual-diffs` artifact.

## Baseline environment (certified in Phase 4)

Baselines are rendered in the **pinned CI image**
`mcr.microsoft.com/playwright:v1.56.1-noble` (image digest
`sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a`), the same
image the CI `browser` job runs in, with the same `@playwright/test` version.

How this was established:

1. The Phase 3 baselines (made in the session's Chromium) were compared pixel by
   pixel with renders from the pinned image. Two kinds of difference showed up:
   - **Environment rendering.** The `→` arrow is not in the bundled font subsets,
     so each machine drew it with a different fallback OS font. The fix was to
     remove the cause: arrows are now a drawn icon, and `src/i18n/glyphs.test.ts`
     keeps any uncovered glyph out of the UI.
   - **Stale baselines** (`command-center-phone`, `mission-complete`, `forge-floor-phone`).
     Real layout changes from late Phase 3 fixes had been hidden by the old
     tolerance (1% of pixels, with a lenient per-pixel threshold). They were
     investigated and confirmed intended, not blanket-updated.
2. Every remaining difference was reviewed and attributed to an intended change
   before the baselines were regenerated in the pinned image.
3. Three consecutive captures in the image: 61 of 62 image comparisons were
   byte-identical. One pixel differed, by 7/255, on the focused search box's ring.
4. With the glyph fallback removed, the session's Chromium and the pinned image
   now produce byte-identical screenshots (31 of 31). Local runs and CI agree.

## Tolerance

`playwright.config.ts`: `maxDiffPixels: 20`, `threshold: 0.1`. That absorbs the
measured single-pixel antialiasing noise but catches real changes: each of the
three stale baselines above now fails (129 to 5,281 differing pixels), which the
old 1% budget let through. Do not loosen the tolerance to hide a difference.

## What is covered

| Baseline                                                                    | State                                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `command-center-{desktop,wide,phone}`                                       | Command Center, situation board                                                               |
| `forge-floor-{phone,tablet,desktop,hd,wide}`                                | Forge Floor at 390, 820, 1440, 1920 (1080p) and 2560 wide                                     |
| `forge-floor-selected-worker`, `forge-floor-room`                           | Worker selected; Founder Gate room panel                                                      |
| `missions-desktop`, `mission-complete`, `missions-url-filtered`             | Mission Control; completed mission; URL deep link with filters                                |
| `workers-desktop`, `worker-focus`                                           | Roster; worker focus view                                                                     |
| `approvals-{desktop,tablet}`, `approval-confirm-deny`                       | Approval gates; the explicit confirmation step                                                |
| `alerts-desktop`, `red-alert`                                               | Alerts; RED ALERT after a critical event                                                      |
| `palette-search`                                                            | Command palette with global search results                                                    |
| `missions-filtered-empty`                                                   | Zero results because of a filter (not because of the data)                                    |
| `es-command-center-desktop`, `es-forge-floor-phone`, `es-approvals-desktop` | Spanish UI                                                                                    |
| `settings-transport-demo`, `settings-transport-rest`                        | Transport and freshness diagnostics                                                           |
| `rest-live`                                                                 | REST adapter, healthy mock backend: LIVE                                                      |
| `rest-partial`                                                              | Malformed workers + HTTP 500 missions: LIVE · STALE · PARTIAL, answers UNKNOWN                |
| `rest-down`                                                                 | Backend unavailable: DISCONNECTED, no reassurance                                             |
| `rest-empty-missions`                                                       | Backend reports zero missions                                                                 |
| `brief-first-visit`                                                         | Founder brief with no recorded last view: history UNKNOWN, not "nothing"                      |
| `brief-changes-{desktop,phone}`                                             | Brief after "Mark all as seen" and 6 simulated steps (+1 min): digest items                   |
| `es-brief-desktop`                                                          | Spanish brief                                                                                 |
| `rest-brief-approvals-down`                                                 | REST, approvals failing: Needs Founder UNKNOWN, queue INCOMPLETE                              |
| `activity-timeline-details`, `activity-timeline-phone`                      | Operations timeline with arrival details and "Now" state; phone layout                        |
| `pseudo-approvals-phone`                                                    | Pseudo-locale diagnostic (`?pseudo=1`) on a 390px phone                                       |
| `mission-changes-{desktop,phone}`                                           | Mission viewed, left, demo advanced: proven changes, EXACT coverage, NEW SINCE YOUR VIEW tags |
| `quality-desktop`                                                           | Data-quality inspector (explicit dimensions, no score)                                        |

The `rest-*` and `settings-transport-rest` shots run against a second build
(`npm run build:e2e-rest`, `.env.e2e-rest`) whose REST adapter points at
`http://mock-backend.test/api`. That host does not exist: Playwright answers it
in-browser (`e2e/mockBackend.ts`) from the same deterministic seed the demo
uses. No credentials are involved.

## Determinism

- **Time is frozen** with `page.clock.setFixedTime(2026-09-30T12:00:00Z)`.
- **The simulation is paused** via the demo-only `?demo=paused` flag. Any change in
  state (for example the Red Alert shot) comes from explicit key presses.
- **No motion**: `prefers-reduced-motion: reduce` plus `animations: 'disabled'`.
- **Bundled fonts only**: Inter and JetBrains Mono are self-hosted (OFL-1.1), and
  the glyph-coverage test forbids characters outside their subsets. State glyphs
  and arrows are SVG.
- **Masked**: the identity hierarchy line (verbatim Founder text using symbol
  characters outside the bundled fonts).
- The page is ready when the lazy surface reports `data-surface="ready"`,
  `document.fonts.ready` resolves, and (for Spanish shots) `<html lang="es">` is set.

## Phase 5 baseline changes (reviewed before regeneration)

Every changed baseline was diffed against its predecessor (expected vs actual,
by region) and attributed to an intended change before regenerating in the
pinned image:

| Baselines                                                                     | Cause                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All desktop/wide shots with the sidebar (22)                                  | New "Brief" navigation item (sidebar pixels only; the main area was pixel-identical)                                                                          |
| `approvals-{desktop,tablet}`, `approval-confirm-deny`, `es-approvals-desktop` | New "Related alerts" line on the gate card (links alerts that name the gate), which moves the rest of the card down 28px                                      |
| `command-center-phone`, `forge-floor-{phone,tablet}`, `es-forge-floor-phone`  | Phone/tablet nav strip gains "Brief"; the phone topbar has tighter gaps, a tighter data-source badge and no decorative health icon, so the label never spills |
| `palette-search`                                                              | unchanged                                                                                                                                                     |
| 8 new Phase 5 shots                                                           | new states (see the table above), inspected before being accepted                                                                                             |

The new shots were captured twice in the image (update, then verify) and once on
the host: 39/39 identical each time.

## Phase 6 baseline changes (reviewed before regeneration)

The 39 Phase 5 baselines were run in the pinned image first; 25 differed.
Each was classified by region (expected vs actual) and inspected:

| Baselines                                                                                                                | Cause (all intended)                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command-center-{desktop,wide}`, `es-command-center-desktop`, `rest-live`, `rest-partial`, `alerts-desktop`, `red-alert` | "Open in timeline" link on alert cards (alert-scoped timeline)                                                                                                                                              |
| `approvals-{desktop,tablet}`, `approval-confirm-deny`, `es-approvals-desktop`, `pseudo-approvals-phone`                  | "Open in timeline" link on gate cards; in pseudo, wrapped status badges                                                                                                                                     |
| `missions-desktop`, `missions-url-filtered`                                                                              | NEEDS FOUNDER marker on AN-0144                                                                                                                                                                             |
| `mission-complete`                                                                                                       | New mission hierarchy: header status + source, Founder attention, "since you last viewed this mission"                                                                                                      |
| `brief-first-visit`, `brief-changes-{desktop,phone}`, `es-brief-desktop`, `rest-brief-approvals-down`                    | "Why is this here?" explanations; "Explain data quality" link; digest wording ("New events observed")                                                                                                       |
| `activity-timeline-{details,phone}`                                                                                      | Approval-gate and alert filters; retained-history boundary line                                                                                                                                             |
| `settings-transport-{demo,rest}`                                                                                         | "Explain data quality" link in the transport panel header                                                                                                                                                   |
| `palette-search`                                                                                                         | SIMULATED provenance on results. Its sidebar pixels are the Phase 5 "Brief" nav item behind the blurred backdrop: it stayed within tolerance in Phase 5 (blur), so that baseline was never regenerated then |

Three baselines were added (mission changes desktop/phone, inspector). All 42
matched in the pinned image twice (update, then verify) and on the host.

## Phase 7 baseline changes (reviewed before regeneration)

The 42 Phase 6 baselines were run first; one differed.

| Baseline          | Classification          | Cause                                                                                                                                                  |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `quality-desktop` | INTENDED_PHASE_7_CHANGE | Two new inspector rows: "Adapter note" (the adapter's own text, moved out of the badge tooltip) and "History continuity". Everything below shifts down |

The diff image showed only those rows and the shift. No baseline was added:
the runtime states are proven by assertions in `e2e/phase7.spec.ts`, which
does not rely on screenshots. The one baseline was regenerated alone in the
pinned image, and all 42 then matched there twice.

## Phase 9 baseline changes (reviewed before regeneration)

All 42 Phase 8 baselines were run first in the pinned image. Nine differed; each diff image was
reviewed before regeneration.

| Baseline                                                                                                        | Classification          | Cause                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forge-floor-desktop`, `-hd`, `-wide`, `-tablet`, `-phone`, `-room`, `-selected-worker`, `es-forge-floor-phone` | INTENDED_PHASE_9_CHANGE | New "Visual Forge Floor · preview" entry link under the header, which shifts the content down. The Kestrel avatar is now the Snow Wolf Bandit. Scientist cheek circles were removed |
| `command-center-wide`                                                                                           | INTENDED_PHASE_9_CHANGE | Only the Kestrel avatar in the Snow Wolf Den (the diff shows that tile alone)                                                                                                       |

Seven baselines were added:

- `visual-floor-desktop`, `-hd`, `-tablet`, `-phone`
- `visual-floor-accomplished`, `-countdown-critical`, `-red-alert` (presets, at 1920×1080)

After update, all 49 matched in a separate verify run in the pinned image.

## Phase 11 baseline changes (reviewed before regeneration)

The visual suite was run first without updating; 23 of 49 differed, each confined to avatar
pixels or visual-floor nameplates (diffs reviewed).

| Baselines                                                                                                                                                                                                                   | Classification           | Cause                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `command-center-desktop`, `command-center-wide`, `es-command-center-desktop`, `forge-floor-*` (7), `es-forge-floor-phone`, `missions-desktop`, `missions-url-filtered`, `workers-desktop`, `worker-focus`, `rest-live` (16) | INTENDED_PHASE_11_CHANGE | Factual scientist avatars normalized to the Crown-Top family (chrome/stubble crowns, shading, gloves, neck goggles) |
| `visual-floor-*` (7)                                                                                                                                                                                                        | INTENDED_PHASE_11_CHANGE | Role/station nameplates on the Crown-Top desks; no worker names on characters                                       |

All 49 matched in a separate verify run in the pinned image. See
[reports/DASHBOARD_FOUNDER_UNIVERSE_PHASE_11_REPORT.md](reports/DASHBOARD_FOUNDER_UNIVERSE_PHASE_11_REPORT.md).

## Updating baselines

Update only for an intended visual change, and review every changed PNG first.
The authoritative way is inside the pinned image (Docker required):

```bash
npm run build && npm run build:e2e-rest
npm run test:visual:ci-image:update   # rewrites e2e/__screenshots__ in the CI image
npm run test:visual:ci-image          # verify
git diff --stat e2e/__screenshots__
```

These scripts mount the working tree (including its `node_modules`) into the
image, so run them on Linux x64. Because local Chromium now renders identically,
`npm run test:visual:update` gives the same result on a Linux machine with the
same Playwright version. If CI ever disagrees, trust the image.

Commit baselines together with the change that caused them. If CI fails,
download the `visual-diffs` artifact, find out what changed, and fix either the
code or (only for an intended change) the baseline.
