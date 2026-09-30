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

## Adding a language

1. Add the code to `SUPPORTED_LOCALES` and its own name to `LOCALE_NAMES` (`locales.ts`).
2. Create `src/i18n/<code>.ts` typed as `Messages`, and add a loader in `catalogs.ts`.
3. Optionally add `i18n.<code>` overrides to the config's rooms, crews and themes.
4. Run `npm test`. The parity, non-empty and glyph-coverage tests must pass.
