# Localization

The dashboard ships two UI languages: **English** (`en`, the default and source
language) and **Spanish** (`es`). There is no machine-translation dependency,
no external localization service, and no credential of any kind.

## Architecture

| Piece            | File                        | Role                                                                            |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------- |
| Catalog (source) | `src/i18n/en.ts`            | Every user-facing string. Its TypeScript type _is_ the catalog contract.        |
| Catalog          | `src/i18n/es.ts`            | Typed as `Messages`: a missing, extra or mistyped key is a compile error.       |
| Loading          | `src/i18n/catalogs.ts`      | English is bundled. Spanish is a separate ~30 kB chunk loaded only when needed. |
| Locales          | `src/i18n/locales.ts`       | Supported locales, browser matching, validated stored preference.               |
| Provider         | `src/i18n/I18nProvider.tsx` | Active messages, locale formatters, `<html lang>`, localized config text.       |
| Hook             | `src/i18n/useI18n.ts`       | `const { m, rel, duration, locale } = useI18n()`                                |
| Formatting       | `src/i18n/format.ts`        | Relative time and durations per language (`18m ago` / `hace 18min`).            |

Messages are plain strings or small functions (for plurals and interpolation):

```ts
m.nav.missions; // "Missions" / "Misiones"
m.situation.missionsN(3); // "3 missions" / "3 misiones"
m.status.worker[worker.state]; // keyed by the ENUM value, never by text
```

## Choosing the language

- The first visit follows the browser's language list. This is only the initial
  preference. An unsupported language falls back to English.
- **Settings → Display → Language** (or the palette command "Switch language to …")
  stores an explicit choice in this browser (`forge-floor:preferences`). A stored
  value that is not a known locale is ignored and treated as automatic.
- Switching re-renders in place. It does not reload the page, reconnect the adapter,
  or change the URL, filters or data. `<html lang>` updates with it.
- The chosen language loads before first render, so there is no flash of English.
  If its chunk fails to load, the current language stays on screen.

## What is never translated

Identifiers (mission, worker, approval, alert, artifact ids), enum values
(states, statuses, decisions), backend-provided text (titles, summaries,
messages, `decidedBy`), API values and **authority values** such as
`Founder #0007`. "Founder" is kept untranslated in Spanish UI text because it
names the governance role that the authority value identifies.

Config text (room labels and descriptions, crew labels and mottos, theme
labels) is brand content. It can carry optional per-locale overrides
(`i18n: { es: { label, description } }`; see CONFIGURATION.md). Only display
text changes: ids, kinds, routes and governance are untouched.

## DISPLAY STRING ≠ AUTHORITY VALUE

Translated text is presentation only:

- Decision buttons submit the **enum** (`APPROVE`, `DENY`, `HOLD`) and the configured
  authority, never a label. Deciding in Spanish submits `APPROVE` by `Founder #0007`.
- Governance refusals are returned as **codes**. The UI localizes the explanation by
  code (`src/i18n/refusal.ts`), and governance never reads text.
- Filters, search and URL state compare enum values and ids. Text search also
  matches English and localized labels, so both languages find the same records.
- `src/app/governance.phase4.test.tsx` locks these rules in, including a check that
  translated words are never accepted as a decision or an authority.

## Glyph coverage (rendering determinism)

Every character the UI renders must be covered by the bundled fonts (Inter,
JetBrains Mono). An uncovered glyph falls back to an OS font that differs per
machine, which is why the Phase 3 screenshots differed between environments.
`src/i18n/glyphs.test.ts` checks every message in every language, all config display
text, and all TSX/CSS for uncovered characters. Use an icon instead: arrows are the
drawn `arrow-right` icon (`MoreLink`), not `→`. The one exception is
`branding.hierarchy`, which is rendered verbatim by contract and masked in visual tests.

## Locale-aware numbers, dates and times (Phase 5)

`useI18n()` exposes `num`, `pct`, `dateTime` and `time`, built on cached
`Intl.NumberFormat` / `Intl.DateTimeFormat` instances (`src/i18n/intl.ts`):

- `num(1234)` gives a grouped count, and `pct(42)` gives `42%` in English and `42 %` in Spanish.
- `dateTime(iso)` gives an absolute date and time in 24-hour form, for example
  "Sep 30, 2026, 14:05" or "30 sept 2026, 14:05".
- `time(iso)` gives a 24-hour clock time with seconds, in the viewer's time zone.

Clock times use the 24-hour cycle in every locale, so operators comparing logs
never confuse AM and PM. Invalid or missing input shows "unknown" and never a
guess.

These formatters are for display text only. Identifiers, enum values, authority
names and backend strings are never passed through them. Machine-readable values
stay in attributes such as `<time dateTime="…">`, and the event log keeps the
source's ISO timestamps unchanged.

## Pseudo-locale (diagnostic, Phase 5)

Open any page with `?pseudo=1` before the `#`, for example
`/?pseudo=1#/approvals`. The pseudo text is derived from the English catalog at
runtime (`src/i18n/pseudo.ts`), so it is always complete:

- Every letter becomes an accented look-alike, so any plain-ASCII word left on
  screen is hard-coded English or data.
- Text is padded by about 40% and wrapped in `[!! … !!]`, so truncation (a
  missing `!!]`) and overflow are obvious.
- Interpolated arguments stay exact. Ids, names, numbers and `Founder #0007`
  are inserted untouched, and plurals and Intl formats use English rules.
- Config display text (room, crew and theme labels) is pseudo-localized too.
  Ids, routes and the authority value are not.
- `<html lang>` is `en-XA`. The flag is never stored, never offered in the
  language picker, and its code is a separate chunk that loads only when the
  flag is present. Settings shows a note while it is active.

`e2e/phase5.spec.ts` runs every surface, the palette (with results), the
shortcuts dialog and the brief under the pseudo-locale at 320, 390, 1440 and
2560px. It fails on any of these:

- a visible or labelling word (text, `aria-label`, `title`, `placeholder`)
  that is plain ASCII and is not demo or config data
- pseudo text clipped by its box without its full text in a `title`
- horizontal overflow

Code identifiers shown on purpose (feature-flag keys, mapping values) carry
`translate="no"` and are skipped. Month names produced by `Intl` are allowed.

Findings fixed in Phase 5:

- the hard-coded `ms` unit on health latency
- untagged config identifiers in Settings
- truncated palette commands on phones (they now wrap)
- the activity stream's text column collapsing to 0px at 320px
- a status badge overflowing mission details at 320px
- room labels truncated without their full text (they now have a `title`)

### Phase 6

- Every Phase 6 surface uses the catalogs, in English and Spanish: mission
  changes, markers, attention explanations, the data-quality inspector,
  coverage states, scoped timelines, evidence and palette commands. Reason
  codes (`PENDING_FOUNDER_GATE`…) and ids are shown untranslated
  (`translate="no"`).
- The pseudo detector moved to `e2e/pseudo.ts` and is shared by Phase 5 and
  Phase 6 suites unchanged. `e2e/phase6.spec.ts` sweeps these, with every
  explanation opened, at 320/390/1440/2560:
  - the mission pages (after a real view and change)
  - `?since=changed`
  - `?sort=activity`
  - the inspector
  - the scoped timelines
  - the palette on a mission
- Fixed from that sweep:
  - RED ALERT banner text clipped at 320px
  - status badge overflowing the mission record at 1440px (the Phase 5 wrap
    rule was phone-only)

### Phase 7

- This was the first pseudo-locale sweep against a REST build (earlier sweeps
  used the demo). `e2e/phase7.spec.ts` sweeps the mission page, the scoped
  timeline, the inspector and `?since=changed` in English, Spanish and pseudo
  at 320/390/1440/2560. The adversarial states are on screen during the sweep:
  a late event, a conflict, a history gap and a duplicate. Axe runs at 1440.
- Fixed from that sweep:
  - The badge tooltip was the adapter's English `note`. It is now the
    localized badge description. The note is shown, as adapter text, in the
    inspector's "Adapter note" row.
  - The backend environment tag, the configured adapter label and adapter
    issue messages in the data banner were not marked `translate="no"`.
  - The REST badge (mode, environment, qualifiers, transport) was clipped at
    phone widths. It now wraps.
- The detector's allowlist also takes the test builds' configured data-source
  labels (`VITE_FORGE_REST_LABEL` in `.env.e2e-*`) as config data. The
  detector itself is unchanged.

## Adding a language

1. Add the code to `SUPPORTED_LOCALES` and its own name to `LOCALE_NAMES` (`locales.ts`).
2. Create `src/i18n/<code>.ts` typed as `Messages`, and add a loader in `catalogs.ts`.
3. Optionally add `i18n.<code>` overrides to the config's rooms, crews and themes.
4. Run `npm test`. The parity, non-empty and glyph-coverage tests must pass.
