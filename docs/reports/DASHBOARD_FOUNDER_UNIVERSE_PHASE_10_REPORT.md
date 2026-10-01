# DASHBOARD_FOUNDER_UNIVERSE_PHASE_10_REPORT

Mission: **DASHBOARD-PHASE-10-FOUNDER-UNIVERSE-CHARACTER-REFINEMENT**
Repository `GhostCompany-ZeroSeven/ASSEMBLY-NEXUS-FORGE-FLOOR-DASHBOARD` · branch `claude/epic-cannon-zezh6m`
Date: 2026-10-01

## 1. Executive summary

The Phase 9 Visual Forge Floor now reads as one Assembly Nexus character universe:

- **Baby Ghost**, the tiny digital laboratory creature: three on stage. One points at the
  alerts board, one carries away a Milk Bone, and one peeks over a monitor.
- **An eight-member Snow Wolf Crew** of chihuahua bandits. Each has its own persona and job:
  Boxer, DJ, Wild Paw, Chuy, Coder, Hauler, Lookout and Snack Guard. Each wears an A•N
  uniform vest over a personal outfit.
- **Exactly eight Crown-Top scientists**: four natural chrome domes and four shaved tops with
  stubble. Seven are veterans and one is a younger adult.
- **Environment:** the playful banner "WITH BOLDNESS COMES INTELLIGENCE." and five approved
  humor phrases used as small props.

All Phase 9 functionality is unchanged: boards, flow, states, provenance, UNKNOWN,
accessibility and responsive behavior.

Every gate is green:

| Gate                  | Result  |
| --------------------- | ------- |
| Unit                  | 604/604 |
| Conformance           | 15/15   |
| Browser               | 150/150 |
| Visual (pinned image) | 49/49   |
| Build                 | pass    |

**GIT_AUTHORSHIP_BLOCKED.** The configured Git identity is `Claude <noreply@anthropic.com>`, an
AI identity. Under §15 I made **no commit**. The work is uncommitted in the working tree and
was not pushed. See §23.

## 2. Preflight

| Check             | Result                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository        | `GhostCompany-ZeroSeven/ASSEMBLY-NEXUS-FORGE-FLOOR-DASHBOARD` ✓                                                                             |
| Branch            | `claude/epic-cannon-zezh6m` ✓                                                                                                               |
| HEAD              | `65b6939e5f6b5811e329af57fc29eb83fe68ac11` ✓                                                                                                |
| origin branch     | `65b6939…`, matches ✓                                                                                                                       |
| main              | `3a3e217` (remote, via ls-remote) ✓                                                                                                         |
| Worktree          | clean ✓                                                                                                                                     |
| Phase 9 artifacts | `src/features/visual-floor/*`, `src/characters/forge/*`, `docs/reports/phase09/*` present ✓                                                 |
| Phase 9 CI        | run #9 on `65b6939`: **completed / success** ✓                                                                                              |
| Git identity      | `Claude <noreply@anthropic.com>` (`/root/.gitconfig`). This is an AI identity, so commits are blocked by §15. I did not change the identity |

## 3. Exact base/head

| Ref                    | Value                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| BASE_HEAD              | `65b6939e5f6b5811e329af57fc29eb83fe68ac11`                                  |
| HEAD after the mission | `65b6939…` (unchanged: no commit)                                           |
| main                   | `3a3e217`                                                                   |
| Changes                | uncommitted in the working tree, plus the staged deletion of `ByteWisp.tsx` |

## 4. Files changed

Uncommitted, relative to `65b6939`.

| File                                                 | Change                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/characters/forge/BabyGhost.tsx`                 | **new**: the Baby Ghost character                                                                         |
| `src/characters/forge/ByteWisp.tsx`                  | **deleted**: replaced by BabyGhost (visual component only)                                                |
| `src/characters/forge/SnowWolfBandit.tsx`            | 8 personas; personal outfit plus A•N uniform vest; accessories; tattoos                                   |
| `src/characters/forge/CrownTopScientist.tsx`         | generations, facial hair, neck goggles, lanyard, new poses                                                |
| `src/characters/WolfFigure.tsx`                      | the factual avatar uses the Coder persona (now with the A•N vest)                                         |
| `src/features/visual-floor/scene/stations.ts`        | 8 + 8 + 2 stations with looks                                                                             |
| `src/features/visual-floor/scene/humor.ts`           | **new**: approved phrase pool and banner text                                                             |
| `src/features/visual-floor/scene/ForgeScene.tsx`     | Baby Ghosts, banner, DJ deck, Paw Squad sign, Milk Bone chalkboard and jar, PAWFECT sticker, draw order   |
| `src/features/visual-floor/model.ts`                 | 8 scientist stations; crew role stations (bindable) versus named stations (never bound); 2 ghost stations |
| `src/features/visual-floor/VisualForgeFloorPage.tsx` | persona and generation names on hotspots and details; wardrobe and "named" notes                          |
| `src/i18n/en.ts`, `src/i18n/es.ts`                   | Baby Ghost, Snow Wolf Crew, persona and generation labels, detail texts                                   |
| `src/features/visual-floor/universe.test.tsx`        | **new**: 12 unit/jsdom tests                                                                              |
| `e2e/phase10.spec.ts`                                | **new**: 4 browser tests                                                                                  |
| `e2e/__screenshots__/*`                              | 14 baselines updated (§21)                                                                                |
| `docs/reports/phase10/*`                             | **new**: 12 evidence PNGs                                                                                 |
| this report                                          | **new**                                                                                                   |

## 5. Architecture impact

This is presentation only.

- **Unchanged:** the data path, adapters and the Phase 8 contract model.
- **Unchanged rules in `buildVisualState`:** it is still pure, and anything it does not know is UNKNOWN.
- **The only model change is station binding:**
  - 8 scientist stations.
  - The Snow Wolf workers in the data can only be shown on the four crew **role** stations (`ban-1..4`).
  - The **named** personas (`ban-5..8`: Boxer, DJ, Wild Paw, Chuy) and the Baby Ghosts are never bound.
  - Workers beyond the stations appear only in the factual views. The seed has 9 non-wolf workers, so one, Juniper, is not on the visual floor.
- **Identifiers:** the station kind `wisp` and the ids `wisp-1`/`wisp-2` stay as stable URL and runtime identifiers. Only the display name became "Baby Ghost".

## 6. Baby Ghost implementation

`BabyGhost.tsx` draws a 120×140 character:

- **Body:** a round translucent baby body with a radial holographic gradient, a glow filter and a wavy tail.
- **Circuitry:** internal circuit traces with lime nodes.
- **Face:** big expressive eyes with highlights and a lopsided, mischievous grin. Alarmed: a small "o" mouth. Accomplished: happy closed eyes.
- **Effects:** glitch particles in cyan, lime, purple and magenta, plus an optional 07 mark.
- **Poses:** `float`, `point`, `peek` and `bone` (holding a Milk Bone).

On stage:

- `wisp-1` points from beside the skull toward the alerts board.
- `wisp-2` floats above the Snack Guard with a stolen Milk Bone.
- A third, decorative ghost peeks over the left code monitor.

Truthfulness: hotspots read "Baby Ghost: decorative, not bound to data". The details panel
says "decoration only … not a worker, a runtime or a fact". Nothing is Halloween-like: there
are no sheets, skulls on the ghost, or horror cues.

## 7. Snow Wolf Crew implementation

All crew members share chihuahua proportions, a black knitted balaclava with rib lines,
expressive glossy eyes, a gold chain with a crown pendant, and a curled tail.

| Station | Persona                | Personal outfit | Accessories / job                                                                 |
| ------- | ---------------------- | --------------- | --------------------------------------------------------------------------------- |
| ban-5   | **Boxer**              | red hoodie      | red boxing gloves in a chin-level guard                                           |
| ban-6   | **DJ**                 | purple hoodie   | headphones; at a DJ deck; band tattoo                                             |
| ban-7   | **Wild Paw**           | olive hoodie    | orange goggles on the mask; cable chaos with sparks; band tattoo                  |
| ban-8   | **Chuy** (crew leader) | black hoodie    | crown, double gold chain, arms crossed                                            |
| ban-1   | Coder                  | teal hoodie     | at the console                                                                    |
| ban-2   | Hauler                 | orange hoodie   | carrying a 07 hardware crate; band tattoo                                         |
| ban-3   | Lookout                | magenta hoodie  | walkie-talkie with a blinking LED; binoculars; on the bench by the Paw Squad sign |
| ban-4   | Snack Guard            | gold hoodie     | hugging the last Milk Bone                                                        |

They are spread across the floor: console, DJ station, carrying hardware, cable chaos,
security lookout, guarding snacks, and standing by the scientists.

- No silver, gray, giant or realistic wolves, and no wolf above the scene.
- The factual dashboard's Kestrel avatar uses the Coder persona.

## 8. Snow Wolf wardrobe/uniform treatment

The personal outfit is **never erased**. The hoodie body, hood, drawstrings and sleeves stay
in the persona's own colour.

The **A•N uniform** is an open vest drawn **over** the hoodie (`data-layer="an-uniform"` comes
after `data-layer="personal"`):

- **Vest colour:** navy, charcoal, black or dark blue, varied across the crew.
- **Trim:** accent-coloured.
- **Patches:** an **A•N** patch on the left chest, a **paw** patch on the right, and **07** on the pocket.

Tests check that every crew member has both layers in that order, with different colours,
and that at least 6 different personal outfits are used.

## 9. Crown-Top scientist ensemble

There are exactly eight, all human stylized scientists in white lab coats with dark gloves.

| Station   | Crown   | Generation | Distinguishing features                                               |
| --------- | ------- | ---------- | --------------------------------------------------------------------- |
| sci-1     | chrome  | veteran    | white side hair, round glasses, mustache, typing                      |
| sci-2     | stubble | veteran    | square glasses, beard, magnifying lens                                |
| sci-3     | chrome  | veteran    | neck goggles, goatee, beaker                                          |
| sci-4     | stubble | veteran    | round glasses, pointing at the binder shelf                           |
| sci-5     | stubble | veteran    | gray beard, thinking pose                                             |
| sci-6     | chrome  | veteran    | square glasses, mustache, clipboard                                   |
| **sci-7** | stubble | **young**  | dark full side hair, smooth face, ID lanyard, bright sneakers, tablet |
| sci-8     | chrome  | veteran    | round glasses, neck goggles, white beard, soldering iron              |

- **Crown types:** 4 chrome and 4 stubble.
- **Side and back hair:** kept for everyone.
- **Full-haired crowns:** none.
- **Cheek circles:** none, and a test checks every scientist's circles.

## 10. Crown-Top generation treatment

**Veterans** have:

- laugh lines and heavier brows
- lighter, gray or white side hair, often with facial hair
- established-researcher props: lens, beaker, soldering iron, clipboard

**The young Crown-Top (sci-7)** has the same crown-top cut (shaved top with stubble, side and
back hair kept). He reads as a younger adult professional, not a child:

- a smooth face and slightly wider smile
- darker, fuller side hair
- an ID lanyard, bright sneakers and a holographic tablet

His hotspot reads "Crown-Top Scientist (younger generation)".

## 11. Environmental humor

Five of the ten approved phrases are used, each as a small prop and never over the interface:

| Phrase                                       | Where                                        |
| -------------------------------------------- | -------------------------------------------- |
| PAWFECT.                                     | yellow sticker on the left-bay graph monitor |
| TODAY'S MISSION: WHO ATE THE LAST MILK BONE? | bench chalkboard                             |
| NEVER CHASE. ALWAYS CHEW.                    | front panel of the DJ deck                   |
| BONE APPÉTIT.                                | label on the Milk Bone jar                   |
| PAW SQUAD. HIGH RISK. NO APOLOGIES.          | enamel sign on the right server rack         |

- The pool lives in `scene/humor.ts`. Every `data-humor` group must use a pool phrase, and its
  text must match that phrase.
- 3–6 phrases are allowed on screen.
- **"AT LEAST I TRIED" is absent.** A test scans the rendered page and every `src` file.
- No depressing or defeatist slogans were invented.

## 12. Crown-Top banner

A hanging lab banner sits between the left pillar and the sign:

- a crown-top emblem: a dome with side hair and a small crown
- **"WITH BOLDNESS COMES INTELLIGENCE."**
- a small italic subline: "Results may vary." and "— Crown-Top Research Division"

It is playful set dressing, not a stated scientific law.

## 13. Branding

- Founder #0007 (dais plate, binder), A•N (sign, crew patches), 07 (crew, ghost, mugs, crate)
  and the Ghost Company bench mark, all used with restraint.
- The full hierarchy (《Assembly▪︎Nexus》, Wolf◇Technologies, Ghost○●Company-07) stays in the shell
  footer and is not repeated in the scene.
- "Founder 007" never appears.

## 14. Mission UI preservation

All Phase 9 functionality is unchanged, and the Phase 9 browser suite (17 tests) still passes:

- mission board, timer and stages
- mission flow, alerts board and system status
- countdown, critical, accomplished and red-alert presets
- Founder attention, UNKNOWN states, provenance chip and preset badge
- entry link and palette command
- keyboard, reduced motion and responsive layout

## 15. Truthfulness firewall

- Provenance stays visible: "VISUAL PREVIEW · DEMO DATA". MOCK DATA is shown in the mock builds.
- Characters assert nothing:
  - Named crew personas and Baby Ghosts are never bound to data.
  - Bound stations show the data worker's name and state from the data.
  - Character costumes carry no operational meaning.
- ANN, MEMORY and TEST stay **UNKNOWN**, and DEPLOYMENT stays **BLOCKED (not authorized)**.
- No Associate presence and no approval or certification controls.
- Phase 8 conformance passes 15/15.

## 16. Accessibility

- The scene remains `aria-hidden` and `translate="no"`.
- All 18 stations are real buttons with descriptive labels, for example:
  - "Snow Wolf Crew · Boxer: decorative, not bound to data"
  - "Crown-Top Scientist (younger generation): Hedda Crucible, Certifying"
- Details are keyboard-opened, focus the heading, and close with Escape.
- axe (WCAG 2.2 AA, including contrast) is clean with Baby Ghost and crew details open, and in all presets.
- The jsdom axe routes pass.
- New animated elements (LED blink, smoke, sparks, ghost glitch) use existing classes that stop under reduced motion. The reduced-motion test (0 running animations) still passes.

## 17. Responsive behavior

- Unchanged: overlay HUDs at ≥1360px, and a pannable scene with HUDs below it at narrower widths.
- No page overflow at 320, 390, 820, 1440 and 2560px in en and es.
- The pseudo-locale run, including the crew and ghost details, at 390 and 1440px is clean.
- At 1920px every principal character is inside the scene and visible around the HUDs (browser-tested).

## 18. Performance

**Bundle:** SVG/CSS only, with no new dependency and no remote assets.

| Chunk                  | Phase 9                | Phase 10               |
| ---------------------- | ---------------------- | ---------------------- |
| Visual floor (lazy) JS | 54.3 kB (14.6 kB gzip) | 65.2 kB (17.1 kB gzip) |
| Entry                  | —                      | unchanged (281.4 kB)   |

**Timing** (median of 9 runs, 1920×1080, built app). This run was slower overall than the
Phase 9 one, so compare routes within the run:

| Route                             | Ready  | Long tasks |
| --------------------------------- | ------ | ---------- |
| `/floor`                          | 818 ms | 278 ms     |
| `/visual-floor`                   | 855 ms | 383 ms     |
| `/visual-floor?preview=red-alert` | 862 ms | 382 ms     |

The scene is still memoized per mode. Existing performance budgets pass.

## 19. Security

- No network destination, credential, auth mechanism, shell, subprocess, dynamic code or
  external URL added.
- All art is inline SVG with literal paths, and all text is static.
- The only `src` file read happens in the test's prohibited-phrase scan, at test time.

## 20. Tests

| Suite                                      | Result             | New in Phase 10                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format:check / typecheck / lint            | pass / pass / pass | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Unit (Vitest)                              | **604/604**        | `universe.test.tsx` (12): 8 Crown-Tops with mixed crowns; 1 young among 7 veterans; no cheek circles; 8 distinct crew personas including Boxer (gloves), DJ (headphones), Wild Paw and Chuy (crown); A•N uniform over the personal layer with ≥6 outfits; Baby Ghosts unbound; named personas unbound; crew details (wardrobe and named); banner; only approved humor, 3–6, text matches; "AT LEAST I TRIED" absent from page and `src`; provenance and UNKNOWN |
| Contract conformance                       | **15/15**          | Phase 8 intact                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Browser (non-visual)                       | **150/150**        | `phase10.spec.ts` (4): universe counts and on-screen check at 1920; Baby Ghost and Boxer keyboard details with axe; presets keep the universe and provenance; pseudo-locale sweep                                                                                                                                                                                                                                                                               |
| Visual (pinned `playwright:v1.56.1-noble`) | **49/49**          | 14 updated (§21)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Build                                      | pass               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 21. Visual regression

Fourteen baselines differed in the pinned image. Each diff was reviewed before updating, and
all 49 then matched in a separate verify run.

| Baselines                                                                                                | Classification           | Cause                                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `visual-floor-desktop`, `-hd`, `-tablet`, `-phone`, `-accomplished`, `-countdown-critical`, `-red-alert` | INTENDED_PHASE_10_CHANGE | New characters, banner and props                                                                                         |
| `forge-floor-desktop`, `-hd`, `-wide`, `-tablet`, `-room`, `-selected-worker`, `command-center-wide`     | INTENDED_PHASE_10_CHANGE | Only the Kestrel tile: the Snow Wolf avatar now wears the A•N vest over its hoodie (the diff image shows that tile only) |

## 22. Screenshot evidence

Evidence lives in `docs/reports/phase10/`. All shots use demo data and the fixed clock.

| #   | File                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `01-full-forge-floor-normal.png`: full Forge Floor, normal state, 1920                                                                                                          |
| 2   | `02a/02b/02c-snow-wolf-crew-*.png`: crew details (left: Coder, DJ, Chuy; center: Hauler, Snack Guard with the Milk Bone ghost, Boxer; right: Wild Paw, Lookout, Paw Squad sign) |
| 3   | `03a-crown-tops-back-row.png` and `03b-crown-tops-front-row.png`: the eight Crown-Tops, including the young one (front row, tablet)                                             |
| 4   | `04-baby-ghost.png`: Baby Ghost pointing, plus the monitor peeker                                                                                                               |
| 5   | `05-mission-accomplished.png`                                                                                                                                                   |
| 6   | `06-red-alert-founder-attention.png`                                                                                                                                            |
| 7   | `07a-narrow-820.png` and `07b-phone-390.png`                                                                                                                                    |
| +   | `08-banner-and-humor.png`                                                                                                                                                       |

## 23. Git status

**GIT_AUTHORSHIP_BLOCKED.** The configured identity `Claude <noreply@anthropic.com>` is an AI
identity. §15 forbids attributing new commits to Claude/Anthropic, and also forbids silently
changing the identity.

- No commit was made.
- The working tree holds all Phase 10 changes: modified, new, and the staged deletion of `ByteWisp.tsx`.
- No push, PR, merge or deploy. `main` is unchanged.
- **Risk:** the container is temporary, so uncommitted work is lost if it is reclaimed.

**To unblock:** Founder/HQ provides the authorized human or project identity, or explicitly
authorizes the existing one. I then commit the tree as-is, without amending prior commits.

## 24. Commit(s), if any

None (see §23).

## 25. Residual risks

- **Uncommitted work** in a temporary container (§23).
- **Data names on archetypes.** Bound scientist stations show demo worker names on Crown-Top
  archetypes, and the archetypes are all one presentation style. For example, "Ada" and "Mina"
  appear as Crown-Top men. This is a presentation decision for the Founder (§26).
- **One worker not on the visual floor.** Nine non-wolf workers fill eight scientist stations,
  so one worker (Juniper) is shown only in the factual views.
- **Factual avatars are unchanged.** The factual Forge Floor's own scientist avatars
  (`ScientistFigure`) still include full-haired styles. Only the visual floor ensemble follows
  the Crown-Top rule.
- **Small text at narrow widths.** Some prop text (DJ deck, Paw Squad sign) is small below
  1440px. It is decorative and never carries state.
- **Performance.** Long tasks rose with the added art (+~100 ms against `/floor` in the same
  run). Ready time is comparable.

## 26. Founder-review items

1. Overall universe: do Baby Ghost, the crew and the Crown-Tops match the reference? Proportions, expressions, density.
2. Snow Wolf personas:
   - Should the four role personas (Coder, Hauler, Lookout, Snack Guard) get canonical names?
   - Should Chuy's leader styling be stronger?
3. Uniform: is the open A•N vest over personal hoodies the right uniform form, or should it be a jacket or armband?
4. Young Crown-Top: is the visual age read right?
5. Data names on Crown-Top archetypes (§25): keep them, show role-only labels, or add archetype variety?
6. Should the factual avatars (`ScientistFigure`) also adopt the Crown-Top rule?
7. Humor: are the five phrase placements right? Swap or add any from the pool?
8. Banner position and wording.

## 27. Machine summary

```
MISSION=DASHBOARD-PHASE-10-FOUNDER-UNIVERSE-CHARACTER-REFINEMENT
BASE_HEAD=65b6939e5f6b5811e329af57fc29eb83fe68ac11
BABY_GHOST=PASS
SNOW_WOLF_CREW=PASS
SNOW_WOLF_UNIFORMS=PASS
CROWN_TOP_COUNT=8
YOUNG_CROWN_TOP=PASS
CROWN_TOP_HAIR_RULE=PASS
PROHIBITED_AT_LEAST_I_TRIED_ABSENT=YES
BOLDNESS_BANNER=PASS
PHASE_09_UI_PRESERVED=YES
TRUTHFULNESS_FIREWALL=PASS
ACCESSIBILITY=PASS
RESPONSIVE=PASS
TESTS=PASS
VISUAL_EVIDENCE=PASS
AI_GIT_AUTHORSHIP_USED=NO
PUSH_PERFORMED=NO
PR_CREATED=NO
MERGE_PERFORMED=NO
DEPLOYMENT_PERFORMED=NO
MAIN_MODIFIED=NO
FINAL_STATUS=BLOCKED
```

FINAL_STATUS is BLOCKED because of **GIT_AUTHORSHIP_BLOCKED**. The work is complete, verified
and Founder-reviewable, but uncommitted until an authorized identity is provided.
