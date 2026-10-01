import type { CharacterDefinition, ScientistAppearance } from './types';

const SKINS = ['#f1c6a8', '#e0ac86', '#c68a62', '#8d5a3b', '#6b4430', '#f5d0b5'];
const HAIRS = ['#1f2937', '#9ca3af', '#a16207', '#c2410c', '#e5e7eb', '#3f2a1d'];
const ACCENTS = ['#22d3ee', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#60a5fa'];
const STYLES: ScientistAppearance['hairStyle'][] = ['sides', 'tufts', 'wild', 'bun', 'swoop'];
const EYEWEAR: ScientistAppearance['eyewear'][] = ['none', 'glasses', 'goggles', 'monocle'];
const TOOLS: ScientistAppearance['tool'][] = ['clipboard', 'wrench', 'tablet', 'flask', 'none'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function fallbackCharacter(id: string): CharacterDefinition {
  const h = hash(id);
  const at = <T>(list: readonly T[], shift: number): T => list[(h >>> shift) % list.length] as T;
  return {
    kind: 'procedural-scientist',
    appearance: {
      skin: at(SKINS, 0),
      hair: at(HAIRS, 3),
      hairStyle: at(STYLES, 6),
      coat: '#e8edf3',
      accent: at(ACCENTS, 9),
      eyewear: at(EYEWEAR, 12),
      tool: at(TOOLS, 15),
      facialHair: 'none',
      brow: 0,
      // Crown-Top family: smooth or shaved crown, chosen deterministically.
      crown: (h >>> 20) % 2 ? 'stubble' : 'chrome',
    },
  };
}
