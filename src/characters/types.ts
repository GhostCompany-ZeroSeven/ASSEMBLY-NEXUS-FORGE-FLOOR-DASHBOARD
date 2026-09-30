/**
 * Character definitions. The UI renders a character through
 * `<CharacterAvatar characterId=… pose=… />`, which resolves one of these.
 *
 * Swapping temporary procedural art for production assets is a config change:
 * replace a `procedural-*` definition with an `image` definition, optionally with
 * per-pose and per-room artwork. No application logic depends on how a character
 * is drawn.
 *
 * CHARACTER ≠ IDENTITY AUTHORITY. Characters are presentation only. They carry
 * no identity, capability or authority, and governance never reads them.
 */
export type CharacterDefinition =
  | { kind: 'procedural-scientist'; appearance: ScientistAppearance }
  | { kind: 'procedural-wolf'; appearance: WolfAppearance }
  | ImageCharacter;

/**
 * Visual poses a character may need. Derived from worker state plus floor context
 * (see `resolvePose`). Asset packs can provide any subset; missing poses fall back.
 */
export const CHARACTER_POSES = [
  'idle',
  'working',
  'moving',
  'blocked',
  'waiting-founder',
  'complete',
  'failed',
  'default',
] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

export interface ImageCharacter {
  kind: 'image';
  /** Default image URL (served from `public/` or any same-origin path). */
  src: string;
  /** Per-pose artwork. */
  poses?: Partial<Record<CharacterPose, string>>;
  /** Per-room artwork, e.g. a lab-bench variant in the Build Forge. Wins over `poses`. */
  rooms?: Record<string, string | Partial<Record<CharacterPose, string>>>;
  /** @deprecated Use `poses`. Per-WorkerState overrides kept for compatibility. */
  stateSrc?: Partial<Record<string, string>>;
  alt: string;
}

export type HairStyle = 'sides' | 'tufts' | 'wild' | 'bun' | 'swoop';
export type Eyewear = 'none' | 'glasses' | 'goggles' | 'monocle' | 'visor';
export type Tool =
  | 'none'
  | 'clipboard'
  | 'wrench'
  | 'magnifier'
  | 'shield'
  | 'tablet'
  | 'headset'
  | 'stamp'
  | 'flask';
export type FacialHair = 'none' | 'mustache' | 'beard' | 'goatee';

/**
 * The Forge crew signature: the Forge took their hair as payment, so every
 * scientist has a bald crown with whatever survived around the sides/back.
 */
export interface ScientistAppearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  coat: string;
  /** Accent for collar/badge/tool highlights. */
  accent: string;
  eyewear: Eyewear;
  tool: Tool;
  facialHair: FacialHair;
  /** Eyebrow tilt: `-1` worried … `1` determined. */
  brow: -1 | 0 | 1;
}

export interface WolfAppearance {
  fur: string;
  accent: string;
  coat: string;
}
