# DASHBOARD_FOUNDER_VISUAL_FORGE_FLOOR_PHASE_09_REPORT

Mission: **DASHBOARD-FOUNDER-VISUAL-FORGE-FLOOR-PHASE-09** (FOUNDER_VISUAL_PREVIEW)
Branch: `claude/epic-cannon-zezh6m` · Start `9a42c27` · `main` `3a3e217` (unchanged)
Date: 2026-10-01

## 1. EXECUTIVE SUMMARY

The first Founder-facing **ASSEMBLY NEXUS FORGE FLOOR** visual preview is built at `#/visual-floor`.

- **What it is.** A command-center scene in a game-cinematic style:
  - built only from SVG and CSS
  - a central sign, a Founder #0007 throne and a circuit-skull backdrop
  - Crown-Top Scientists, Snow Wolf Bandits, ByteWisp, and a lived-in lab
  - glass HUD panels over the scene
- **Where the data comes from.** A bounded presentation model maps from the dashboard's own
  snapshot. Anything the data does not carry is shown as UNKNOWN.
- **States.** Mission accomplished, countdown (lime, turning red when critical) and red alert
  are available as clearly labelled preview presets. Data mode also shows them when the data
  supports it.
- **No change to the factual dashboard.** No view was replaced and the sidebar is unchanged.
  Entry is a link on the Forge Floor page and a palette command.
- **Fixes to existing art.**
  - Red cheek circles were removed from the existing scientist avatar.
  - The gray-wolf placeholder avatar is now a Snow Wolf Bandit.
- **Verification.** Every gate is green:

  | Gate                  | Result  |
  | --------------------- | ------- |
  | Unit                  | 592/592 |
  | Conformance           | 15/15   |
  | Browser               | 146/146 |
  | Visual (pinned image) | 49/49   |
  | Build                 | pass    |

- **Status.** Local commits only. Nothing was pushed.

## 2. PRE-FLIGHT

| Check                  | Result                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                 | `claude/epic-cannon-zezh6m` at `9a42c27`, equal to the remote (Phase 8 preserved)                                                         |
| `main`                 | `3a3e217`                                                                                                                                 |
| Tree                   | clean                                                                                                                                     |
| AI trailers in history | none                                                                                                                                      |
| Phase 8 conformance    | 15/15 passing                                                                                                                             |
| Authorizations         | source changes, tests and local commits: YES. Push, PR, merge, deploy, main modification, real ANN integration and contract invention: NO |
| Author identity        | the existing configured identity, unchanged                                                                                               |

## 3. VISUAL ARCHITECTURE

```
#/visual-floor (lazy route; the factual dashboard is untouched)
 └ VisualForgeFloorPage
    ├ header
    │   ├ provenance chip
    │   └ preset badge
    ├ preview-state radios
    ├ red-alert banner (role=alert)
    ├ firewall line
    ├ stage (role=region, scrollable)
    │   ├ ForgeScene SVG, 1600×900: aria-hidden, translate="no", memoized by mode
    │   ├ station hotspots: real <button>s positioned in %, with nameplates
    │   └ HUDs: Mission board, Alerts board, System status
    │       (overlaid on the scene at ≥1360px; a grid below the scene when narrower)
    └ lower row: details, mission flow, Associates, Founder attention
model.ts → buildVisualState(snapshot, freshness, connection, now, {preset, missionId})
```

- **Rendering:** SVG and CSS only, with no game engine and no new dependency.
- **Scene depth layers:**
  - **Background:** wall, pillars, PCB pattern, pulse traces, circuit skull, ghost, sign, wall notes, binder shelf.
  - **Midground:** desks, monitors, throne dais, workflow strip, server racks.
  - **Foreground:** a bench with circuit boards, soldering station, schematic, parts, camera, mugs, sticky notes, plants.

## 4. FOUNDER REFERENCE TRANSLATION

| Reference                                                                 | Implementation                                                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark base, with lime, cyan, purple and magenta neon, and controlled white | Palette tokens in `visual-floor.css`. Red is used only for alert, critical and blocked states                                                      |
| PCB, glass, terminal type                                                 | PCB pattern and traces, glass HUD panels, JetBrains Mono labels                                                                                    |
| Lived-in lab                                                              | Schematics, sticky notes, binders, tools, cables, plants, server racks, coffee cups (07), camera lenses                                            |
| Central sign                                                              | "ASSEMBLY NEXUS" in cyan/white, and "FORGE FLOOR" in lime with a neon glow                                                                         |
| Branding (restrained)                                                     | Founder #0007 (dais plate, binder spine), A•N (sign corner), 07 marks. The shell keeps 《Assembly▪︎Nexus》, Wolf◇Technologies and Ghost○●Company-07 |
| Founder command                                                           | An elevated throne on a ringed dais with a gold crown mark and a "FOUNDER #0007" plate. No human likeness                                          |
| Circuit skull / ghost backdrop                                            | Built into the back wall behind the throne. Its tone follows the mode (violet, lime, or red)                                                       |
| Founder phrases                                                           | "Adapt by choice, not by force." (sticky note) and "One Mind. One Memory. One Mission. Many Hearts and Voices." (wall)                             |
| Ransomware wording                                                        | Not copied. The labels are TIME LEFT, MISSION ACCOMPLISHED and RED ALERT · FOUNDER ATTENTION                                                       |

## 5. CHARACTER SYSTEM

There are three classes in one rendering universe, sharing the same light direction, gradients
and rim shadows. Each class has its own materials:

| Class                | Materials                                           |
| -------------------- | --------------------------------------------------- |
| Crown-Top Scientists | matte cloth coats, skin gradients, chrome specular  |
| Snow Wolf Bandits    | knit, fur, gold                                     |
| ByteWisp             | translucent holographic material with a glow filter |

- Every character is a reusable component with variant props.
- Each component makes its gradient ids unique with `useId`.
- Each has a slow idle bob, which stops under reduced motion.

## 6. CROWN-TOP SCIENTIST IMPLEMENTATION

`src/characters/forge/CrownTopScientist.tsx` has six on-stage scientists.

**Type A, true chrome dome (3):** `sci-1`, `sci-3`, `sci-6`.

- smooth bald top with a specular highlight
- side and back hair kept

**Type B, shaved top (3):** `sci-2`, `sci-4`, `sci-5`.

- a subtle stubble-dot pattern clipped to the scalp cap
- side and back hair kept

**Variation** comes from skin tone (light, tan, medium, deep), glasses (round, square, none),
brow shape, age, side-hair colour and shape, pose (type, clipboard, beaker, point, think) and
facing direction.

**Common details:** white lab coats, dark gloves, and some glasses.

**Cheek blush:** none on any of them (`RED_CHEEK_CIRCLES_PRESENT=NO`). The existing
`ScientistFigure` avatar also had its two `#f87171` cheek circles removed. That avatar is used
across the factual dashboard.

## 7. SNOW WOLF BANDIT IMPLEMENTATION

`src/characters/forge/SnowWolfBandit.tsx` draws small chihuahua-like characters with:

- a black knitted balaclava with rib lines, ears through the mask, and big glossy eyes
- a gold chain with a crown pendant
- a hoodie with "07"
- optional headphones or crown, and a curled tail

There are five Bandits on stage, each with a different activity:

| Station | Activity                             |
| ------- | ------------------------------------ |
| `ban-1` | at the console, with headphones      |
| `ban-2` | carrying a 07 crate, wearing a crown |
| `ban-3` | inspecting with a magnifier          |
| `ban-4` | at a workstation, watching           |
| `ban-5` | cable chaos, with sparks             |

They vary in fur (snow, cream, fawn), hoodie colour, accessories and facing.

- No silver, gray, giant or realistic wolves, and no wolf placed above the scene.
- The old gray-wolf `WolfFigure` placeholder (used for Kestrel) now draws the Snow Wolf Bandit.
  The Kestrel config fur and hoodie colours were updated to match.

## 8. BYTEWISP / GHOST IMPLEMENTATION

`src/characters/forge/ByteWisp.tsx` draws a translucent holographic ghost with:

- a gradient body, a glow filter and internal circuitry traces
- eyes, an "07" mark, and glitch slices

Its mood follows the scene mode (calm, cheer or alarm). The overall look is a friendly tech
mascot, with nothing Halloween-like.

- A smaller echo wisp sits by the skull backdrop.
- A tiny ghost mark (Ghost Company 07) is on the foreground bench.
- Its details panel says it is the system mascot and represents no worker or fact.

## 9. FORGE FLOOR ENVIRONMENT

The environment includes:

- a perspective floor with glowing traces and small paw prints
- a back wall with PCB pattern and pulse traces
- the binder shelf: CONSTITUTION, ARCHITECTURE, MISSIONS, RESEARCH, IDEAS, NOTES, plus a #0007 binder
- monitors showing code, a graph, a schematic and a map
- server racks with LEDs, cables and plants
- the foreground bench of tools
- the workflow strip: BUILD · TEST · REVIEW · CERTIFY · **DEPLOY · LOCKED**. DEPLOY is shown locked, so it never implies authorization.

Mode tint: a subtle lime wash when accomplished, and a red wash with two beacons in red alert.

## 10. MISSION BOARD

**From data:**

- **Mission shown:** a timed ACTIVE mission. In the seed data this is AN-0142, with 00:48:00 left at the fixed test clock. `?mission=<id>` selects a different one.
- **Stages:**

  | Stage            | Source                                                                                         |
  | ---------------- | ---------------------------------------------------------------------------------------------- |
  | PLAN, BUILD      | mission status                                                                                 |
  | REVIEW           | `review.status`                                                                                |
  | CERTIFY          | `certification`                                                                                |
  | FOUNDER DECISION | linked approvals ("not required" when none are linked; UNKNOWN when approvals are unavailable) |
  | TEST             | always UNKNOWN: the data has no test signal                                                    |

- **Timer:** computed from `startedAt + estimate`. Otherwise it reads UNKNOWN, with a reason.

**Presets:**

- "ACCOMPLISH" with 02:43:17 left
- PLAN ✓ BUILD ✓ TEST ✓ REVIEW ACTIVE CERTIFY FOUNDER DECISION

**Binding:** the board's shape (`MissionBoardState`) is what a later real binding fills.

## 11. COUNTDOWN / ACCOMPLISHED / RED ALERT STATES

| State                | Look                                                                                                         | Wording                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Countdown            | TIME LEFT HH:MM:SS in lime. Critical (≤15 min) turns it red, labelled "· CRITICAL". Overdue reads OVERDUE BY | —                                                                                |
| Mission accomplished | 00:00:00 in lime, all stages ✓, lime tint                                                                    | "Presentation state. This screen certifies and approves nothing."                |
| Red alert            | `role=alert` banner, a red frame and beacons, the REVIEW stage BLOCKED, and the Founder attention list       | Data mode: "RED ALERT · FOUNDER ATTENTION". Preset: "RED ALERT · PREVIEW PRESET" |

- Data mode shows red alert only when an unresolved, unacknowledged CRITICAL alert exists, the
  same rule as the dashboard. It shows accomplished only when the featured mission is COMPLETE.
- Red appears nowhere else, except for BLOCKED and critical chips.

## 12. SYSTEM STATUS / ALERTS / FLOW

**System status:**

| Row         | State             | Basis shown                                             |
| ----------- | ----------------- | ------------------------------------------------------- |
| ANN         | UNKNOWN           | "not connected in this build"                           |
| FORGE FLOOR | ONLINE            | "this dashboard" (UNKNOWN when disconnected)            |
| MEMORY      | UNKNOWN           | "not reported by the data"                              |
| ASSOCIATES  | ONLINE or STANDBY | from worker states (UNKNOWN if workers are unavailable) |
| DEPLOYMENT  | BLOCKED           | "not authorized"                                        |

- UNKNOWN has its own legitimate style: a dashed violet chip, not an error.
- Every state is a word, not just a colour.

**Alerts board:** Requires review, Blocked, In progress and Queued, counted from mission statuses.
When missions are unavailable each count shows "UNKNOWN", never 0.

**Mission flow:** the six stages as labelled chips, each with an icon and a word.

## 13. DEMO / TRUTHFULNESS FIREWALL

- **Provenance chip:** "VISUAL PREVIEW · DEMO DATA / MOCK DATA / BACKEND DATA / LAST KNOWN DATA / REPLAY", taken from the existing `displayMode`.
- **Presets:** additionally carry "PREVIEW PRESET · NOT FROM DATA".
- **Firewall line:** "Preview only: nothing on this screen approves, certifies, dispatches or deploys anything, and no Assembly Nexus connection exists in this build."
- **Associates:** Charles, Cipher, Winter and ADA show presence UNKNOWN · "not connected". "Names on this preview do not assert runtime presence."
- **Decision controls:** none on the page. A test checks that no button says approve, deny, certify, deploy, dispatch or acknowledge.
- **Nothing written:** the model is pure and read-only, and the page makes no adapter calls.
- **Phase 8 rules untouched:** `historyAssured`, the profiles and the governance guard are unchanged, and conformance still passes 15/15.

## 14. INTERACTION

**Stations.** Every on-stage character has a real `<button>`.

- Bound stations are labelled "Crown-Top Scientist: Ada Sprocket, Working". Unbound ones say "decorative, not bound to data".
- Selecting one opens a details panel with role, state, current mission and links to the factual pages, and focus moves to the panel heading.
- Escape or Close dismisses it.

**Boards.** Each board has a "Details" button that explains where its data comes from.

**State in the URL.** Presets are radios, and both preset and selection are kept in the URL
(`?preview=`, `?station=`).

## 15. RESPONSIVE BEHAVIOR

| Width   | Behavior                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥1360px | The HUDs overlay the scene                                                                                                                                          |
| <1360px | The scene keeps a 980px minimum inside its own horizontal scroll region, with a "Scroll sideways to pan the scene." hint. The HUDs and panels stack in a grid below |
| ≤640px  | Minimum 820px; single column                                                                                                                                        |

The page never scrolls horizontally. This is verified at 320, 390, 820, 1440 and 2560px in
en and es, and at 390 and 1440px in pseudo. Existing views keep their responsive behavior: all
existing overflow and pseudo suites pass.

## 16. ACCESSIBILITY

- The scene SVG is `aria-hidden` and `focusable=false`. Its wrapper has `translate="no"`. All facts are in text panels.
- State is never shown by colour or character alone: every state has a word, and most have an icon too.
- Keyboard: tab to the radios (arrow keys move between them), the scene region, the station buttons and the board buttons. Enter or Space selects, Escape closes, and focus moves to the details heading.
- axe (WCAG 2.0/2.1/2.2 A and AA, including contrast in Chromium) is clean for all four presets and the details panel. jsdom axe is clean for 3 visual-floor routes.
- WCAG 2.2 target-size: one defect was found and fixed (§21).

## 17. PERFORMANCE

- **Bundle:**
  - New lazy chunk: 54.3 kB JS (14.6 kB gzip) and 9.7 kB CSS (2.7 kB gzip).
  - Entry bundle: +3.5 kB (en strings and the route). No new dependency and no remote assets.
- **Rendering:** the scene is memoized per mode, and the one-second clock re-renders only the panels.

Timing (median of 9 runs, 1920×1080, built app):

| Route                             | Ready  | Long tasks |
| --------------------------------- | ------ | ---------- |
| `/floor` (existing)               | 624 ms | 98 ms      |
| `/visual-floor`                   | 618 ms | 134 ms     |
| `/visual-floor?preview=red-alert` | 620 ms | 147 ms     |

The existing `performance.spec.ts` budgets still pass.

## 18. SECURITY

- **Nothing new added:** no network destination, credential, auth mechanism, shell, subprocess,
  filesystem write, or dynamic code execution.
- **No external content:** no external images or URLs. All art is inline SVG with literal paths.
- **URL inputs are bounded:**
  - `?preview` is matched against a fixed list.
  - `?mission` and `?station` are only looked up, and are rendered as text only.
- **Artifact URI protections unchanged.**

## 19. TESTS

| Suite                                      | Result                 | New in Phase 9                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| format:check                               | pass                   | —                                                                                                                                                                                                                                                                                                                                                                                                |
| typecheck (`tsc -b --noEmit`)              | pass                   | —                                                                                                                                                                                                                                                                                                                                                                                                |
| lint (`eslint .`)                          | pass, 0 warnings       | —                                                                                                                                                                                                                                                                                                                                                                                                |
| Unit (Vitest)                              | **592/592** (50 files) | `model.test.ts` (13): stages, TEST unknown, founder stage, timer kinds, no ANN/memory/deploy claim, presets, preset tick, data-mode red alert, missions/workers unavailable → UNKNOWN, station binding. `VisualForgeFloorPage.test.tsx` (6): provenance, firewall, boards, decorative SVG, UNKNOWN text, presets, no decision controls, keyboard hotspots and Escape, entry link. a11y routes +3 |
| Contract conformance                       | **15/15**              | unchanged (Phase 8 preserved)                                                                                                                                                                                                                                                                                                                                                                    |
| Browser (Playwright, non-visual)           | **146/146**            | `phase9.spec.ts` (17): entry link and palette, provenance and UNKNOWN, 4 presets with axe, radios by keyboard, station keyboard and Escape with axe, reduced motion (0 running animations; >0 with full motion), overflow at 5 widths in en, Spanish, pseudo sweep, existing views                                                                                                               |
| Visual (pinned `playwright:v1.56.1-noble`) | **49/49**              | 7 new, 9 updated (classified in §20 and VISUAL_REGRESSION.md)                                                                                                                                                                                                                                                                                                                                    |
| Build                                      | pass                   | —                                                                                                                                                                                                                                                                                                                                                                                                |

## 20. VISUAL EVIDENCE

Evidence lives in `docs/reports/phase09/`. All shots use the built app, demo data and the fixed
clock 2026-09-30T12:00Z.

| File                                  | Shows                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `01-desktop-normal.png`               | 1920, from data: AN-0142, 00:48:00, TEST UNKNOWN, ANN UNKNOWN, DEPLOYMENT BLOCKED |
| `02-desktop-mission-accomplished.png` | 1920, accomplished preset                                                         |
| `03-desktop-red-alert.png`            | 1920, red alert / Founder attention preset                                        |
| `04-narrow-820.png`                   | 820, panning scene with the boards stacked below                                  |
| `05-desktop-critical-countdown.png`   | 1920, critical countdown preset (red timer)                                       |
| `06-phone-390.png`                    | 390, phone                                                                        |

Pinned-image baselines `visual-floor-*` (7) are the regression evidence.

Changed existing baselines (diffs reviewed):

- The 8 Forge Floor baselines (`forge-floor-*`, `es-forge-floor-phone`) changed because of the entry link and the Snow Wolf avatar.
- `command-center-wide` changed only at the Kestrel tile.

All are classified INTENDED_PHASE_9_CHANGE.

## 21. DEFECTS FOUND / FIXED

Each defect is listed with its cause, fix and verification.

**P9-D1. Model used non-existent `AttentionItem` fields.**

- **Cause:** assumed field names.
- **Fix:** use `key/id/source/label/state/href`.
- **Verification:** typecheck.

**P9-D2. `translate` attribute is not valid on SVG in TS.**

- **Fix:** moved it to the wrapper div.
- **Verification:** typecheck; pseudo scan.

**P9-D3. react-refresh lint: non-component exports in the scene module.**

- **Fix:** split out `stations.ts`.
- **Verification:** lint, 0 warnings.

**P9-D4. Duplicate board heading ids.**

- **Fix:** `BoardHead` takes an id.
- **Verification:** axe.

**P9-D5. First composition pass was not presentable.**

- **Problems:** characters too small, nameplates overlapping, System HUD covering art, REVIEW strip hidden by the throne, faint skull.
- **Fix:** rescaled and repositioned stations, compacted the HUD, moved the strip after the floor at y 610, enlarged the skull.
- **Verification:** screenshot review.

**P9-D6. Carry bandit showed "07" twice.**

- **Cause:** the crate label overlapped the hoodie label.
- **Fix:** hide the hoodie label while carrying.
- **Verification:** screenshot.

**P9-D7. WCAG 2.2 target-size failure on the details-panel mission link.**

- **Fix:** 24px inline-block target.
- **Verification:** axe in phase9.spec.

**P9-D8. Pseudo scan flagged scene nameplates as clipped text.**

- **Cause:** text inside an absolutely positioned decoration counted as static overflow.
- **Fix:** the helper treats descendants of a floating decoration as that decoration.
- **Verification:** phase5 and phase9 pseudo suites. The rule is no looser for normal text.

**P9-D9. Spanish test waited on the English nav name.**

- **Fix:** wait for the surface instead.
- **Verification:** test passes.

**P9-D10. Pre-existing art broke the Founder rules.**

- **Problems:** `ScientistFigure` cheek circles, and the gray `WolfFigure`.
- **Fix:** removed and replaced (§6, §7).
- **Verification:** visual baselines reviewed.

Deferred: none.

## 22. FILES CHANGED

52 files, relative to `9a42c27`.

**New source:**

- `src/features/visual-floor/model.ts`, `VisualForgeFloorPage.tsx`
- `src/features/visual-floor/scene/ForgeScene.tsx`, `props.tsx`, `stations.ts`
- `src/characters/forge/CrownTopScientist.tsx`, `SnowWolfBandit.tsx`, `ByteWisp.tsx`
- `src/styles/visual-floor.css`

**Modified source:**

- `src/app/router.ts`, `src/app/surfaces.ts`
- `src/characters/ScientistFigure.tsx`, `WolfFigure.tsx`
- `src/config/assemblyNexus.config.ts`
- `src/features/command/commands.ts`
- `src/features/forge-floor/ForgeFloorPage.tsx`
- `src/i18n/en.ts`, `es.ts`
- `src/styles/features.css`

**Tests:**

- `src/features/visual-floor/model.test.ts`, `VisualForgeFloorPage.test.tsx`
- `src/test/a11y.test.tsx`
- `e2e/phase9.spec.ts`, `e2e/pseudo.ts`, `e2e/visual.spec.ts`
- 16 baseline PNGs (7 new, 9 updated)

**Docs:**

- `BUILD_STATUS.md`, `ARCHITECTURE.md`, `LOCALIZATION.md`, `VISUAL_REGRESSION.md`
- this report and 6 evidence PNGs

## 23. COMMITS

Local only. The author is the existing configured identity. No AI or co-author trailers.

1. `ba4240c` Visual Forge Floor preview: presentation model, scene, characters, entry
2. Document Phase 9: Founder visual Forge Floor report and evidence (this report's commit)

## 24. OPEN LIMITATIONS

- **It is stylized SVG, not a raytraced 3D render.** It aims for the cinematic look within the
  "no heavy 3D engine" rule. A higher-fidelity pass (painted backplates, more lighting layers)
  would need an asset decision.
- **Fine detail is small at default size.** The stubble dots on Type B scientists read clearly
  at 1920 and up, but are subtle at 1440. The Type A versus Type B difference is still visible
  through the specular highlight versus the dot texture.
- **Presets replace only the mission board and mode.** Nameplates, the alerts board and system
  status still show current data. This is intentional, so a preset never fabricates other facts.
- **TEST is always UNKNOWN in data mode.** The data has no test signal.
- **The Associates roster is names only.** Presence is UNKNOWN until a real contract exists.
- **Station binding is ordinal.** Up to 6 non-wolf workers map to scientists and up to 5 Snow
  Wolf crew to Bandits. Any further workers appear only in the factual views.
- **No sidebar entry** (Founder decision, §25).

## 25. FOUNDER REVIEW ITEMS

1. **Overall look.** Review the 6 evidence images. Is this the right direction for the Forge
   Floor universe?
2. **Character fidelity.**
   - Crown-Top Scientist Type A and Type B: is the balance clear enough? Should the stubble be stronger?
   - Snow Wolf Bandit proportions and accessories.
   - ByteWisp mood.
3. **Entry point.** Currently there is a link on the Forge Floor page plus the palette command.
   Should the Visual Forge Floor get a sidebar item? That would change the sidebar in all 49
   baselines.
4. **Default state.** Should the page open "From data" (current) or on a preset?
5. **Critical threshold.** Currently 15 minutes. Confirm or change.
6. **Avatar changes.** The gray-wolf avatar and the cheek circles were changed in the factual
   dashboard too, to keep one character universe. Confirm.
7. **Branding density.** Is the restraint level right?
8. **Mission name.** The preset board shows "ACCOMPLISH" as its mission name. Keep it or rename it?
