import type { BabyGhostProps } from '@/characters/forge/BabyGhost';
import type { CrownTopProps } from '@/characters/forge/CrownTopScientist';
import type { SnowWolfBanditProps } from '@/characters/forge/SnowWolfBandit';

/** Scene coordinate system of the visual Forge Floor. */
export const SCENE_W = 1600;
export const SCENE_H = 900;

/* ------------------------------ stations ------------------------------ */

/**
 * Role/station label of a Crown-Top desk (Phase 11, Founder decision): it
 * names the kind of work at the station. It confers no worker or Associate
 * identity, no authority and no runtime presence.
 */
export type StationRole =
  'build' | 'test' | 'review' | 'certify' | 'research' | 'systems' | 'analysis' | 'operations';

type ScientistStation = {
  id: string;
  kind: 'scientist';
  role: StationRole;
  x: number;
  y: number;
  s: number;
  look: CrownTopProps;
};
type BanditStation = {
  id: string;
  kind: 'bandit';
  x: number;
  y: number;
  s: number;
  look: SnowWolfBanditProps;
};
type WispStation = {
  id: string;
  kind: 'wisp';
  x: number;
  y: number;
  s: number;
  look: Pick<BabyGhostProps, 'pose' | 'mark'>;
};
export type Station = ScientistStation | BanditStation | WispStation;

/**
 * Character placement: the principal ensemble.
 *
 * - EIGHT Founder-approved Crown-Top scientist assets, retaining their
 *   individual hair, eyewear, pose, expression and tool variation.
 * - EIGHT Founder-approved Snow Wolf Crew assets, one per canonical persona.
 * - Two small blue 07 Ghost Sprites, explicitly distinct from Baby Ghost.
 *
 * Phase 11: no visual station is bound to a factual worker record. Crown-Top
 * desks carry ROLE/STATION labels; crew and sprites are decorative only.
 */
export const STATIONS: readonly Station[] = [
  // Back row, at the desks.
  {
    id: 'sci-1',
    kind: 'scientist',
    role: 'build',
    x: 430,
    y: 424,
    s: 1.05,
    look: {
      scalp: 'chrome',
      skin: 'light',
      hair: '#e5e7eb',
      glasses: 'round',
      brow: 'raised',
      pose: 'type',
      facial: 'mustache',
    },
  },
  {
    id: 'sci-2',
    kind: 'scientist',
    role: 'analysis',
    x: 580,
    y: 428,
    s: 1.05,
    look: {
      scalp: 'stubble',
      skin: 'tan',
      hair: '#57534e',
      glasses: 'square',
      brow: 'furrowed',
      pose: 'lens',
      facial: 'beard',
    },
  },
  {
    id: 'sci-3',
    kind: 'scientist',
    role: 'test',
    x: 1000,
    y: 424,
    s: 1.05,
    look: {
      scalp: 'chrome',
      skin: 'medium',
      hair: '#f1f5f9',
      brow: 'flat',
      pose: 'beaker',
      goggles: true,
      facial: 'goatee',
    },
  },
  {
    id: 'sci-4',
    kind: 'scientist',
    role: 'research',
    x: 1100,
    y: 460,
    s: 0.94,
    look: {
      scalp: 'stubble',
      skin: 'light',
      hair: '#a8a29e',
      glasses: 'round',
      brow: 'raised',
      pose: 'point',
      facing: -1,
    },
  },
  // Front row.
  {
    id: 'sci-5',
    kind: 'scientist',
    role: 'certify',
    x: 150,
    y: 620,
    s: 1.24,
    look: {
      scalp: 'stubble',
      skin: 'deep',
      hair: '#d6d3d1',
      brow: 'flat',
      pose: 'think',
      facial: 'beard',
    },
  },
  {
    id: 'sci-6',
    kind: 'scientist',
    role: 'review',
    x: 1280,
    y: 620,
    s: 1.24,
    look: {
      scalp: 'chrome',
      skin: 'medium',
      hair: '#9ca3af',
      glasses: 'square',
      brow: 'furrowed',
      pose: 'clipboard',
      facial: 'mustache',
      facing: -1,
    },
  },
  {
    id: 'sci-7',
    kind: 'scientist',
    role: 'operations',
    x: 460,
    y: 620,
    s: 1.22,
    look: {
      scalp: 'stubble',
      skin: 'medium',
      hair: '#1c1917',
      brow: 'raised',
      pose: 'tablet',
      generation: 'young',
    },
  },
  {
    id: 'sci-8',
    kind: 'scientist',
    role: 'systems',
    x: 1080,
    y: 620,
    s: 1.22,
    look: {
      scalp: 'chrome',
      skin: 'deep',
      hair: '#e7e5e4',
      glasses: 'round',
      brow: 'flat',
      pose: 'solder',
      goggles: true,
      facial: 'beard',
    },
  },
  // Snow Wolf Crew: role personas (bindable).
  { id: 'ban-1', kind: 'bandit', x: 54, y: 536, s: 1.02, look: { persona: 'coder', fur: 'snow' } },
  {
    id: 'ban-2',
    kind: 'bandit',
    x: 610,
    y: 676,
    s: 0.98,
    look: { persona: 'hauler', fur: 'cream', accent: '#22d3ee' },
  },
  {
    id: 'ban-3',
    kind: 'bandit',
    x: 1510,
    y: 720,
    s: 0.78,
    look: { persona: 'lookout', fur: 'fawn', facing: -1 },
  },
  {
    id: 'ban-4',
    kind: 'bandit',
    x: 758,
    y: 722,
    s: 0.72,
    look: { persona: 'snack-guard', fur: 'cream', accent: '#facc15' },
  },
  // Snow Wolf Crew: named personas (never bound to data).
  {
    id: 'ban-5',
    kind: 'bandit',
    x: 900,
    y: 684,
    s: 1.05,
    look: { persona: 'boxer', fur: 'fawn', accent: '#facc15' },
  },
  {
    id: 'ban-6',
    kind: 'bandit',
    x: 300,
    y: 470,
    s: 0.94,
    look: { persona: 'dj', fur: 'snow', accent: '#22d3ee' },
  },
  {
    id: 'ban-7',
    kind: 'bandit',
    x: 1430,
    y: 640,
    s: 1.0,
    look: { persona: 'wild-paw', fur: 'cream', accent: '#f0abfc' },
  },
  {
    id: 'ban-8',
    kind: 'bandit',
    x: 326,
    y: 690,
    s: 0.94,
    look: { persona: 'chuy', fur: 'snow', accent: '#facc15' },
  },
  // Small blue 07 Ghost Sprites (not Baby Ghost).
  { id: 'wisp-1', kind: 'wisp', x: 1060, y: 214, s: 0.66, look: { pose: 'point' } },
  { id: 'wisp-2', kind: 'wisp', x: 818, y: 648, s: 0.5, look: { pose: 'bone', mark: false } },
];

/** Hotspot rectangle of a station, in scene coordinates. */
export function stationBox(st: Station): { x: number; y: number; w: number; h: number } {
  const [w, h] =
    st.kind === 'scientist' ? [100, 150] : st.kind === 'bandit' ? [100, 120] : [120, 140];
  return { x: st.x, y: st.y, w: w * st.s, h: h * st.s };
}
