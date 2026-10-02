/**
 * Founder-approved decorative imagery preserved under public/assets.
 * These records are presentation-only: they contain no worker, Associate,
 * authority, runtime, certification or deployment binding.
 */
export type FounderCharacterAsset = Readonly<{
  identity: string;
  src: string;
  persona?: string;
}>;

const ROOT = '/assets/founder-universe';

export const BABY_GHOST_FOCAL_ASSET =
  `${ROOT}/baby-ghost/baby-ghost-sacred-cyber-skull.webp` as const;

export const BABY_GHOST_CHARACTER_ASSET = `${ROOT}/baby-ghost/baby-ghost-transparent.webp` as const;

export const CROWN_TOP_STATION_ASSETS: Readonly<Record<string, FounderCharacterAsset>> = {
  'sci-1': {
    identity: 'CROWN_TOP_01',
    src: `${ROOT}/crown-top/crown-top-scientist-01-transparent.webp`,
  },
  'sci-2': {
    identity: 'CROWN_TOP_02',
    src: `${ROOT}/crown-top/crown-top-scientist-02-transparent.webp`,
  },
  'sci-3': {
    identity: 'CROWN_TOP_03',
    src: `${ROOT}/crown-top/crown-top-scientist-03-transparent.webp`,
  },
  'sci-4': {
    identity: 'CROWN_TOP_04',
    src: `${ROOT}/crown-top/crown-top-scientist-04-transparent.webp`,
  },
  'sci-5': {
    identity: 'CROWN_TOP_05',
    src: `${ROOT}/crown-top/crown-top-scientist-05-transparent.webp`,
  },
  'sci-6': {
    identity: 'CROWN_TOP_06',
    src: `${ROOT}/crown-top/crown-top-scientist-06-transparent.webp`,
  },
  'sci-7': {
    identity: 'CROWN_TOP_07',
    src: `${ROOT}/crown-top/crown-top-scientist-07-shades-ii-transparent.webp`,
  },
  'sci-8': {
    identity: 'CROWN_TOP_08',
    src: `${ROOT}/crown-top/crown-top-scientist-08-transparent.webp`,
  },
};

export const SNOW_WOLF_STATION_ASSETS: Readonly<Record<string, FounderCharacterAsset>> = {
  'ban-1': {
    identity: 'CODER',
    persona: 'coder',
    src: `${ROOT}/snow-wolf/snow-wolf-coder-transparent.webp`,
  },
  'ban-2': {
    identity: 'HAULER',
    persona: 'hauler',
    src: `${ROOT}/snow-wolf/snow-wolf-hauler-transparent.webp`,
  },
  'ban-3': {
    identity: 'LOOKOUT',
    persona: 'lookout',
    src: `${ROOT}/snow-wolf/snow-wolf-lookout-transparent.webp`,
  },
  'ban-4': {
    identity: 'SNACK_GUARD',
    persona: 'snack-guard',
    src: `${ROOT}/snow-wolf/snow-wolf-snack-guard-transparent.webp`,
  },
  'ban-5': {
    identity: 'BOXER',
    persona: 'boxer',
    src: `${ROOT}/snow-wolf/snow-wolf-boxer-transparent.webp`,
  },
  'ban-6': {
    identity: 'DJ',
    persona: 'dj',
    src: `${ROOT}/snow-wolf/snow-wolf-dj-transparent.webp`,
  },
  'ban-7': {
    identity: 'WILD_PAW',
    persona: 'wild-paw',
    src: `${ROOT}/snow-wolf/snow-wolf-wild-paw-transparent.webp`,
  },
  'ban-8': {
    identity: 'CHUY',
    persona: 'chuy',
    src: `${ROOT}/snow-wolf/snow-wolf-chuy-transparent.webp`,
  },
};

export const INTEGRATED_FOUNDER_ASSET_PATHS = [
  BABY_GHOST_FOCAL_ASSET,
  BABY_GHOST_CHARACTER_ASSET,
  ...Object.values(SNOW_WOLF_STATION_ASSETS).map((asset) => asset.src),
  ...Object.values(CROWN_TOP_STATION_ASSETS).map((asset) => asset.src),
] as const;
