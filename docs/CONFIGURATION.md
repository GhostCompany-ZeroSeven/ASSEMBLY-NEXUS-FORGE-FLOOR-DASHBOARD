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

## Viewer preferences

Theme, motion (system / reduced / full), density and the single-key-shortcut switch are stored per browser in `localStorage`
(`forge-floor:preferences`). They are not shared across viewers.

## Build-time adapter override (development)

`src/config/runtime.ts` switches the first-party config to the REST adapter when
`VITE_FORGE_ADAPTER=rest` and `VITE_FORGE_REST_BASE_URL` are set. These values are compiled into
the client bundle. **Never put secrets in `VITE_*` variables.**
