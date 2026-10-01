import type { CrownTopProps } from '@/characters/forge/CrownTopScientist';
import type { SnowWolfBanditProps } from '@/characters/forge/SnowWolfBandit';

/** Scene coordinate system of the visual Forge Floor. */
export const SCENE_W = 1600;
export const SCENE_H = 900;

/* ------------------------------ stations ------------------------------ */

type ScientistStation = {
  id: string;
  kind: 'scientist';
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
type WispStation = { id: string; kind: 'wisp'; x: number; y: number; s: number };
export type Station = ScientistStation | BanditStation | WispStation;

/**
 * Character placement. Half of the scientists are TRUE CHROME DOMES, half are
 * FRANTICALLY SHAVED (stubble dots) with side/back hair kept. Bandits differ in
 * fur, hoodie, accessories and activity.
 */
export const STATIONS: readonly Station[] = [
  {
    id: 'sci-1',
    kind: 'scientist',
    x: 410,
    y: 410,
    s: 1.25,
    look: {
      scalp: 'chrome',
      skin: 'light',
      hair: '#cfd6df',
      glasses: 'round',
      brow: 'raised',
      pose: 'type',
    },
  },
  {
    id: 'sci-2',
    kind: 'scientist',
    x: 552,
    y: 416,
    s: 1.22,
    look: {
      scalp: 'stubble',
      skin: 'tan',
      hair: '#3b2f2a',
      glasses: 'square',
      brow: 'furrowed',
      pose: 'clipboard',
    },
  },
  {
    id: 'sci-3',
    kind: 'scientist',
    x: 900,
    y: 410,
    s: 1.25,
    look: {
      scalp: 'chrome',
      skin: 'medium',
      hair: '#f1f5f9',
      brow: 'flat',
      pose: 'beaker',
      older: true,
    },
  },
  {
    id: 'sci-4',
    kind: 'scientist',
    x: 1042,
    y: 416,
    s: 1.22,
    look: {
      scalp: 'stubble',
      skin: 'light',
      hair: '#6b4f3a',
      glasses: 'round',
      brow: 'raised',
      pose: 'point',
      facing: -1,
    },
  },
  {
    id: 'sci-5',
    kind: 'scientist',
    x: 186,
    y: 598,
    s: 1.45,
    look: { scalp: 'stubble', skin: 'deep', hair: '#1f1a17', brow: 'flat', pose: 'think' },
  },
  {
    id: 'sci-6',
    kind: 'scientist',
    x: 1236,
    y: 592,
    s: 1.45,
    look: {
      scalp: 'chrome',
      skin: 'medium',
      hair: '#9ca3af',
      glasses: 'square',
      brow: 'furrowed',
      pose: 'clipboard',
      older: true,
      facing: -1,
    },
  },
  {
    id: 'ban-1',
    kind: 'bandit',
    x: 96,
    y: 514,
    s: 1.3,
    look: { fur: 'snow', hoodie: '#5b21b6', headphones: true, activity: 'console' },
  },
  {
    id: 'ban-2',
    kind: 'bandit',
    x: 612,
    y: 636,
    s: 1.35,
    look: { fur: 'cream', hoodie: '#18181b', crown: true, activity: 'carry', accent: '#22d3ee' },
  },
  {
    id: 'ban-3',
    kind: 'bandit',
    x: 872,
    y: 650,
    s: 1.35,
    look: { fur: 'fawn', hoodie: '#0e7490', activity: 'inspect' },
  },
  {
    id: 'ban-4',
    kind: 'bandit',
    x: 292,
    y: 440,
    s: 1.15,
    look: { fur: 'snow', hoodie: '#a21caf', activity: 'watch', facing: -1 },
  },
  {
    id: 'ban-5',
    kind: 'bandit',
    x: 1360,
    y: 596,
    s: 1.3,
    look: {
      fur: 'cream',
      hoodie: '#3f6212',
      headphones: true,
      activity: 'chaos',
      accent: '#f0abfc',
    },
  },
  { id: 'wisp-1', kind: 'wisp', x: 888, y: 196, s: 0.92 },
];

/** Hotspot rectangle of a station, in scene coordinates. */
export function stationBox(st: Station): { x: number; y: number; w: number; h: number } {
  const [w, h] =
    st.kind === 'scientist' ? [100, 150] : st.kind === 'bandit' ? [100, 120] : [120, 140];
  return { x: st.x, y: st.y, w: w * st.s, h: h * st.s };
}
