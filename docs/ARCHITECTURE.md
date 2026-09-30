# Architecture

```
┌──────────────────────── UI (src/features, src/components, src/app) ────────────────────────┐
│  Command Center · Forge Floor · Missions · Workers · Approvals · Alerts · Activity · Settings │
│         reads: normalized DashboardSnapshot + DashboardConfig via React context              │
└───────────────▲──────────────────────────────────────────────────────▲──────────────────────┘
                │ snapshot / connection updates                        │ decide / ack / message
┌───────────────┴──────────── store (src/store) ───────────────────────┴──────────────────────┐
│ DashboardProvider (one adapter) · ConfigProvider · PreferencesProvider (theme, motion)     │
└───────────────▲─────────────────────────────────────────────────────────────────────────────┘
                │ DashboardAdapter contract (src/adapters/types.ts)
┌───────────────┴──────────────┬───────────────────────────────┬─────────────────────────────┐
│ DemoAdapter (implemented)    │ AssemblyNexusAdapter (future) │ REST / EventStream (future) │
│ seed + scripted beats        │ translate AN payloads         │ via transport layer         │
└───────────────┬──────────────┴───────────────┬───────────────┴─────────────────────────────┘
                │ applyEvent (src/domain/reducer.ts)  │ EventTransport (src/adapters/transport)
                ▼                                     ▼
          pure domain model (src/domain)        polling (implemented) · SSE · WebSocket
```

## Layers

| Layer      | Path                     | Rules                                                                    |
| ---------- | ------------------------ | ------------------------------------------------------------------------ |
| Domain     | `src/domain`             | Pure TS. Types, events, reducer, selectors, formatting. No React.        |
| Adapters   | `src/adapters`           | The only place that knows about backends. Emits normalized data only.    |
| Transport  | `src/adapters/transport` | Moves raw messages. No domain knowledge.                                 |
| Config     | `src/config`             | Brand/product specifics. Only `main.tsx` imports the first-party config. |
| Store      | `src/store`              | React context wiring; hooks (`useSnapshot`, `useConfig`, `useNow`).      |
| Characters | `src/characters`         | `CharacterAvatar` resolves art from config; procedural SVG placeholders. |
| Features   | `src/features/*`         | One folder per surface.                                                  |
| Styles     | `src/styles`             | Tokens → base → components → shell → floor → features.                   |

## Key decisions

1. **Snapshot + structured events.** Adapters publish whole snapshots, plus the events that
   produced them when they have them. Events are typed and discriminated by `kind`, and the
   activity stream, timelines and descriptions all derive from them. Nothing is stored as
   free-form log text.
2. **Pure, idempotent reducer.** `applyEvent` ignores duplicate event ids and unknown entities, so
   replayed or out-of-scope events do not corrupt state. The event log is capped at 500 entries.
3. **No invented precision.** Missing progress shows "n/a" with a striped bar. Missing estimates
   show `--:--:--` and "NO ESTIMATE PROVIDED". Finished missions freeze their duration.
4. **Provenance is always visible.** `DataProvenance.mode` plus `verifiedBackend` drive the
   top-bar badge. `live` without `verifiedBackend` renders as DISCONNECTED.
5. **Governance is enforced at two layers.** The UI requires a confirmation step and configurable
   mandatory notes, and adapters must validate the decider against `requiredAuthority`. The demo
   script is structurally unable to decide approvals, because only `submitApprovalDecision` emits
   `approval.decided`.
6. **Capability ≠ authority.** These are separate fields (`capabilities`, `authority`) on
   `Worker`, rendered in separate UI groups.
7. **Floor placement is data-driven.** `stateRoutes` maps each state to a room, `'home'` means the
   worker's station, and workers waiting on an approval go to `approvalRoomId`. Tokens are
   absolutely positioned by percentage, and CSS transitions animate the walk between rooms.
   Below 900px the plan collapses into stacked rooms.
8. **Hash routing, no router dependency.** Static hosting needs no server rewrites.
9. **Plain CSS with tokens.** Themes swap custom properties. `[data-tone]` drives every status
   color. Reduced motion disables all animation and transitions globally.

## Real-time readiness

`DashboardAdapter.subscribe` is transport-agnostic. For incremental backends, keep a snapshot
in the adapter, call `applyEvent` for each normalized event, and publish the result. Use
`createPollingTransport` for REST polling. SSE and WebSocket transports should implement the same
`EventTransport` interface. They are intentionally not built until a real backend needs them.
