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
 * - EIGHT Crown-Top scientists: four natural chrome domes and four shaved
 *   tops with stubble, all keeping side/back hair. Seven veterans; `sci-7` is
 *   the younger-generation Crown-Top.
 * - EIGHT Snow Wolf Crew members, each a different persona and job, each in a
 *   personal outfit with the A•N uniform vest over it.
 * - Two Baby Ghost stations (plus one decorative peeker in the scene).
 *
 * Phase 11: no visual station is bound to a factual worker record. Crown-Top
 * desks carry ROLE/STATION labels; crew and Baby Ghosts are characters only.
 */
export const STATIONS: readonly Station[] = [
  // Back row, at the desks.
  {
    id: 'sci-1',
    kind: 'scientist',
    role: 'build',
    x: 410,
    y: 416,
    s: 1.2,
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
    x: 552,
    y: 420,
    s: 1.18,
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
    x: 900,
    y: 416,
    s: 1.2,
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
    x: 1042,
    y: 420,
    s: 1.18,
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
    x: 172,
    y: 602,
    s: 1.4,
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
    x: 1236,
    y: 596,
    s: 1.4,
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
    x: 452,
    y: 604,
    s: 1.38,
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
    x: 1078,
    y: 604,
    s: 1.38,
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
  { id: 'ban-1', kind: 'bandit', x: 92, y: 520, s: 1.25, look: { persona: 'coder', fur: 'snow' } },
  {
    id: 'ban-2',
    kind: 'bandit',
    x: 604,
    y: 642,
    s: 1.28,
    look: { persona: 'hauler', fur: 'cream', accent: '#22d3ee' },
  },
  {
    id: 'ban-3',
    kind: 'bandit',
    x: 1494,
    y: 690,
    s: 0.92,
    look: { persona: 'lookout', fur: 'fawn', facing: -1 },
  },
  {
    id: 'ban-4',
    kind: 'bandit',
    x: 770,
    y: 700,
    s: 0.86,
    look: { persona: 'snack-guard', fur: 'cream', accent: '#facc15' },
  },
  // Snow Wolf Crew: named personas (never bound to data).
  {
    id: 'ban-5',
    kind: 'bandit',
    x: 880,
    y: 650,
    s: 1.3,
    look: { persona: 'boxer', fur: 'fawn', accent: '#facc15' },
  },
  {
    id: 'ban-6',
    kind: 'bandit',
    x: 290,
    y: 446,
    s: 1.12,
    look: { persona: 'dj', fur: 'snow', accent: '#22d3ee' },
  },
  {
    id: 'ban-7',
    kind: 'bandit',
    x: 1366,
    y: 600,
    s: 1.26,
    look: { persona: 'wild-paw', fur: 'cream', accent: '#f0abfc' },
  },
  {
    id: 'ban-8',
    kind: 'bandit',
    x: 318,
    y: 664,
    s: 1.14,
    look: { persona: 'chuy', fur: 'snow', accent: '#facc15' },
  },
  // Baby Ghosts.
  { id: 'wisp-1', kind: 'wisp', x: 896, y: 188, s: 0.86, look: { pose: 'point' } },
  { id: 'wisp-2', kind: 'wisp', x: 818, y: 648, s: 0.5, look: { pose: 'bone', mark: false } },
];

/** Hotspot rectangle of a station, in scene coordinates. */
export function stationBox(st: Station): { x: number; y: number; w: number; h: number } {
  const [w, h] =
    st.kind === 'scientist' ? [100, 150] : st.kind === 'bandit' ? [100, 120] : [120, 140];
  return { x: st.x, y: st.y, w: w * st.s, h: h * st.s };
}
