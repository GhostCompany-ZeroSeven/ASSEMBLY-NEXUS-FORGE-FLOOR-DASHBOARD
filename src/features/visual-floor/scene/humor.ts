/**
 * Environmental humor for the visual Forge Floor: small set-dressing text only
 * (posters, stickers, labels), never over the interface. Every phrase used in
 * the scene must be from this Founder-approved pool; a test enforces it.
 */
export const APPROVED_HUMOR = [
  'PAWFECT.',
  "TODAY'S MISSION: WHO ATE THE LAST MILK BONE?",
  'NEVER CHASE. ALWAYS CHEW.',
  'BONE APPÉTIT.',
  'BORN TO CHEW. BUILT TO WIN.',
  'A MILK BONE A DAY KEEPS THE HUNGER AWAY.',
  'LET IT RIDE. WIN OR LOSE, WE STILL HOWL.',
  'FALLS HAPPEN. LEGENDS GET UP.',
  'PAW SQUAD. HIGH RISK. NO APOLOGIES.',
  "IF YOU'RE SCARED, GO TO CHURCH.",
] as const;

/** The Crown-Top lab banner: playful, not presented as scientific law. */
export const BOLDNESS_BANNER = {
  title: 'WITH BOLDNESS COMES INTELLIGENCE.',
  subline: 'Results may vary.',
  credit: '— Crown-Top Research Division',
} as const;

export type HumorPhrase = (typeof APPROVED_HUMOR)[number];
