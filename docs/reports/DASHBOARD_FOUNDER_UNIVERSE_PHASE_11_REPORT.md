# DASHBOARD_FOUNDER_UNIVERSE_PHASE_11_REPORT

- **Mission:** DASHBOARD-PHASE-11-FOUNDER-UNIVERSE-CONSISTENCY-REFINEMENT
- **Repository:** `GhostCompany-ZeroSeven/ASSEMBLY-NEXUS-FORGE-FLOOR-DASHBOARD`
- **Branch:** `claude/epic-cannon-zezh6m`
- **Date:** 2026-10-01

## 1. Executive summary

This pass applies the three locked Founder decisions, so the factual dashboard and the Visual
Forge Floor read as one Assembly Nexus universe:

1. **Role/station labels.** The eight visual Crown-Top desks now carry role labels: BUILD,
   ANALYSIS, TEST, RESEARCH, CERTIFICATION, REVIEW, OPERATIONS and SYSTEMS. No visual station is
   bound to a factual worker record any more, so demo names such as Ada or Mina never appear on
   physical characters.
2. **Juniper stays factual-only.** Juniper, like every worker, is fully shown in the factual views.
3. **Factual avatars normalized.** The factual scientist avatars now belong to the Crown-Top
   family:
   - a smooth chrome crown or a shaved stubble crown
   - hair at the sides and back only
   - smooth shading and dark gloves
   - goggles at the neck
   - no cheek marks
   - each scientist keeps their own tools, eyewear, facial hair and expressions

The Phase 9 functionality and the Phase 10 universe are preserved: Baby Ghost ×3, Snow Wolf
Crew ×8 with A•N uniforms, and 8 Crown-Tops.

| Check                 | Result                                   |
| --------------------- | ---------------------------------------- |
| Unit tests            | 618/618                                  |
| Phase 8 conformance   | 15/15                                    |
| Browser tests         | 155/155                                  |
| Visual (pinned image) | 49/49, 23 baselines reviewed and updated |
| Build                 | pass                                     |

There is one local commit by Founder Zero Seven. Nothing was pushed.

## 2. Preflight

| Check                     | Result                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Repository                | `GhostCompany-ZeroSeven/ASSEMBLY-NEXUS-FORGE-FLOOR-DASHBOARD` ✓                                  |
| Branch                    | `claude/epic-cannon-zezh6m` ✓                                                                    |
| HEAD                      | `b52a075575a5dc98f10689208132a927783b8bc4` ✓                                                     |
| History                   | `b52a075` → `65b6939` → `ba4240c` → `9a42c27` … ✓                                                |
| Remote branch             | `b52a075` ✓                                                                                      |
| main                      | `3a3e217` ✓                                                                                      |
| Worktree                  | clean ✓                                                                                          |
| Phase 10 artifacts        | report, 12 evidence PNGs, `universe.test.tsx`, `phase10.spec.ts`, 7 `visual-floor-*` baselines ✓ |
| CI #10 on `b52a075`       | completed / **success** ✓                                                                        |
| Repository-local identity | Founder Zero Seven <ghostcompanyzero7@gmail.com> ✓                                               |

**PREFLIGHT = PASS**

## 3. Base/history verification

- The base `b52a075` (Phase 10) has parent `65b6939` (Phase 9 docs), which follows the
  preserved Phase 8 and Phase 9 chain.
- I did not amend, rebase or rewrite anything.
- The new commit's parent is `b52a075`.

## 4. Founder decisions implemented

| Decision                                             | Implementation                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Visual Crown-Top stations use role/station labels | Each scientist station has a `role`. Nameplates and labels show the role, never a worker name. All visual station bindings to workers were removed (§5) |
| 2. Juniper may remain factual-view-only              | No visual station maps to any worker. Juniper appears only in the factual views (§6)                                                                    |
| 3. Normalize factual scientist avatars               | `ScientistFigure` follows the Crown-Top family rule (§7)                                                                                                |

## 5. Crown-Top station labeling

| Station | Role label    | Character (Phase 10, unchanged)               |
| ------- | ------------- | --------------------------------------------- |
| sci-1   | BUILD         | chrome veteran, typing                        |
| sci-2   | ANALYSIS      | stubble veteran, magnifying lens              |
| sci-3   | TEST          | chrome veteran, beaker                        |
| sci-4   | RESEARCH      | stubble veteran, pointing at the binder shelf |
| sci-5   | CERTIFICATION | stubble veteran, thinking                     |
| sci-6   | REVIEW        | chrome veteran, clipboard                     |
| sci-7   | OPERATIONS    | **younger-generation** stubble, tablet        |
| sci-8   | SYSTEMS       | chrome veteran, soldering iron                |

- **Hotspot labels:** for example "Crown-Top Scientist · BUILD station: decorative, not bound to
  data". For sci-7 the label adds "(younger generation)".
- **Station details** say: "The station label names the kind of work at this desk. It is not a
  worker, an Associate or an authority, and says nothing about who is working. Factual workers
  and their states are in the Workers view." A link opens Workers (factual).
- **"CERTIFICATION", not "CERTIFY".** The Phase 9 guard test forbids action verbs (approve,
  certify, deploy…) on buttons, so this role uses the noun. A desk label must never read like a
  certify control.
- **Crew and Baby Ghosts:** the same separation applies. The Phase 10 role personas (Coder,
  Hauler, Lookout, Snack Guard) were also unbound, because Founder decision 1 keeps visual
  characters separate from factual worker records. Kestrel remains factual-only. Its factual
  avatar is still the Coder chihuahua with the A•N vest.
- **Model:** `bindStations()` takes no snapshot and returns only `{stationId, kind}`. The type
  has no worker field, so the compiler enforces that characters cannot become workers.
- **Spanish:** CONSTRUCCIÓN, ANÁLISIS, PRUEBAS, INVESTIGACIÓN, CERTIFICACIÓN, REVISIÓN,
  OPERACIONES, SISTEMAS.

## 6. Juniper treatment

- Juniper is not placed on any visual station.
- No ninth Crown-Top was created; **CROWN_TOP_COUNT stays 8**.
- Juniper is fully shown in the factual Forge Floor (Break Room), the Workers list and worker
  focus, with the normalized Crown-Top avatar: stubble crown and green wild side hair.
- Tests assert that "Juniper" is absent from the visual stage and present on `#/workers`.

## 7. Factual avatar normalization

Changes to `src/characters/ScientistFigure.tsx` (the factual avatar used by every factual view):

- **Crown types.** A new optional `crown: 'chrome' | 'stubble'` on `ScientistAppearance`:
  - `chrome` keeps the smooth shine.
  - `stubble` draws a clipped follicle-dot cap with a soft highlight.
- **Assignments.** In config: Bramwell, Otto, Cyrus and Hedda are chrome; Ada, Mina, Pim, Rook
  and Juniper are stubble. Fallback avatars for unknown backend ids pick chrome or stubble
  deterministically.
- **Shading and gloves.** Heads get a radial shading overlay, giving the same smooth stylized
  rendering as the visual Crown-Tops. Hands are dark lab gloves, as on the visual Crown-Tops.
- **Hair.** All hair is in `data-hair="sides"` or `data-hair="back"` groups:
  - `bun` became a low knot at the nape, so it is back hair only.
  - `wild` side puffs were lowered below the crown line.
  - No style draws on the top.
- **Goggles** moved from the crown to the neck, so the crown stays visible.
- **Kept as before:** every scientist's own skin, hair colour, eyewear (glasses, monocle, visor,
  goggles), facial hair, tool, accent and state-driven expressions. There are no clones; see
  evidence 05a.
- **Cheeks:** none. The Phase 9 removal is still in place and is now position-tested.

## 8. Crown-Top hair-rule verification

| Scope            | Verified by                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual floor (8) | `universe.test.tsx`: 8 `crown-top`, both `chrome` and `stubble` (≥3 each), 1 young and 7 veterans, no cheek colours                                                                                                                                                                                                                                                     |
| Factual avatars  | `consistency.test.tsx`: every configured scientist has chrome or stubble (4 chrome, 5 stubble); both variants render; for **every hair style** each hair point is at y ≥ 13 and, over the crown band (x 22–42), at y ≥ 26; goggles at y ≥ 34; no circle or ellipse in either cheek zone; fallback avatars get a crown; the factual Forge Floor renders both crown types |
| Browser          | `phase11.spec.ts`: `/floor` and `/workers` render chrome and stubble Crown-Top avatars, axe clean                                                                                                                                                                                                                                                                       |

## 9. Baby Ghost preservation

- **Count: 3**: `wisp-1` points at the alerts board, `wisp-2` carries the Milk Bone, and one
  decorative monitor peeker.
- **Display name:** "Baby Ghost". ByteWisp was not restored.
- **Never a worker:** the details still say "decoration only… not a worker, a runtime or a fact".
  Tests check count 3, unbound hotspots and the exact label.

## 10. Snow Wolf Crew preservation

- **Count: 8.** The personas are unchanged: Boxer, DJ, Wild Paw, Chuy, Coder, Hauler, Lookout
  and Snack Guard.
- **Wardrobe:** personal outfits, with the A•N vest over them.
- **No artwork changed.** Only the data binding of the role personas was removed (§5).
- **Tests:** `universe.test.tsx` and `phase10.spec.ts` pass unchanged.

## 11. A•N branding consistency

- All new and modified UI uses A•N.
- `grep` found no `A.N` anywhere in `src` or `e2e`.
- A test asserts no `A.N` on the visual floor and that each crew uniform shows A•N.
- The Phase 10 commit message ("A.N") is untouched, as instructed.
- The branding hierarchy (Founder #0007, A•N, 《Assembly▪︎Nexus》, Wolf◇Technologies,
  Ghost○●Company-07) is unchanged in the shell. "Founder 007" does not appear.

## 12. Humor / prohibited phrase verification

- **No new humor was placed on screen.** The same five Phase 10 props remain.
- **Pool additions:** two newly approved phrases were added to the pool for future use, but not
  placed: "TOO MUCH? NAH, PAWFECT." and "BIG BETS, BIGGER BONES."
- **Prohibited phrase:** the Phase 10 tests still pass. They check the page and scan every `src`
  file. A Phase 11 test adds a variant-tolerant regex (case, spaces, commas, dots, dashes,
  exclamation marks) across `#/visual-floor`, the red-alert preset, `#/floor` and `#/`. Absent.

## 13. Truthfulness firewall

- **Characters are never workers:** no worker names, states or links are attached to any
  character. This is test-enforced (§5, §20).
- **Provenance** ("VISUAL PREVIEW · DEMO DATA" / MOCK DATA) is unchanged. Preset badges are unchanged.
- **Systems row:** ANN and MEMORY stay **UNKNOWN**, and DEPLOYMENT stays **BLOCKED (not authorized)**.
- **Mission flow:** TEST stays UNKNOWN in data mode.
- **Associates** have presence UNKNOWN.
- **Station labels confer nothing.** They grant no identity, authority or presence, and the
  details panel says so.

## 14. False-green guard

No state was collapsed or renamed. Each stage still maps from its own field, and FOUNDER
DECISION is the last stage:

| Stage            | Source                      |
| ---------------- | --------------------------- |
| PLAN → BUILD     | mission status              |
| TEST             | UNKNOWN, unless data exists |
| REVIEW           | `review.status`             |
| CERTIFY          | `certification`             |
| FOUNDER DECISION | linked approvals            |

- There is no deploy stage. DEPLOY is shown as LOCKED in the scene and BLOCKED in the systems row.
- Decorative poses carry no meaning.
- Role labels describe desks, not results. "REVIEW" on a desk asserts nothing about any review.

## 15. Mission/status preservation

- The mission board, timer, the five presets, the alerts board, system status, mission flow,
  the Associates roster and Founder attention are all unchanged.
- The Phase 9 browser suite passes. Only its keyboard test now targets a role-labelled desk.
- Evidence 06, 08 and 09 show the HUD, red-alert and accomplished states.

## 16. Accessibility

- All 18 hotspots are real buttons with descriptive labels.
- Station details are keyboard-opened, focus the heading, and close with Escape.
- axe (WCAG 2.2 AA in the browser) is clean on:
  - the station detail
  - `/floor` and `/workers` with the new avatars
  - every Phase 9 and Phase 10 check
- jsdom axe routes pass.
- Role nameplates are `aria-hidden`, because the button label carries the same text. State is
  never shown by colour, character or pose alone.
- Reduced motion is unchanged: the Phase 9 test (0 running animations) passes.

## 17. Responsive behavior

| Check                                  | Result                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Role nameplates at 820px and 1920px    | visible and readable (`phase11.spec.ts`)                                                             |
| Page overflow at 320–2560px, en and es | none (Phase 9 suite)                                                                                 |
| Pseudo-locale at 390 and 1440px        | clean, including a station detail                                                                    |
| 390px layout                           | the scene pans, and factual HUDs, provenance and critical text stay readable below it (evidence 07b) |

## 18. Security

- No new dependency, credential, auth mechanism, shell, subprocess, dynamic code, external URL
  or network endpoint.
- All art is inline SVG.
- Artifact URI protections and Phase 8 conformance are untouched (15/15).

## 19. Performance

Bundle sizes:

| Chunk               | Phase 10               | Phase 11               |
| ------------------- | ---------------------- | ---------------------- |
| Visual floor (lazy) | 65.2 kB (17.1 kB gzip) | 64.2 kB (17.0 kB gzip) |
| Entry               | 281.4 kB               | 281.6 kB               |
| CharacterAvatar     | —                      | 14.3 kB (4.3 kB gzip)  |

Timing: median of 9 runs, 1920×1080, built app. Noise between runs is high, so compare routes
within the same run.

| Route                             | Phase 10 run (ready / long tasks) | Phase 11 run (ready / long tasks) |
| --------------------------------- | --------------------------------- | --------------------------------- |
| `/floor`                          | 818 / 278 ms                      | 782 / 123 ms                      |
| `/visual-floor`                   | 855 / 383 ms                      | 804 / 295 ms                      |
| `/visual-floor?preview=red-alert` | 862 / 382 ms                      | 850 / 372 ms                      |

**Directional result: no regression.** The visual floor is about 22 ms slower to become ready
than the factual floor within the same run, the same as in Phase 10. The visual page still has
more long-task time than the factual floor, as it did in Phase 10.

## 20. Unit/conformance results

| Suite               | Result                      |
| ------------------- | --------------------------- |
| format:check        | pass                        |
| typecheck           | pass                        |
| lint (`eslint .`)   | pass                        |
| Unit (Vitest)       | **618/618** (Phase 10: 604) |
| Phase 8 conformance | **15/15**                   |

New unit tests, in `src/features/visual-floor/consistency.test.tsx` (14):

- 8 role-labelled desks with distinct allowed roles and exact label format
- no demo worker name on any character (Juniper included)
- 18 hotspots, all unbound; 3 Baby Ghosts, 8 crew, 8 Crown-Tops
- the station detail text and its factual Workers link
- Juniper present in Workers
- factual crown assignment (≥3 of each type)
- both crown variants render
- the hair geometry rule for all 5 styles
- neck goggles
- the cheek-zone check
- fallback crowns
- factual floor crowns
- A•N on the uniform and no A.N
- the variant-tolerant prohibited-phrase check

Updated tests:

- `model.test.ts`: binding becomes "no station bound", and the visual state is independent of
  worker data.
- `VisualForgeFloorPage.test.tsx`: the keyboard test uses the BUILD desk, and all hotspots are
  unbound.

## 21. Browser results

**155/155** non-visual Playwright tests pass. The Phase 10 total was 150.

`e2e/phase11.spec.ts` adds 5 tests:

- role nameplates readable with no worker names, at 820px and 1920px
- keyboard plus axe on the younger-generation OPERATIONS desk detail
- factual Crown-Top avatars on `/floor` and `/workers`, with axe
- a pseudo-locale sweep

`e2e/phase9.spec.ts` now targets the `sci-1` desk, since bound desks no longer exist.

## 22. Visual regression review

I ran the visual suite first **without** updating: 23 of 49 differed. I reviewed the diff
images before updating. Each diff was confined to avatar pixels or visual-floor nameplates.

| Family          | Baselines                                                                                                                                                                                                                                                                                  | Count | Cause (Phase 11)                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factual avatars | `command-center-desktop`, `command-center-wide`, `es-command-center-desktop`, `forge-floor-desktop`, `-hd`, `-wide`, `-tablet`, `-phone`, `-room`, `-selected-worker`, `es-forge-floor-phone`, `missions-desktop`, `missions-url-filtered`, `workers-desktop`, `worker-focus`, `rest-live` | 16    | Crown-Top normalization of `ScientistFigure`: stubble crowns on 5 scientists, face shading, dark gloves, neck goggles, nape knot. `rest-live` shows the same configured avatars from the REST mock |
| Visual floor    | `visual-floor-desktop`, `-hd`, `-tablet`, `-phone`, `-accomplished`, `-countdown-critical`, `-red-alert`                                                                                                                                                                                   | 7     | Worker nameplates replaced by role/station nameplates on the 8 Crown-Top desks. Crew nameplates removed (no binding)                                                                               |

- Unrelated diffs: none.
- After the update, all **49/49** passed in a separate verify run in the pinned image
  (`playwright:v1.56.1-noble`).

**VISUAL_BASELINES_CHANGED** (23):

- **Factual avatars:** command-center-desktop, command-center-wide, es-command-center-desktop,
  forge-floor-desktop, forge-floor-hd, forge-floor-wide, forge-floor-tablet, forge-floor-phone,
  forge-floor-room, forge-floor-selected-worker, es-forge-floor-phone, missions-desktop,
  missions-url-filtered, workers-desktop, worker-focus, rest-live.
- **Visual floor:** visual-floor-desktop, visual-floor-hd, visual-floor-tablet,
  visual-floor-phone, visual-floor-accomplished, visual-floor-countdown-critical,
  visual-floor-red-alert.

## 23. Build result

`npm run build` (`tsc -b` and `vite build`) passes. The e2e-rest and e2e-runtime builds also pass.

## 24. Founder visual evidence

All evidence is in `docs/reports/phase11/`, using demo data and the fixed clock.

| #   | Required                            | File                                                                                                                         |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Visual Forge Floor desktop overview | `01-visual-forge-floor-desktop.png`                                                                                          |
| 2   | Crown-Top stations with role labels | `02a-crown-top-stations-back-row.png`, `02b-crown-top-stations-front-row.png`, `02c-station-detail-operations.png`           |
| 3   | Snow Wolf Crew + A•N uniforms       | `03a-snow-wolf-crew-center.png`, `03b-snow-wolf-crew-left.png`                                                               |
| 4   | Baby Ghost                          | `04-baby-ghost.png`                                                                                                          |
| 5   | Factual avatar normalization        | `05a-factual-avatars-crown-top-family.png` (all 9 scientists plus Kestrel, labelled by crown), `05b-factual-forge-floor.png` |
| 6   | Mission/status HUD                  | `06-mission-status-huds.png`                                                                                                 |
| 7   | Narrower responsive views           | `07a-narrow-820.png`, `07b-phone-390.png`                                                                                    |
| 8   | Alert/critical state                | `08-red-alert-founder-attention.png`                                                                                         |
| +   | Mission accomplished                | `09-mission-accomplished.png`                                                                                                |

Producing screenshots is not Founder approval. Approval is the Founder's decision.

## 25. Git/authorship verification

| Item                              | Value                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Effective identity before commit  | `Founder Zero Seven <ghostcompanyzero7@gmail.com>`, repository-local (`.git/config`) |
| Global identity                   | untouched                                                                            |
| Author / committer                | Founder Zero Seven <ghostcompanyzero7@gmail.com>                                     |
| AI author, committer or co-author | none                                                                                 |
| AI trailers                       | none                                                                                 |

## 26. Commit information

- One local commit: "Dashboard Phase 11 Founder universe consistency refinement".
- Parent: `b52a075575a5dc98f10689208132a927783b8bc4`.
- The SHA is reported in the mission summary returned with this report, since a commit cannot
  contain its own hash.
- No push, PR, merge or deployment. `main` is unchanged.

## 27. Residual issues / questions

1. **Role-persona binding removed.** Unbinding the crew role personas was not named explicitly,
   but it follows decision 1's principle. The Founder may prefer to re-allow a factual Snow Wolf
   worker on a role-persona station.
2. **Duplicate labels.** The desk labels BUILD, TEST and REVIEW sit near the scene's workflow
   strip (BUILD, TEST, REVIEW, CERTIFY, DEPLOY · LOCKED), so some words appear twice. Acceptable
   or adjust placement?
3. **Desk labels are nouns.** "CERTIFICATION" rather than "CERTIFY" keeps action verbs off
   buttons. Confirm.
4. **Avatar size.** The factual avatars are small (≈48–64px). Crown texture reads at normal zoom,
   but stubble on darker skin (Rook) is subtle.
5. **Juniper** keeps lime-green wild side hair. That is individuality within the rule; confirm
   that the colour suits the universe.
6. **Performance noise.** Timings are noisy across runs, so the figures are directional only.

## 28. Machine summary

```
MISSION=DASHBOARD-PHASE-11-FOUNDER-UNIVERSE-CONSISTENCY-REFINEMENT
MODEL_USED=claude-opus-5-5 (configured session model)

BASE_HEAD=b52a075575a5dc98f10689208132a927783b8bc4
MAIN_HEAD=3a3e217

PREFLIGHT=PASS

ROLE_STATION_LABELS=PASS
JUNIPER_FACTUAL_ONLY_ALLOWED=YES
CROWN_TOP_COUNT=8
FACTUAL_CROWN_TOP_NORMALIZATION=PASS
CROWN_TOP_HAIR_RULE=PASS

BABY_GHOST_COUNT=3
BABY_GHOST_PRESERVED=YES

SNOW_WOLF_CREW_COUNT=8
SNOW_WOLF_CREW_PRESERVED=YES
SNOW_WOLF_UNIFORMS=PASS

A_N_BRANDING=PASS
PROHIBITED_AT_LEAST_I_TRIED_ABSENT=YES

TRUTHFULNESS_FIREWALL=PASS
FALSE_GREEN_GUARD=PASS
UNKNOWN_STATE_PRESERVED=YES

PHASE_08_CONFORMANCE=PASS
PHASE_09_UI_PRESERVED=YES
PHASE_10_UNIVERSE_PRESERVED=YES

ACCESSIBILITY=PASS
RESPONSIVE=PASS
SECURITY=PASS
PERFORMANCE_RESULT=NO_REGRESSION (directional; visual-floor chunk 64.2 kB vs 65.2 kB; ready-time gap to /floor unchanged)

FORMAT=PASS
TYPECHECK=PASS
LINT=PASS
UNIT_TESTS=PASS 618/618
CONFORMANCE_TESTS=PASS 15/15
BROWSER_TESTS=PASS 155/155
VISUAL_TESTS=PASS 49/49
BUILD=PASS

VISUAL_BASELINES_CHANGED=factual-avatars(16), visual-floor(7)
VISUAL_BASELINE_CHANGE_COUNT=23

VISUAL_EVIDENCE=PASS

GIT_IDENTITY_SCOPE=repository-local
AUTHOR_NAME=Founder Zero Seven
AUTHOR_EMAIL=ghostcompanyzero7@gmail.com
COMMITTER_NAME=Founder Zero Seven
COMMITTER_EMAIL=ghostcompanyzero7@gmail.com

AI_AUTHOR=NO
AI_COMMITTER=NO
AI_COAUTHOR_TRAILER=NO

COMMIT_CREATED=YES (1)
COMMIT_SHA=(reported with the mission result)
COMMIT_PARENT=b52a075575a5dc98f10689208132a927783b8bc4
WORKTREE_CLEAN_AFTER=YES

PUSH_PERFORMED=NO
PR_CREATED=NO
MERGE_PERFORMED=NO
DEPLOYMENT_PERFORMED=NO
MAIN_MODIFIED=NO
PHASE_12_STARTED=NO

FINAL_STATUS=PHASE_11_READY_FOR_FOUNDER_REVIEW
```
