# Visual regression

`e2e/visual.spec.ts` captures full-page screenshots of the key dashboard states
and compares them with the committed baselines in `e2e/__screenshots__/`.
CI (`browser` job) fails when any screen differs by more than 1% of its pixels,
and uploads the actual/expected/diff images as the `visual-diffs` artifact.

## What is covered

| Baseline                                              | State                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `command-center-{desktop,wide,phone}`                 | Command Center, situation board                            |
| `forge-floor-{phone,tablet,desktop,hd,wide}`          | Forge Floor at 390, 820, 1440, 1920 (1080p) and 2560 wide  |
| `forge-floor-selected-worker`, `forge-floor-room`     | Worker selected; Founder Gate room panel                   |
| `missions-desktop`, `mission-complete`                | Mission Control; completed mission detail                  |
| `workers-desktop`, `worker-focus`                     | Roster; worker focus view                                  |
| `approvals-{desktop,tablet}`, `approval-confirm-deny` | Approval gates; the explicit confirmation step             |
| `alerts-desktop`, `red-alert`                         | Alerts; RED ALERT after a critical event                   |
| `palette-search`                                      | Command palette with global search results                 |
| `missions-filtered-empty`                             | Zero results because of a filter (not because of the data) |
| `rest-live`                                           | REST adapter, healthy mock backend: LIVE                   |
| `rest-partial`                                        | Malformed workers + HTTP 500 missions: PARTIAL, UNKNOWN    |
| `rest-down`                                           | Backend unavailable: DISCONNECTED, no reassurance          |
| `rest-empty-missions`                                 | Backend reports zero missions                              |

The `rest-*` shots run against a second build (`npm run build:e2e-rest`,
`.env.e2e-rest`) whose REST adapter points at `http://mock-backend.test/api`.
That host does not exist: Playwright answers it in-browser (`e2e/mockBackend.ts`)
from the same deterministic seed the demo uses. No credentials are involved.

## Determinism

- **Time is frozen** with `page.clock.setFixedTime(2026-09-30T12:00:00Z)`.
- **The simulation is paused** via the demo-only `?demo=paused` flag. Any change
  in state (for example the Red Alert shot) comes from explicit key presses.
- **No motion**: `prefers-reduced-motion: reduce` plus `animations: 'disabled'`.
  No test waits on an animation.
- **Bundled fonts**: Inter and JetBrains Mono are self-hosted (`@fontsource-variable/*`,
  OFL-1.1), so the output does not depend on system fonts. State glyphs are SVG, not emoji.
- **Masked**: the decorative identity hierarchy line (Unicode box characters).
- The page is ready when the lazy surface reports `data-surface="ready"` and
  `document.fonts.ready` resolves.

Each run repeats deterministically: `npx playwright test e2e/visual.spec.ts --repeat-each=2`
passes locally.

## Updating baselines

Update baselines only when a visual change is intended:

```bash
npm run test:visual:update      # builds both bundles, rewrites e2e/__screenshots__
git diff --stat e2e/__screenshots__
```

Open the changed PNGs and check them before committing. Commit them with the
code change that caused them, never on their own. To update one screen, run:

```bash
npx playwright test e2e/visual.spec.ts -g "rest-partial" --update-snapshots
```

This needs `npm run build && npm run build:e2e-rest` first.

**Rendering environment.** Baselines are sensitive to the browser build and
OS font rasterisation. CI runs in `mcr.microsoft.com/playwright:v1.56.1-noble`,
which matches the `@playwright/test` version. For CI-identical baselines,
update inside that image:

```bash
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.56.1-noble \
  sh -c "npm ci && npm run test:visual:update"
```

If CI reports only sub-pixel text differences on every screen after a Playwright
upgrade or environment change, download the `visual-diffs` artifact to confirm,
then regenerate in the image. Do not raise the threshold to hide differences.
