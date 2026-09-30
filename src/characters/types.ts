/**
 * Character definitions. The UI renders a character through
 * `<CharacterAvatar characterId=… />`, which resolves one of these.
 *
 * Swapping temporary procedural art for production assets is a config change:
 * replace a `procedural-scientist` definition with an `image` definition (per
 * state if desired). No application logic depends on how a character is drawn.
 */
export type CharacterDefinition =
  | { kind: 'procedural-scientist'; appearance: ScientistAppearance }
  | { kind: 'procedural-wolf'; appearance: WolfAppearance }
  | {
      kind: 'image';
      /** Default image URL. */
      src: string;
      /** Optional per-state overrides keyed by WorkerState. */
      stateSrc?: Partial<Record<string, string>>;
      alt: string;
    };

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
