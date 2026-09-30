import type { WorkerStateMapping } from '@/domain/status';
import type { WorkerState } from '@/domain/types';
import type { CharacterDefinition } from '@/characters/types';

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
  tagline?: string;
}

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
}

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
}

export interface FeatureFlags {
  forgeFloor: boolean;
  approvals: boolean;
  alerts: boolean;
  workerMessaging: boolean;
  /** Critical alerts restyle the shell into Red Alert mode. */
  redAlertMode: boolean;
}

export type AdapterConfig =
  { kind: 'demo'; tickMs: number; seed: number } | { kind: 'custom'; id: string };
