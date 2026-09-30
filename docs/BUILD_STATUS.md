# Build Status: Forge Floor Dashboard

_Operational continuity log. A later session should read this first._

- **Branch:** `claude/epic-cannon-zezh6m` (session branch; never merged to `main`)
- **Session 1:** `3a3e217` → `1d2600c` (foundation, phases A–Q)
- **Session 2:** `1d2600c` → `7ae4ed8` (hardening, generic adapter, accessibility)
- **Session 3:** `7ae4ed8` → `0d77f3a` (UI/UX product hardening, Phase 3)
- **Session 4:** `0d77f3a` → `4d5279e` (product hardening Phase 4)
- **Session 5:** `4d5279e` → `c3286ba` (Founder operations intelligence, Phase 5)
- **Session 6:** `c3286ba` → `eaae7e3` (Founder command intelligence, Phase 6)
- **Session 7:** `eaae7e3` → `a9c6c39` (adversarial mock runtime, Phase 7)
- **Session 8:** `a9c6c39` → adapter contract conformance (Phase 8). **Local commits only; not pushed** (push not authorized)
- **Last updated:** 2026-09-30

## Session 8: adapter contract conformance (Phase 8)

Continuity was verified at the start:

- branch at `a9c6c39`, the same as the remote
- `main` at `3a3e217`
- clean tree, no AI trailers
- all Phase 7 files present
- GitHub CI run #7 on `a9c6c39` observed passing

Push, PR, merge and deploy were not authorized, so this session's commits are local only.

### Delivered

| Objective            | Result                                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract model       | 14 rules (`src/domain/contract/rules.ts`). Each has a stable id, a kind (source property or adapter handling), what the dashboard needs, and whether EXACT coverage depends on it                                                  |
| Profiles             | MOCK (provenance `MOCK_PROFILE`), an Assembly Nexus placeholder (all UNKNOWN / UNSPECIFIED), UNDECLARED (the REST default) and SIMULATED (demo). None is Founder approved. The build declares the profile; backend data never does |
| Runner               | `runConformance(profile, probe)` returns PASS / FAIL / UNKNOWN / NOT_APPLICABLE / BLOCKED per rule. Each result states its agreement with the profile and its provenance. UNKNOWN is never PASS                                    |
| Mock probe           | The real `RestAdapter` (REST + SSE transport) against the real Phase 7 mock core, bridged in memory. `npm run test:conformance` writes a report to `test-results/conformance/`                                                     |
| Coverage interaction | EXACT coverage now needs a profile that guarantees id uniqueness, id stability and contiguous windows. Undeclared REST backends are never EXACT (`contract-unassured`)                                                             |
| Inspector            | "Adapter contract" panel in `#/quality`, per rule: what the profile states vs what the current data shows, the environment the backend reports, and Founder approval shown as "not approved". No score, no controls                |
| Governance           | `src/app/governance.phase8.test.tsx` (15). The Phase 7 guard now also forbids application modules from importing test support                                                                                                      |

### Defects

| ID    | Defect                                                                                                                                                                                                                                                             | Fix                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P8-D1 | Phase 7 "duplicate" test data was not identical. Relative source times were resolved on each injection call, so copies differed by milliseconds. The browser DUPLICATES test was really exercising conflicts (the dashboard behaved correctly for the data it got) | Event time and payload pinned per (id, offset) in `e2e/runtimeMock.ts` and the runner. The Phase 7 test now also asserts that no conflict is reported for true duplicates |
| P8-D2 | A REST backend with no stated contract could get EXACT event coverage: contract uncertainty inflated confidence                                                                                                                                                    | `historyAssured`: EXACT only under a profile guaranteeing the history-truth rules                                                                                         |
| P8-D3 | Self-introduced, caught by the browser suite: the panel labelled counts "observed this session", but issue counts describe the latest sync                                                                                                                         | Relabelled "Seen in the current data", with a test that the count drops when a duplicate leaves the listing                                                               |
| P8-D4 | Self-introduced, caught by the Phase 7 guard: a code comment named the mock's path in an application module                                                                                                                                                        | Reworded. The guard is unchanged for application code                                                                                                                     |

### Performance (Phase 7 vs Phase 8 builds, stress dataset, interleaved, median of 9)

| Median (ms)           | Phase 7 | Phase 8 |
| --------------------- | ------- | ------- |
| Render `/missions`    | 511     | 520     |
| Render mission detail | 350     | 351     |
| Render `/activity`    | 369     | 384     |
| Render `/brief`       | 366     | 365     |
| Render `/quality`     | 814     | 817     |
| Palette open + search | 76      | 75      |

Contract costs:

- history assurance: < 0.001 ms
- passive observation of 14 rules over 500 events: 0.13 ms
- full mock conformance run: about 0.3 s, and only when run explicitly

Initial JS is 111.9 kB gzip, 3.2 kB more than Phase 7. The English catalog, which is part of the
entry chunk by design, gained the rule texts. The inspector chunk grew with the panel. An earlier
n=3 run was too noisy to use (± hundreds of ms on unrelated routes) and was replaced by this
n=9 run.

Mutation checks (each break was restored):

- UNKNOWN turned into PASS
- conflict treated as a duplicate
- a non-contiguous listing treated as contiguous
- the mock profile presented as Assembly Nexus (two variants: the profile, and the panel)
- coverage assurance forced on

Each was caught by at least one test.

## Session 7: adversarial mock runtime (Phase 7)

Continuity was verified at the start. The branch was at `eaae7e3` (same as the remote), `main` was at `3a3e217`, the tree was clean,
and there were no AI trailers. GitHub CI run #6 on `eaae7e3` was **observed passing**.
Nothing connects to Assembly Nexus. Everything below runs against this repository's own mock.

### Delivered

| Objective              | Result                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mock injection harness | A real HTTP + SSE mock (`scripts/mock/backend.ts`) with bounded test-data controls: events (stream, listing or both), bulk, faults and a closed list of fixture ops. There is no decision, grant or code-execution operation |
| Runtime server         | `scripts/mock-runtime-server.ts` serves the `--mode e2e-runtime` bundle and the mock on the same origin. Each test gets its own `*.localhost` origin (data and storage isolated)                                             |
| Runtime scenario suite | `e2e/phase7.spec.ts`, 29 tests covering the 25-scenario matrix, plus en/es/pseudo at 320–2560 px with axe                                                                                                                    |
| Event truth            | Arrival-ordered retention, no re-admission of evicted ids, first observation kept on id conflicts, history-gap detection, arrival-time snapshot clock, record-level duplicate handling                                       |
| Inspector              | New issue classes (`event-conflict`, `history-gap`, `duplicate-delivery`) by adapter code, a "History continuity" row, and an "Adapter note" row                                                                             |
| Governance             | `src/app/governance.phase7.test.ts` (11): the app never calls mock controls; the control surface is closed and bounded; injected decisions still face governance                                                             |

### Defects found and fixed (each with a regression test and a mutation check)

| ID    | Defect                                                                                                                                        | Fix                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P7-D1 | At capacity, the REST merge trimmed by SOURCE time, so a late event was dropped at the next re-sync. Coverage could still say EXACT           | Keep first-observation order and drop the earliest observed first                          |
| P7-D2 | A listing with the same id but different facts silently rewrote the observed event                                                            | Keep the first observation and report `event-conflict` (stream and REST)                   |
| P7-D3 | Within one session, a source window that skipped events still gave EXACT (the checkpoint event stayed retained locally)                       | Detect gaps between listings; coverage is never EXACT across a gap                         |
| P7-D4 | A stream event set `snapshot.generatedAt` to its source time (a future-skewed event moved "snapshot produced" into the future)                | `generatedAt` is the arrival time                                                          |
| P7-D5 | One duplicate id in the events listing marked the whole events resource UNAVAILABLE (coverage UNKNOWN, timeline warning)                      | Record-level `duplicate-delivery` issue for events; other resources keep the stricter rule |
| P7-D6 | Introduced by the P7-D1 fix and caught before commit: evicted ids came back as "new" from later listings (churn, rewritten arrival)           | Remember evicted ids (bounded to 5,000)                                                    |
| P7-D7 | Search results had no provenance while data was LIVE but PARTIAL                                                                              | PARTIAL DATA label                                                                         |
| P7-D8 | REST badge: the tooltip was the adapter's English note; backend and config text were not marked `translate="no"`; the badge clipped on phones | Localized tooltip, note moved to the inspector, tags added, badge wraps                    |

P7-D8 was found by the first pseudo-locale sweep ever run against a REST build.

### Performance (Phase 6 vs Phase 7 builds, stress dataset, interleaved, median of 5)

| Median (ms)           | Phase 6 | Phase 7 |
| --------------------- | ------- | ------- |
| Render `/missions`    | 414     | 422     |
| Render mission detail | 242     | 245     |
| Render `/activity`    | 500     | 507     |
| Render `/brief`       | 376     | 374     |
| Render `/quality`     | 123     | 147     |
| Palette open + search | 390     | 347     |
| Locale switch en → es | 99      | 84      |

Raw costs on the stress dataset:

| Measure                                          | Result                                       |
| ------------------------------------------------ | -------------------------------------------- |
| Global digest                                    | 0.65 ms                                      |
| Mission digest                                   | 0.03 ms                                      |
| Markers                                          | 1.29 ms                                      |
| Inspector                                        | 0.05 ms                                      |
| Coverage                                         | 0.08 ms                                      |
| Merge of a 600-event listing (5,000 evicted ids) | 1.51 ms                                      |
| REST sync with 1,000 listed events               | 7.52 ms with 500 duplicates, 5.03 ms without |
| Checkpoint                                       | 19,073 B (unchanged)                         |

Initial JS is 108.7 kB gzip, up 0.42 kB. `/quality` is +24 ms because it has two more rows. Everything else is within
run-to-run noise.

### Runtime scenario matrix

All 25 scenarios PASS in `e2e/phase7.spec.ts`. Tasks, dependencies and artifacts are fields of the
missions resource (the wire format has no separate endpoints), so they fail together with missions.

## Session 7 verification

See the Phase 7 report for the full gate list. Summary:

- 535 unit tests
- 157 browser tests (Phase 7: 29)
- 42/42 visual tests in the pinned image, run twice

## Session 6: Founder command intelligence (Phase 6)

Continuity was verified at the start. Branch `claude/epic-cannon-zezh6m` was at HEAD `c3286ba`,
matching the remote; `main` was at `3a3e217`; the tree was clean; and there were no AI co-author
trailers. The baseline passed first: 424 unit tests, and 110 browser tests in 3 of 4 runs (one
run had a single failure that was not identified and did not reproduce in 10+ later runs). A
Phase 5 production build was kept for the performance comparison.

### Delivered

| Objective                  | Result                                                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event coverage watermark   | The checkpoint (now v2) keeps the ids of the newest observed events (up to 600). Counts are EXACT only when the checkpoint's newest event is still retained (identity, never clock comparison); otherwise LOWER_BOUND, UNKNOWN or NOT_APPLICABLE          |
| Mission-scoped checkpoints | Per-mission views (`forge-floor:mission-views`, max 50, 1 MB bound, validated fail-closed). Recorded on leave/hide from complete, connected data only. Explicit "Mark mission as seen" and "Forget this mission view". No authority, no decisions         |
| Mission change digest      | "Since you last viewed this mission": status, gates, alerts, crew, tasks, dependencies, result, evidence and events. Unknown areas are named; missing history is never "no change"                                                                        |
| Mission Control markers    | NEW, CHANGED and NEEDS FOUNDER as text (not colour only), with hidden explanations for screen readers. "Since last view" filter and "Recent activity" sort, URL-persisted                                                                                 |
| Mission command detail     | Header with freshness, attention for this mission, changes, gates, scoped timeline with NEW SINCE YOUR VIEW tags and a retained-history boundary, alerts, crew, tasks, dependencies and evidence                                                          |
| Attention explanations     | "Why is this here?" with a reason code (`PENDING_FOUNDER_GATE`, `GATE_AUTHORITY_INVALID`, `GATE_STATUS_UNRECOGNIZED`, `ALERT_EXPLICIT_HUMAN_ACTION`, `DATA_UNAVAILABLE_AFFECTS_QUEUE`, `DATA_NOT_CURRENT`), the triggering facts, known and unknown facts |
| Data-quality inspector     | `#/quality`: explicit dimensions per resource (available, freshness, dropped/repaired records, transport), no score. Linked from the brief and transport diagnostics                                                                                      |
| Palette and search         | Mission-scoped "What changed in this mission?", Founder/changed/blocked/failed mission lists, recent activity and the inspector. Search results show their provenance (source mode and freshness)                                                         |
| Timeline and evidence      | Timelines filterable by approval and alert; gate and alert cards link to them. Evidence lists artifacts with http(s)-only links and never presents an artifact as certification                                                                           |
| Governance                 | `src/app/governance.phase6.test.tsx`: 15 rules plus a static guard that no Phase 6 module calls a decision, acknowledgement, messaging or network API                                                                                                     |

### Defects found and fixed this session (each with regression coverage)

| ID  | Defect                                                                                                                        | Fix                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| D1  | **Clock mixing:** the digest compared source event time with the browser-clock checkpoint time; skew could give a false EXACT | Event watermark with identity coverage; test "never compares the source clock" |
| D2  | **Empty vs unknown:** a timeline showed "No activity yet" when the events resource had failed                                 | UNKNOWN empty state with a warning; mutation-checked                           |
| D3  | **Stream events dropped on re-sync:** a REST re-sync removed events observed only on the stream (found in the runtime run)    | `mergeObserved` keeps observed events the listing omits; mutation-checked      |
| D4  | RED ALERT banner text clipped at 320px (pseudo)                                                                               | `overflow-wrap` on the banner                                                  |
| D5  | Mission record status badge overflowing at 1440px (pseudo)                                                                    | The key/value badge wrap applies at every width                                |
| D6  | Inspector "most recently received" picked an arbitrary event within an arrival batch                                          | Tie-break by event time                                                        |
| D7  | Id-based record paths ("mission AN-0139.artifact") were classified as "Other"                                                 | Classifier extended                                                            |

### Bundle

| Measure           | Phase 5                   | Phase 6                                                                                                  |
| ----------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| Initial JS        | 319.5 kB / ~100.9 kB gzip | 341.0 kB / 108.2 kB gzip (+7.3 kB gzip: English strings and mission-view recording, split across chunks) |
| Mission detail    | smaller lazy chunk        | 15.25 kB                                                                                                 |
| Quality inspector | n/a                       | lazy chunk, 5.93 kB                                                                                      |
| Spanish catalog   | 36.37 kB                  | 45.7 kB                                                                                                  |
| Pseudo-locale     | 1.46 kB (lazy)            | 1.45 kB (lazy)                                                                                           |

### Performance (Phase 5 vs Phase 6 builds, stress dataset, fresh load, median)

| Median (ms)           | Phase 5 | Phase 6 |
| --------------------- | ------- | ------- |
| Render `/activity`    | 669     | 678     |
| Render `/missions`    | 569     | 573     |
| Render mission detail | 537     | 535     |
| Render `/brief`       | 518     | 527     |
| Render `/quality`     | n/a     | 156     |
| Palette open + search | 295     | 322     |
| Locale switch en → es | 68      | 100     |

The locale switch is slower because the Spanish chunk is larger; the palette difference is
within the spread of runs. Raw computation on the stress dataset: global digest 0.90 ms,
mission digest 0.05 ms, markers for 400 missions 1.51 ms, attention queue 0.50 ms, inspector
0.05 ms, explanations 0.04 ms, checkpoint serialize/restore 0.20 ms. Sizes: checkpoint 19 kB,
one mission view 401 B, 50 mission views 21 kB. Budgets are in `src/test/perf.test.tsx`.

### Runtime browser exercise (real mock server, REST + SSE)

1. **First visit:** no mission baseline (UNKNOWN).
2. **Leave the mission:** the view was stored; stream events then marked the card CHANGED.
3. **Return:** "EXACT · 3 new events observed", with 3 NEW tags in the scoped timeline.
4. **Approvals HTTP 500:** detected after 41s (`LIVE · STREAM · PARTIAL`); the approvals area
   became UNKNOWN and the mission's attention read Incomplete. The inspector named the resource.
5. **Recovery:** after 59–60s. After the D3 fix the inspector showed stream 9 / poll 15.
6. **Reload:** the mission baseline was kept.
7. **Other languages:** Spanish at 320, pseudo at 320 and English at 2560 had no overflow.

The only console error was the injected 500. A late-arriving event was NOT TESTED at runtime
(the mock has no injection endpoint); it is covered by unit tests.

## Session 5: Founder operations intelligence (Phase 5)

Continuity was verified at the start. Branch `claude/epic-cannon-zezh6m` was at HEAD `4d5279e`,
matching the remote; `main` was at `3a3e217`; the tree was clean; and there were no AI co-author
trailers. The baseline passed first: 331 unit tests and 83 browser tests. A Phase 4 production
build was kept for the performance comparison.

### Delivered

| Objective                  | Result                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change digest              | "What changed since I last looked": 13 categories. Each count is either exact or UNKNOWN with a reason; UNKNOWN history is never shown as "nothing changed". A missing record is "no longer reported". Every item links to its record. There is a palette command, and the item list is capped at 150 while counts stay exact                         |
| Last-view checkpoint       | A bounded fingerprint of ids and enum states, stored locally and validated fail-closed. It is saved on page hide from complete, connected data only, and adopted after 5 minutes away. Manual "Mark all as seen" and "Forget last view". It holds no labels, no authority and no decisions                                                            |
| Founder brief (`#/brief`)  | RUNNING, COMPLETED (+ since last view), BLOCKED, FAILED, NEEDS FOUNDER and NEW SINCE LAST VIEW, plus data/transport problems, next to the freshness source and qualifiers. Missing inputs show UNKNOWN, never 0. Nav item, `G then B`                                                                                                                 |
| Founder attention queue    | Each entry has a source, reason, current state, freshness and navigation target. Entries come from explicit facts only (open gates for the human authority, undecidable gates, UNKNOWN gate status, human-action alerts, unavailable resources, not-current data), never from severity or room. The queue is INCOMPLETE when data is missing          |
| Operations timeline        | Ordered by event time. Event time, arrival (path, received time, ARRIVED LATE) and the linked record's current **Now** state are kept apart. Filters for time range (incl. since last view) and ingest path, URL-persisted. Retained-history start and log-capacity notes. Nothing reconstructed                                                      |
| Cross-surface context      | Mission and worker timelines link to the filtered timeline. Gates list the alerts that name them. Queue items link the gate's mission and blocked workers. Only relationships present in the data                                                                                                                                                     |
| Locale-aware formatting    | `num`, `pct`, `dateTime` and `time` via cached `Intl` (24-hour clock everywhere); applied to progress bars, clocks, the activity stream, conversations, latency and the brief. Ids, enums, authority and timestamps are untouched                                                                                                                     |
| Pseudo-locale (diagnostic) | `?pseudo=1`: accented, +40% padded, `[!! … !!]` text derived from English, with interpolated values exact. It is never stored and is a lazy chunk (1.5 kB). An automated sweep covers all surfaces, the palette (with results), the shortcuts dialog and the brief at 320/390/1440/2560 for untranslated words, cut-off or spilling text and overflow |
| Resilience                 | `src/app/resilience.phase5.test.tsx` plus the domain tests cover malformed or oversized checkpoints and storage, throwing storage, duplicated, out-of-order, re-listed and late events, renamed and disappearing records, partial REST, backend down after "seen", no auto-record from incomplete data, and a locale switch during updates            |
| Governance                 | `src/app/governance.phase5.test.tsx`: the 12 rules from the brief plus a static guard that no Phase 5 module calls a decision, acknowledgement, messaging or network API                                                                                                                                                                              |

### Defects found and fixed this session (each with regression coverage)

| Defect                                                                                                                                                                                                      | Fix                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ingest facts overwritten:** an event received over the SSE stream was relabelled `POLL` on the next REST re-sync (poll replaced the whole event list)                                                     | Ingest path and arrival time belong to the first arrival (`keepFirstIngest`); mutation-checked by the regression test                                             |
| **Activity stream unreadable at 320px:** the event text column collapsed to 0px wide (refs column took the space), in every language                                                                        | Phone grid: links and arrival facts move under the event text                                                                                                     |
| **Data-source label could be hidden:** the topbar `DEMO · SIMULATED` label was `nowrap` inside a shrinkable pill; at 320px (English) it spilled a few px, and a longer label spilled under the next control | Phone topbar: tighter gaps and badge, word wrapping inside the badge, with a mid-word break only as a last resort; the decorative health icon is hidden on phones |
| **Palette commands cut off on phones:** long (Spanish/pseudo) command titles ended in an ellipsis                                                                                                           | Phone palette row layout: the title gets its own full-width row and wraps                                                                                         |
| **Hard-coded English:** the health latency unit `ms`                                                                                                                                                        | Catalog message with a locale-formatted number                                                                                                                    |
| **Overflow at 320px:** long status badges in mission details, mission/worker cards and gate headers; the shortcuts dialog wider than the screen                                                             | Badges in those card contexts wrap on phones; the dialog grid track is `minmax(0, 1fr)`                                                                           |
| **Room labels truncated without the full text**                                                                                                                                                             | `title` with the full label (the button already had an accessible name)                                                                                           |

Found while building, before any commit, and not counted above:

- A future-dated checkpoint would have hidden every later event. It is now rejected.
- Record ids such as `constructor` could collide with `Object.prototype`. Lookups now check own
  properties only.

### Bundle

| Measure         | Phase 4                   | Phase 5                                                                                                           |
| --------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Entry chunk     | 303.60 kB / 96.75 kB gzip | 315.20 kB / 100.70 kB gzip (English brief/timeline strings, last-view provider, Intl formatters)                  |
| Brief surface   | n/a                       | lazy chunk, 17.8 kB / 5.3 kB gzip (digest, attention, brief)                                                      |
| Pseudo-locale   | n/a                       | lazy chunk, 1.46 kB / 0.88 kB gzip; loaded only with `?pseudo=1` (it was 1 kB more in the entry before the split) |
| Spanish catalog | 29.90 kB / 10.30 kB gzip  | 36.37 kB / 12.38 kB gzip                                                                                          |

### Performance (Phase 4 vs Phase 5 builds, stress dataset, interleaved, median of 7)

| Median (ms)                  | Phase 4 | Phase 5 |
| ---------------------------- | ------- | ------- |
| Render `/`                   | 691     | 698     |
| Render `/floor`              | 529     | 548     |
| Render `/missions`           | 379     | 391     |
| Render `/activity`           | 462     | 485     |
| Render `/brief`              | n/a     | 362     |
| Filter missions (text)       | 73      | 70      |
| Timeline filter (500 events) | 102     | 94      |
| Palette open + search        | 363     | 317     |
| Locale switch en → es        | 93      | 83      |
| Sim at 4×: long-task total   | 0       | 0       |

`/activity` first measured +78 ms. The new "Now" lookup was linear per event; after indexing it,
the remaining +23 ms (5%) is the extra "Now" element per row. Everything else is within
run-to-run noise.

Raw computation on the stress dataset (400 missions, 120 workers, 500 events):

- digest: 0.76 ms
- attention queue: 0.53 ms
- timeline filter, order and out-of-order detection: 0.08 ms
- checkpoint build: 0.24 ms; stored checkpoint: 13 kB

Unit budgets in `src/test/perf.test.tsx` guard these values.

### Runtime browser exercise (real mock server, REST + SSE)

Local `scripts/mock-rest-server.ts`, a bundle built with `VITE_FORGE_REST_STREAM=/stream`, and
Chromium, in this order:

1. **First visit:** `LIVE · STREAM`, digest baseline `none`, and "New since last view: UNKNOWN".
2. **Mark all as seen**, then 16s of stream traffic: "Events since then: 2", with every other
   category a known 0. The timeline (`via=stream`) listed the 2 events as `STREAM`, with the
   received time and "Now: Mission Active".
3. **Approvals HTTP 500:** detected after 42s (within the 60s re-sync while the stream is
   healthy). The badge read `LIVE · STREAM · PARTIAL`. "Needs Founder" and "New since last view"
   became UNKNOWN, the queue said INCOMPLETE, and "New approval gates" read
   "UNKNOWN · cannot be loaded now".
4. **Recovery:** numbers were back after 60s.
5. **Reload:** the view saved on `pagehide` became the baseline ("Compared with your last view …
   just now").
6. **Other languages:** Spanish at 390 read `EN VIVO · FLUJO`, and the pseudo-locale at 320 and
   1440 had no overflow.

There were zero page errors. The only console error was the browser logging the injected 500.

## Session 4: product hardening (Phase 4)

Continuity was verified at the start: branch `claude/epic-cannon-zezh6m`, HEAD `0d77f3a` (matching
the remote), `main` at `3a3e217`, a clean tree, six Phase 3 commits and no AI co-author trailers.
The baseline stack passed first: 266 unit tests, 59 browser tests.

### Delivered

| Objective                        | Result                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI visual baseline certification | Rendered in the pinned image (`playwright:v1.56.1-noble`). The glyph fallback was removed at its source, so the session and CI renders are byte-identical (31/31). The tolerance is strict (≤20 px); see VISUAL_REGRESSION.md               |
| Localization                     | English (default) and Spanish. Typed catalogs with compile-time parity, lazy Spanish chunk, `<html lang>`, a Settings control and palette command, browser language as the initial preference, validated storage, localized config text     |
| URL state                        | Missions, Workers, Approvals, Alerts and Activity. Validated, bounded, readable params; Back/Forward, refresh and deep links; fail-safe parsing                                                                                             |
| Transport diagnostics            | Settings → Transport and freshness: configured/active transport, fallback, stream state, attempts, last message/event, rejected messages, last REST verification/attempt, intervals. UNKNOWN when not reported, and no addresses or secrets |
| Freshness model                  | One source (SIMULATED, LIVE, DISCONNECTED, REPLAY) plus coexisting qualifiers (STALE, PARTIAL, UNKNOWN, LAST KNOWN DATA). `complete` is never inferred from transport, and the Founder's LIVE rule is not decided                           |
| Observability                    | Per event: exact time, explicit worker/mission/approval/alert/artifact links, ingest path (STREAM/POLL/SIM). No invented room. Bounded log. Activity filters by category, worker and mission                                                |
| Command palette                  | Switch language, transport diagnostics, jump to Founder attention, jump to unavailable resources, clear filters. Navigation and presentation only                                                                                           |
| Mobile/ultrawide                 | 320, 390, 768, 1080p, 1440 and 2560 with Spanish text, large counts, very long names and titles, palette and room panel: no horizontal overflow                                                                                             |
| Accessibility                    | axe (WCAG 2.2 AA incl. contrast) on every surface in Spanish; `<html lang>`; focus restore in the Spanish palette; accessible scroll regions for wide tables                                                                                |
| Governance                       | `src/app/governance.phase4.test.tsx`: localized label, URL, search, palette, transport-vs-complete, HTTP-success, SSE-claim rules plus static guards                                                                                        |

### Defects found and fixed this session (each with regression coverage)

| Defect                                                                                                                                                                                                               | Fix                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Governance:** an HTTP 200 whose decision record named a _worker_ as `decidedBy` was accepted as a confirmed decision                                                                                               | The confirmed record must itself pass `checkDecision` (required human authority, never a worker) |
| **Recovery:** with the stream open, REST re-verification was throttled to `resyncIntervalMs` (60s) even while unverified, so the badge stayed DISCONNECTED against a healthy backend (found in the real-browser run) | Throttle only while verified; a stream reopening while unverified re-verifies immediately        |
| **Ordering:** a late or out-of-order `worker.state_changed` rolled a worker back to an older state                                                                                                                   | Events older than the worker's `stateSince` are logged but do not change the current state       |
| **Stream recovery:** once the stream gave up (`failed`) it never came back until a reload                                                                                                                            | Re-armed after a verified REST sync and a 5-minute cool-down (bounded, no storm)                 |
| **Visual baselines environment-dependent:** `→` fell outside the bundled font subsets                                                                                                                                | Drawn arrow icon; glyph-coverage test over catalogs, config and TSX/CSS                          |
| **Visual tolerance too loose:** a 1% budget hid real layout shifts, so 3 stale Phase 3 baselines went unnoticed                                                                                                      | Strict budget (≤20 px, threshold 0.1); the stale baselines were investigated and regenerated     |
| **Layout:** very long unbreakable names overflowed worker cards, gate cards and stacked rooms (320–768px)                                                                                                            | `overflow-wrap: anywhere` + `min-width: 0` on content containers                                 |
| **Copy regression during extraction:** three worker-state descriptions were retyped differently                                                                                                                      | Restored; a test now keeps the English catalog identical to the domain labels                    |

### Bundle

| Measure                                              | Phase 3 end                  | Phase 4                                                                       |
| ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Entry chunk                                          | 256.27 kB / 80.84 kB gzip    | 303.60 kB / 96.75 kB gzip                                                     |
| Largest entry contributors (measured via source map) | react-dom 207 kB             | react-dom 207 kB, English catalog 26 kB, search/commands/palette/i18n runtime |
| Spanish catalog                                      | n/a                          | separate chunk, 29.90 kB / 10.30 kB gzip, loaded only for Spanish             |
| Adapter chunks                                       | Demo 35.09 kB, REST 27.85 kB | Demo 35.19 kB, REST 29.20 kB (diagnostics)                                    |

Before the split, the entry was 332.9 kB / 104.5 kB gzip with both catalogs bundled. Lazy-loading
Spanish saved 29.3 kB raw for English users.

### Performance (measured, same machine, same stress run, 5 runs each)

| Median                       | Phase 3 build | Phase 4 build |
| ---------------------------- | ------------- | ------------- |
| First render, stress floor   | 512 ms        | 519 ms        |
| Worst long task at 4× for 8s | 95 ms         | 85 ms         |
| Total long-task time         | 147 ms        | 85 ms         |

No regression, so no optimization was made. Repeated language switching leaves no timer growth
(browser test), and locale switching does not reload or reconnect.

### Runtime browser exercise (real mock server, REST + SSE)

- English and Spanish at 390, 820, 1440 and 2560: `LIVE · STREAM` / `EN VIVO · FLUJO`, correct
  `<html lang>`, no overflow, demo code never loaded, Spanish chunk loaded only for Spanish.
- Fault sequence (exact badge reads):

  | Step                        | Badge                                            |
  | --------------------------- | ------------------------------------------------ |
  | healthy                     | LIVE · STREAM, complete                          |
  | malformed message           | LIVE · STREAM (rejected counted)                 |
  | stream crash                | LIVE · POLL (FALLBACK)                           |
  | health down during fallback | DISCONNECTED · STALE · PARTIAL · LAST KNOWN DATA |
  | stream back                 | LIVE · STREAM                                    |

- Zero page errors. The only console errors were the browser logging the injected 503s and
  dropped connections.

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

## Verification (last run, session 6)

| Check                                                    | Result                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                   | pass                                                                                                                          |
| `npm run typecheck`                                      | pass (app, and node/e2e)                                                                                                      |
| `npm run lint`                                           | pass (0 warnings)                                                                                                             |
| `npm test` (Vitest)                                      | **502/502** across 44 files                                                                                                   |
| — adapter conformance / REST adapter, config, normalize  | 16/16 · 17/17 · 11/11 · 15/15                                                                                                 |
| — transport conformance / SSE / stream / adversarial     | 10/10 · 10/10 · 9/9 · 9/9                                                                                                     |
| — governance (phase 2 / 3 / 4 / 5 / 6)                   | 23/23 · 24/24 · 16/16 · 13/13 · 15/15                                                                                         |
| — Phase 6: mission view/coverage, mission UI, resilience | 34/34 · 16/16 · 5/5 (plus digest 36/36, resilience phase 5 17/17, timeline 8/8, perf 21/21)                                   |
| `npm run test:e2e`                                       | **128/128** in CI mode, 0 flaky: a11y 19, keyboard 7, runtime 6, performance 6, phase 4 18, phase 5 15, phase 6 15, visual 42 |
| Visual suite in the pinned CI image                      | 42/42 (update, verify, and a final verify), and 42/42 on the host                                                             |
| `npm run build` / `npm run build:e2e-rest`               | pass                                                                                                                          |

## Session 5 verification (historical)

| Check                                                                    | Result                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                                   | pass                                                                                                     |
| `npm run typecheck`                                                      | pass (app, and node/e2e)                                                                                 |
| `npm run lint`                                                           | pass (0 warnings)                                                                                        |
| `npm test` (Vitest)                                                      | **424/424** across 40 files                                                                              |
| — adapter conformance / REST adapter, config, normalize                  | 16/16 · 17/17 · 11/11 · 15/15                                                                            |
| — transport conformance / SSE / stream / adversarial                     | 10/10 · 10/10 · 9/9 · 9/9                                                                                |
| — governance (phase 2 / 3 / 4 / 5)                                       | 23/23 · 24/24 · 16/16 · 13/13                                                                            |
| — Phase 5: digest/checkpoint/queue/brief, resilience, brief UI, timeline | 34/34 · 15/15 · 10/10 · 11/11 (filter 3 + UI 8)                                                          |
| — i18n parity, formatting, glyph coverage (incl. pseudo), pseudo, UI     | 9/9 · 4/4 · 5/5 · 4/4                                                                                    |
| — URL state / freshness / diagnostics / activity refs                    | 9/9 · 6/6 · 5/5 · 3/3                                                                                    |
| — UI flows, failure states, a11y (jsdom), perf (+ Phase 5 budgets)       | 11/11 · 15/15 · 15/15 · 17/17                                                                            |
| `npm run test:e2e`                                                       | **110/110** in CI mode: a11y 19, keyboard 7, runtime 6, performance 6, phase 4 18, phase 5 15, visual 39 |
| Visual suite in the pinned CI image                                      | 39/39, twice (update, then verify), and 39/39 on the host                                                |
| `npm run build`                                                          | pass                                                                                                     |

### Session 4 verification (historical)

| Check               | Result                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `npm test` (Vitest) | **331/331** across 33 files                                                                |
| `npm run test:e2e`  | **83/83** in CI mode: a11y 15, keyboard 7, runtime 6, performance 6, phase 4 18, visual 31 |

### Session 3 verification (historical)

| Check               | Result                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest) | **266/266** across 24 files (unit, integration, adapter and transport conformance, governance, jsdom axe) |
| `npm run test:e2e`  | **59/59** in CI mode: axe + contrast, keyboard, runtime/overflow, performance, 25 visual baselines        |

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
4. **LIVE rule:** whether LIVE should require a complete first sync. Today it means "verified
   backend + connected transport", with STALE, PARTIAL and UNKNOWN shown alongside it. The
   freshness model can represent either choice.
5. **Assembly Nexus event stream:** whether one exists, and its contract. The SSE path is built
   against this project's mock contract only.
6. **Last-view scope (Phases 5–6, optional):** the "last looked" checkpoint is per browser and
   local-only by design. The Founder may later want it per identity across devices; that needs
   an authenticated backend store and is deliberately not built. Phase 6 mission views are
   local-only for the same reason.
7. **Mock labelling (Phase 7; still open after Phase 8):** a connected mock backend is shown as LIVE with a MOCK environment
   tag. The environment is reported by the backend. Should a backend reporting a test environment be
   shown as SIMULATED instead of LIVE? This would change the LIVE rule, so it is left to the Founder.

## Known limitations

- While an SSE stream is healthy **and the backend is verified**, REST health is re-verified every
  `resyncIntervalMs` (60s by default). A health endpoint failing while the stream stays up is
  noticed within that window. Once unverified, re-checks run at the poll interval.
- After a REST outage, polling backs off up to 60s, so returning to LIVE can take up to that long
  (sooner when the stream reconnects).
- The CI browser job has not yet run on GitHub for this branch; the pinned image was verified
  locally with Docker. The CI workflow itself is unchanged.
- Only English and Spanish are provided. Config text is localized for the first-party config only.
  `main.tsx`'s pre-React startup error message is English.
- The SSE contract is this project's mock contract, not an Assembly Nexus API.
- A partial first sync can show LIVE (the backend is verified) together with STALE ("no complete
  sync yet"). Both labels are accurate, but the Founder may want a stricter LIVE rule.
- **Change digest limits:**
  - It compares two snapshots (the last view and now). A record that changed and changed back
    in between shows no change.
  - Event counts are exact only while retained history (500 events, or whatever the backend
    lists) reaches back to the last view. Otherwise they are UNKNOWN, with a labelled lower bound.
- **Demo seed:** the demo re-seeds on every load, so demo digests across reloads compare
  simulated data. They are labelled SIMULATED.
- **Last-view checkpoint:** it is per browser (localStorage), not per identity, and it does not
  sync between devices.
- **Timeline "Now":** it shows the current state of the event's mission, or its worker if there
  is no mission. Events that name only an approval or alert link to that record without a
  "Now" chip.
- **Pseudo-locale:**
  - Date words (month names) come from `Intl` in English.
  - The phone topbar's data-source label may break inside a pseudo word as a last resort (never
    in English or Spanish).
- **Mission views (Phase 6):** at most 50 missions are remembered (oldest dropped). Leaving a
  mission records a view by design; "Forget" removes it now, and a later visit records a new one.
- **Event coverage:** only the newest 600 observed event ids are kept, so a backend that lists
  far more events between visits gives LOWER_BOUND rather than EXACT.
- **Unidentified flake:** one baseline browser run at the start of session 6 had one failure that
  was not identified and has not reproduced since.
- **Brief detection delay:** while the stream is healthy, a REST resource failure reaches the
  brief within the 60s re-sync window (measured: 42s).

## Known limitations (Phase 7)

- Event ids are assumed unique, and a listing is assumed to be a contiguous most-recent window.
  Both are mock-contract assumptions and must be confirmed with the real contract.
- Payload differences under the same id are not compared (the paths normalize differently). Only
  kind, time, mission and worker are compared.
- A stream-delivered state change is applied provisionally, as in Phase 6. REST re-sync stays the
  source of truth for records.
- When the mock is connected, the badge shows LIVE with a MOCK environment tag, not the word
  SIMULATED. See Founder decisions.

## Next autonomous actions

1. Watch the GitHub CI run for this branch's head, and act on any diffs.
2. An adapter for the real Assembly Nexus contract, once the Founder decides it.
3. More locales once requested. The pseudo-locale sweep is the acceptance gate for each.
4. A runtime late-event exercise once the mock server can inject events on demand.
