# Adapter contract conformance

The dashboard's event and history truth relies on assumptions about its data source: that
ids are unique, that listings are contiguous windows, and so on. Phase 7 tested those
assumptions against this repository's **mock**. Phase 8 turns them into explicit, executable
rules. This makes it possible to say, for any data source:

- what the source is **stated** to guarantee (a contract profile, with its provenance)
- what the dashboard actually **observed** (a runtime observation)
- what is still **unknown**

**Nothing here is the Assembly Nexus contract.** No Assembly Nexus endpoint, authentication,
credential or event semantics is assumed. The only Assembly Nexus profile is a placeholder in
which every property is UNKNOWN.

## Four kinds of statement, never mixed

| Kind                       | Meaning                                                          | Example                                                   |
| -------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Contract guarantee         | A profile states the source guarantees it                        | the MOCK profile states listings are contiguous windows   |
| Mock assumption            | True of this repository's mock only                              | the mock's listing order is insertion order               |
| Runtime observation        | Seen in one run or in the current data; proves nothing beyond it | a conformance run saw no reused id among 18 listed events |
| Unknown real ANN behaviour | Not known until the Founder approves a contract                  | every clause of the Assembly Nexus placeholder            |

A mock behaviour does not become an Assembly Nexus guarantee because the dashboard depends on
it.

## Model (`src/domain/contract/`)

| File          | Role                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------- |
| `rules.ts`    | The 14 rules: stable id, kind, what the dashboard needs, whether EXACT coverage depends on it |
| `profiles.ts` | Profiles, profile resolution from the build's declaration, and `historyAssured`               |
| `runner.ts`   | Executable runner: probe interface, one procedure per rule, result semantics                  |
| `observe.ts`  | Passive observation of the current data, for the inspector                                    |
| `report.ts`   | Markdown report of a run                                                                      |

Rule names, descriptions and notes are catalog text (`contract.*`, English and Spanish). Rule
ids are never translated.

### Rules

| Rule                         | Kind             | Dashboard needs | EXACT coverage depends on it |
| ---------------------------- | ---------------- | --------------- | ---------------------------- |
| `EVENT_ID_UNIQUENESS`        | source property  | required        | yes                          |
| `EVENT_ID_STABILITY`         | source property  | required        | yes                          |
| `LISTING_WINDOW_CONTIGUITY`  | source property  | required        | yes                          |
| `LISTING_ORDERING`           | source property  | optional        | no                           |
| `DUPLICATE_DELIVERY`         | adapter handling | required        | no                           |
| `AT_LEAST_ONCE_DELIVERY`     | source property  | optional        | no                           |
| `SAME_ID_CONFLICT_SEMANTICS` | adapter handling | required        | no                           |
| `RECONNECT_RESUME_SEMANTICS` | source property  | unknown         | no                           |
| `REST_SSE_RECONCILIATION`    | adapter handling | required        | no                           |
| `EVENT_TIME_SEMANTICS`       | adapter handling | required        | no                           |
| `RECEIVED_TIME_SEMANTICS`    | adapter handling | required        | no                           |
| `HISTORY_TRUNCATION_SIGNAL`  | adapter handling | optional        | no                           |
| `RESOURCE_PARTIAL_FAILURE`   | adapter handling | required        | no                           |
| `MALFORMED_RECORD_HANDLING`  | adapter handling | required        | no                           |

For each rule, the test procedure and the expected behaviour are in its runner procedure.
The observed behaviour, result and evidence come from a run. The provenance is in the
profile.

## Profiles

A profile is **declared by the build** (`VITE_FORGE_CONTRACT_PROFILE`, or `contractProfile` in
the REST adapter config). It is never read from backend data, so a backend reporting
`environment: mock` does not select the mock profile. Unknown ids resolve to UNDECLARED.

| Profile                         | Kind                           | Provenance     | Founder approved |
| ------------------------------- | ------------------------------ | -------------- | ---------------- |
| `forge-floor-mock-v1`           | MOCK                           | `MOCK_PROFILE` | no               |
| `assembly-nexus-unapproved`     | REAL_ANN_PLACEHOLDER           | `UNKNOWN`      | no               |
| `undeclared` (default for REST) | UNDECLARED                     | `UNKNOWN`      | no               |
| `simulated` (demo adapter)      | SIMULATED (no source contract) | `UNKNOWN`      | no               |

`FOUNDER_APPROVED_CONTRACT` is a reserved provenance. No profile carries it, and
`governance.phase8.test.tsx` fails if one does.

### What the MOCK profile states (read from the mock implementation)

| Rule                         | Statement                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `EVENT_ID_UNIQUENESS`        | guaranteed for events the mock generates; test injection may reuse ids on purpose                 |
| `EVENT_ID_STABILITY`         | guaranteed (the same id in the SSE `id:`, the SSE data and the listing)                           |
| `LISTING_WINDOW_CONTIGUITY`  | guaranteed: the listing is the newest N events in insertion order                                 |
| `LISTING_ORDERING`           | guaranteed insertion order (not event-time order)                                                 |
| `AT_LEAST_ONCE_DELIVERY`     | **not** guaranteed: stream events sent during a disconnect are lost; the listing may recover them |
| `RECONNECT_RESUME_SEMANTICS` | **not supported**: no replay; the dashboard recovers by REST re-sync                              |
| `HISTORY_TRUNCATION_SIGNAL`  | **not supported**: the source never signals truncation; the dashboard infers gaps                 |
| Handling rules               | not source properties; checked by the runner                                                      |

### The Assembly Nexus placeholder

Every source property is UNKNOWN. Every capability is UNKNOWN. Endpoints, stream and
authentication are UNSPECIFIED. It contains no URL, no credential and no event semantics. With
no Assembly Nexus adapter to test, every rule is BLOCKED.

## Conformance results (per rule, one run)

| Result           | Meaning                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `PASS`           | The procedure ran and the expected behaviour was observed in this run  |
| `FAIL`           | The procedure ran and contrary behaviour was observed                  |
| `UNKNOWN`        | The procedure ran but could not decide. **Never counted as PASS**      |
| `NOT_APPLICABLE` | The rule does not apply to the target (e.g. no push stream)            |
| `BLOCKED`        | The procedure could not run (no target, or a missing probe capability) |

Each outcome also records:

- the profile's statement and its provenance
- `profileConsistency`: `CONSISTENT`, `CONTRADICTS_PROFILE`, or `NOT_COMPARABLE` (when the
  profile says UNKNOWN or UNSPECIFIED, or the result is UNKNOWN or BLOCKED)
- the observed capability (resume, truncation signal)
- for malformed records, the treatment per case: `DROP_RECORD`, `DEGRADE_RESOURCE`,
  `FAIL_RESOURCE` or `UNKNOWN`

There is no aggregate score.

### Running it

```bash
npm run test:conformance   # runner vs the mock (in process), negative controls, placeholder
```

The in-process probe (`src/test/mockContractProbe.ts`) drives the real `RestAdapter`, including
its SSE transport, against the real Phase 7 mock core, bridged in memory. A run writes
`test-results/conformance/mock-profile.{md,json}`. That directory is not committed.

Negative controls prove that each rule can report something other than PASS:

- a listing with a hole
- a source that reuses an id
- a stream that never comes back
- a procedure that throws
- probes without capabilities

### Mock results (this repository, Phase 8)

| Rule                         | Result | Observed                                                                                                                                         |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EVENT_ID_UNIQUENESS`        | PASS   | no reused id                                                                                                                                     |
| `EVENT_ID_STABILITY`         | PASS   | same id on both paths, kept once                                                                                                                 |
| `LISTING_WINDOW_CONTIGUITY`  | PASS   | contiguous suffix                                                                                                                                |
| `LISTING_ORDERING`           | PASS   | stable insertion order                                                                                                                           |
| `DUPLICATE_DELIVERY`         | PASS   | all four paths counted once; not reported as conflicts                                                                                           |
| `AT_LEAST_ONCE_DELIVERY`     | FAIL   | a stream-only event is lost during a disconnect. This is **consistent** with the profile (not guaranteed)                                        |
| `SAME_ID_CONFLICT_SEMANTICS` | PASS   | first observation kept; `event-conflict`, not `duplicate-delivery`                                                                               |
| `RECONNECT_RESUME_SEMANTICS` | PASS   | resume NOT_SUPPORTED. The adapter sends `lastEventId` as a hint, the mock does not replay, and REST recovers the event                           |
| `REST_SSE_RECONCILIATION`    | PASS   | reconciled                                                                                                                                       |
| `EVENT_TIME_SEMANTICS`       | PASS   | skewed source times kept as reported                                                                                                             |
| `RECEIVED_TIME_SEMANTICS`    | PASS   | arrival time kept; snapshot time not moved by a future-skewed event                                                                              |
| `HISTORY_TRUNCATION_SIGNAL`  | PASS   | no signal (NOT_SUPPORTED); gap inferred                                                                                                          |
| `RESOURCE_PARTIAL_FAILURE`   | PASS   | each resource isolated. Crew, tasks, dependencies and artifacts belong to missions                                                               |
| `MALFORMED_RECORD_HANDLING`  | PASS   | missing id, bad time, bad stream text, duplicate and conflict → DROP_RECORD; unknown enum → DEGRADE_RESOURCE; unreadable payload → FAIL_RESOURCE |

## Interaction with event coverage

EXACT coverage relies on:

- `EVENT_ID_UNIQUENESS` (a reused id would hide a new event as already seen)
- `EVENT_ID_STABILITY` (a re-issued id would count one event twice)
- `LISTING_WINDOW_CONTIGUITY` (overlap proves nothing was skipped only for a contiguous window)

`historyAssured(provenance)` is true only when the active profile GUARANTEES all three (or the
data is simulated locally). Otherwise coverage is never EXACT. It is AT LEAST N, or UNKNOWN, with
the reason `contract-unassured`, shown as "the data source's contract does not guarantee a
complete event history". Contract uncertainty therefore never inflates coverage confidence.
Test builds declare the mock profile, so their Phase 6 and 7 behaviour is unchanged.

## The inspector (`#/quality`, "Adapter contract")

The panel answers four questions:

- **What does this adapter guarantee?** The profile kind, id, provenance and each clause.
- **What did we actually observe?** "Seen in the current data". Data-quality issues describe
  the latest sync, so a duplicate that has left the listing is no longer counted. "None seen"
  is explicitly _not a pass_.
- **What remains unknown?** UNKNOWN clauses, and rules that are not observable from the data
  alone.
- **Which assumptions affect event-history truth?** The rules marked as affecting it, and
  whether EXACT coverage is allowed.

The panel is read-only and passive. It runs no probe, makes no request, has no controls and
shows no score. Founder approval always reads "not approved".

## Authority firewall

- CONFORMANCE PASS ≠ AUTHORITY ≠ CERTIFICATION ≠ FOUNDER APPROVAL
- MOCK PROFILE ≠ REAL ANN CONTRACT
- RUNTIME OBSERVATION ≠ CONTRACT GUARANTEE
- EVENT ≠ AUTHORITY
- ARTIFACT ≠ CERTIFICATION
- MARK SEEN ≠ APPROVAL
- SEARCH RESULT ≠ AUTHORITY

These are enforced by `governance.phase8.test.tsx`:

- no profile is approved
- the placeholder assumes nothing
- the profile is never taken from payloads
- coverage is never EXACT when the history rules are unassured
- the runner is not imported by application modules
- contract modules have no network, decision or code-loading path
- the probe interface has no decision operation

## Test-environment display (open Founder decision)

A backend can report `environment` (e.g. `mock`). The badge shows it as a tag next to LIVE, and
the inspector shows it as "reported by the backend, not verified". Should such a backend be
shown as SIMULATED instead of LIVE? That is a **Founder decision** and has not been made. The
Phase 7 display (LIVE + MOCK tag) is unchanged. It is not a falsehood: the transport is live
and verified, and the tag names the environment the backend reports.

## Adding a real Assembly Nexus profile (future; requires Founder approval)

1. The Founder approves an Assembly Nexus contract document: API, event stream, authentication
   approach and credential location.
2. Fill a new profile from that document only, with provenance `FOUNDER_APPROVED_CONTRACT`
   and a reference to the approval. Leave UNKNOWN whatever the document does not state.
   Update the governance test's allow-list deliberately.
3. Write a probe for the real adapter. Rules that need injection stay BLOCKED unless an
   approved test environment provides injection.
4. Run the conformance suite and review each `CONTRADICTS_PROFILE` result before relying on the
   profile.
5. EXACT coverage becomes available only if the approved profile guarantees all three
   history-truth rules.
