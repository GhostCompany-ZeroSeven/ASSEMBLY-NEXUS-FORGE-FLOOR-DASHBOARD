import type { WorkerStateMapping } from '@/domain/status';
import type { WorkerState } from '@/domain/types';
import type { CharacterDefinition } from '@/characters/types';
import type { RestAdapterConfig } from '@/adapters/rest/config';
import type { MissionNumbering } from '@/domain/missionNumber';

/**
 * Open-source configuration surface. Everything product/brand specific lives
 * here so other teams can re-skin the dashboard without touching components.
 * `assemblyNexus.config.ts` is the first-party configuration.
 */
export interface DashboardConfig {
  branding: BrandingConfig;
  governance: GovernanceConfig;
  themes: ThemeDefinition[];
  defaultThemeId: string;
  floor: FloorConfig;
  crews: CrewDefinition[];
  /** Keyed by `Worker.characterId`. */
  characters: Record<string, CharacterDefinition>;
  features: FeatureFlags;
  /** Optional environmental layers (none when omitted). */
  environment?: EnvironmentConfig;
  /**
   * How lifetime mission ordinals are displayed. Optional: the default is no
   * prefix and a 4-digit minimum width (`0000`, `0001`, …). The ordinal itself
   * always comes from the data source.
   */
  missionNumbering?: Partial<MissionNumbering>;
  statusMapping: WorkerStateMapping;
  adapter: AdapterConfig;
}

export interface BrandingConfig {
  productName: string;
  surfaceName: string;
  /** Short monogram used in compact spaces, e.g. `A•N`. */
  monogram: string;
  /**
   * Optional identity hierarchy shown in the header/about panel, top → bottom.
   * Rendered verbatim; do not normalise or abbreviate entries.
   */
  hierarchy: string[];
  /**
   * Optional typographic geometry of the hierarchy (a composed mark, not a
   * list). Without it every line starts at the same x.
   */
  hierarchyLayout?: HierarchyLayout;
  tagline?: string;
}

/**
 * Lines are positioned from measured glyph geometry, never with whitespace.
 * Boundaries are written `left|right` inside the reference line, e.g.
 * `Assem|bly` is the boundary between the `m` and the `b`.
 */
export interface HierarchyLayout {
  /** Index of the reference line; the composition's axis is its centre. */
  axis: number;
  rules: HierarchyRule[];
}

export type HierarchyRule =
  /**
   * The lines share one start x; that block is centred on the axis. `nudge`
   * (em; one value for the block, or one per line in `lines` order) then
   * moves the lines right, after the composition is laid out, so no other
   * line moves.
   */
  | { kind: 'center'; lines: number[]; nudge?: number | number[] }
  /** Centre a line between two boundaries of a reference line. */
  | { kind: 'between'; line: number; ref: number; from: string; to: string };

export interface GovernanceConfig {
  /**
   * The human authority that decides approval gates, e.g. `Founder #0007`.
   * Displayed on every decision surface. Workers never inherit this.
   */
  humanAuthority: string;
  /** Require an explicit confirmation step before a decision is submitted. */
  requireConfirmation: boolean;
  /** Decisions that require a written note. */
  noteRequiredFor: ('APPROVE' | 'DENY' | 'HOLD')[];
}

export interface ThemeDefinition {
  id: string;
  label: string;
  description: string;
  /** Optional display text per UI locale. IDs are never localized. */
  i18n?: LocalizedText<'label' | 'description'>;
}

/**
 * Per-locale display overrides for config text (labels, descriptions, mottos).
 * Presentation only: ids, kinds and authority values are never localized.
 */
export type LocalizedText<K extends string> = Partial<Record<string, Partial<Record<K, string>>>>;

export type RoomKind =
  | 'planning'
  | 'build'
  | 'review'
  | 'certification'
  | 'research'
  | 'security'
  | 'operations'
  | 'founder-gate'
  | 'break'
  | 'den';

export type EquipmentKind =
  | 'whiteboard'
  | 'workbench'
  | 'forge'
  | 'server-rack'
  | 'microscope'
  | 'console'
  | 'scanner'
  | 'vault'
  | 'coffee'
  | 'couch'
  | 'terminal'
  | 'stamp-press'
  | 'gate'
  | 'snow-banner';

export interface RoomDefinition {
  id: string;
  label: string;
  kind: RoomKind;
  /** Placement on the floor plan, in percent of the floor's width/height. */
  area: { x: number; y: number; w: number; h: number };
  equipment: EquipmentKind[];
  description: string;
  /** Crew that owns the room (optional; used for crew-themed rooms). */
  crewId?: string;
  i18n?: LocalizedText<'label' | 'description'>;
}

/** `home` sends the worker to their own `homeRoomId`. */
export type RoomRoute = 'home' | string;

export interface FloorConfig {
  rooms: RoomDefinition[];
  /** Where each worker state places the worker on the floor. */
  stateRoutes: Record<WorkerState, RoomRoute>;
  /** Room where workers waiting on an approval gate gather. */
  approvalRoomId?: string;
}

export interface CrewDefinition {
  id: string;
  label: string;
  motto?: string;
  /** Reserved crews render as placeholders until assets/workers exist. */
  status: 'active' | 'reserved';
  emblem: 'forge' | 'snow-wolf' | 'generic';
  i18n?: LocalizedText<'label' | 'motto'>;
}

export interface FeatureFlags {
  forgeFloor: boolean;
  approvals: boolean;
  alerts: boolean;
  workerMessaging: boolean;
  /** Critical alerts restyle the shell into Red Alert mode. */
  redAlertMode: boolean;
}

/**
 * Optional environmental layers, separate from Dashboard Core features.
 * Omit entirely for none.
 */
export interface EnvironmentConfig {
  /**
   * Makes the Nexus ambient dot field (C5 visual signature) available on the
   * Command Center (prototype). Even when true it stays OFF until the viewer
   * asks for it (`?field=full` / `?field=reduced`).
   */
  ambientField?: boolean;
}

export type AdapterConfig =
  | {
      kind: 'demo';
      tickMs: number;
      seed: number;
      scale?: 'standard' | 'stress';
      /** Start the simulation automatically (default true). */
      autoRun?: boolean;
    }
  /** Generic REST backend. Never put credentials here; see docs/ADAPTERS.md. */
  | { kind: 'rest'; rest: RestAdapterConfig }
  /**
   * Read-only ANN v1 adapter over the deterministic SIMULATED mock feed. No
   * Assembly Nexus system is connected. `humanAuthority` must equal
   * `governance.humanAuthority`: decisions naming anyone else are rejected.
   */
  | {
      kind: 'ann-mock';
      variant?: 'normal' | 'stale' | 'unknown' | 'unavailable';
      humanAuthority: string;
    }
  /**
   * Read-only ANN v1 adapter over the OPTIONAL local snapshot host
   * (scripts/ann-snapshot-host.ts). Explicit opt-in only, never a default.
   * `endpoint` must be exactly `http://127.0.0.1:<1024-65535>/ann/snapshot`
   * (anything else fails closed). Trust: LOCAL_FILE_UNVERIFIED; nothing about
   * the snapshot or any Founder decision is authenticated.
   */
  | { kind: 'ann-local'; endpoint: string; humanAuthority: string }
  | { kind: 'custom'; id: string };
