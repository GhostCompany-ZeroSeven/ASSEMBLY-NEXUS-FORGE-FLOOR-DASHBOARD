# Configuration

All product and brand specifics live in a `DashboardConfig` (`src/config/types.ts`). The
first-party configuration is `src/config/assemblyNexus.config.ts`. To make your own:

```ts
// src/config/myorg.config.ts
import { assemblyNexusConfig } from './assemblyNexus.config';
import type { DashboardConfig } from './types';

export const myConfig: DashboardConfig = {
  ...assemblyNexusConfig,
  branding: { productName: 'Acme Agents', surfaceName: 'Ops Floor', monogram: 'AA', hierarchy: [] },
  governance: {
    humanAuthority: 'On-call Lead',
    requireConfirmation: true,
    noteRequiredFor: ['DENY', 'APPROVE'],
  },
};
```

Then pass it in `src/main.tsx`: `<App config={myConfig} />`.

## Sections

| Key                    | Purpose                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `branding`             | Product/surface names, monogram, optional identity `hierarchy` (rendered verbatim, top → bottom)                            |
| `governance`           | `humanAuthority` shown on every gate. Confirmation step. Decisions that require a note                                      |
| `themes`               | Selectable themes. Each `id` must have a matching `[data-theme='id']` block in `src/styles/tokens.css`                      |
| `floor.rooms`          | Room id, label, `kind`, `area` (percent x/y/w/h on the floor plan), `equipment`, optional `crewId`                          |
| `floor.stateRoutes`    | Worker state → room id, or `'home'` for the worker's `homeRoomId`                                                           |
| `floor.approvalRoomId` | Where workers waiting on an approval gather                                                                                 |
| `crews`                | Crew label, motto, `status: 'active' \| 'reserved'`, emblem                                                                 |
| `characters`           | `characterId` → character definition (see below)                                                                            |
| `features`             | `forgeFloor`, `approvals`, `alerts`, `workerMessaging`, `redAlertMode`                                                      |
| `statusMapping`        | Raw backend state string → `WorkerState`, used by adapters through `mapWorkerState`                                         |
| `adapter`              | `{ kind: 'demo', tickMs, seed }`, `{ kind: 'rest', rest: RestAdapterConfig }` (see ADAPTERS.md) or `{ kind: 'custom', id }` |

## Characters and production art

Any character can be one of three kinds:

```ts
{ kind: 'procedural-scientist', appearance: { skin, hair, hairStyle, coat, accent, eyewear, tool, facialHair, brow } }
{ kind: 'procedural-wolf', appearance: { fur, accent, coat } }            // Snow Wolf placeholder
{ kind: 'image', src: '/art/ada.png', stateSrc: { WORKING: '/art/ada-working.png' }, alt: 'Ada' }
```

To swap placeholders for finished art, put the files in `public/` and change the definitions to
`image`. Components, layout and state logic stay the same. Images render at a 4:5 aspect ratio.
Their feet should sit at the bottom edge so they stand correctly on the floor. Unknown
`characterId`s fall back to a deterministic generated scientist.

### Poses and per-room art

Image characters can provide art per **pose** and per **room**:

```ts
{
  kind: 'image', src: '/art/ada.png', alt: 'Ada',
  poses: {                                   // idle · working · moving · blocked ·
    working: '/art/ada-working.png',         // waiting-founder · complete · failed · default
    'waiting-founder': '/art/ada-waiting.png',
  },
  rooms: {
    'build-forge': { working: '/art/ada-forge.png' },   // pose-specific art in one room
    'snow-wolf-den': '/art/ada-den.png',                // or one image for that room
  },
}
```

The pose comes from the worker's state and situation (`src/characters/pose.ts`). In priority
order it is: walking between rooms → `moving`; blocked on an open gate → `waiting-founder`;
otherwise the pose for the state. For images the lookup order is: room + pose, room default,
pose, legacy `stateSrc`, `poses.default`, then `src`. Missing art never breaks rendering. The
procedural placeholders express the same poses. Snow Wolf characters use `procedural-wolf`.

**A character is presentation only.** Pose, room, art and the Snow Wolf look never confer
identity or authority. Decisions are checked against the governance rules and the configured
human authority, never against how a worker looks or where it stands. The floor always shows
the state as text and a glyph next to the art, so information never depends on the pose alone
(or on colour or motion).

## Demo-only URL flags

These apply only when the demo adapter is active. A real backend adapter ignores them.

| Flag           | Effect                                                                          |
| -------------- | ------------------------------------------------------------------------------- |
| `?demo=paused` | Start with the simulation paused (used for deterministic screenshots)           |
| `?demo=stress` | Large deterministic dataset (hundreds of workers and missions) for perf testing |

They combine, for example `?demo=stress,paused`.

## Viewer preferences

Language (automatic / English / Español), theme, motion (system / reduced / full), density and
the single-key-shortcut switch are stored per browser in `localStorage`
(`forge-floor:preferences`). They are not shared across viewers. Stored values are validated on
load: an unknown language falls back to automatic (the browser's language, if supported).

## Localized config text

Rooms, crews and themes can carry per-locale **display** overrides. Only `label`,
`description` (rooms, themes) and `motto` (crews) can be overridden:

```ts
{
  id: 'founder-gate',
  label: 'Founder Gate',
  description: 'Workers wait here for human approval. Only the human authority opens the gate.',
  i18n: { es: { label: 'Puerta del Founder', description: 'Los trabajadores esperan aquí…' } },
}
```

Ids, kinds, routes, the approval room and `governance.humanAuthority` are never localized. See
[LOCALIZATION.md](LOCALIZATION.md).

## Build-time adapter override (development)

`src/config/runtime.ts` switches the first-party config to the REST adapter when
`VITE_FORGE_ADAPTER=rest` and `VITE_FORGE_REST_BASE_URL` are set. These values are compiled into
the client bundle. **Never put secrets in `VITE_*` variables.**
