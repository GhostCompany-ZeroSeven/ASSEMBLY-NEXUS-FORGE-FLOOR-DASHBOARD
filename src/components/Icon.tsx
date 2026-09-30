/** Small inline icon set (stroke icons, 24×24). No icon font or external requests. */
const PATHS: Record<string, string> = {
  command: 'M3 12h4l3-8 4 16 3-8h4',
  floor: 'M3 21V9l9-6 9 6v12M9 21v-6h6v6',
  mission: 'M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z',
  workers:
    'M16 21v-2a4 4 0 00-8 0v2M12 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.9M2 21v-2a4 4 0 013-3.9',
  gate: 'M4 21V5a2 2 0 012-2h12a2 2 0 012 2v16M4 21h16M12 3v18M9 12h1M14 12h1',
  alert: 'M12 3L2 21h20L12 3zM12 10v5M12 18h.01',
  activity: 'M4 6h16M4 12h10M4 18h13',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4l13 8-13 8z',
  step: 'M5 4l10 8-10 8zM19 5v14',
  reset: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  artifact: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6',
  link: 'M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  hold: 'M12 21a9 9 0 100-18 9 9 0 000 18zM10 9v6M14 9v6',
  back: 'M15 18l-6-6 6-6',
  // Drawn arrow: the bundled fonts do not include U+2192, so never use the character.
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7h.01',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 118 0v4',
  wolf: 'M4 4l4 5h8l4-5v8l-3 4-5 4-5-4-3-4z',
  health: 'M3 12h4l2-5 4 10 2-5h6',
  // Worker state glyphs (drawn, not font characters, so they render identically everywhere).
  'state-idle': 'M5 7h6l-6 7h6M13 13h5l-5 5h5',
  'state-planning': 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  'state-working': 'M4 20l9-9M11 4l6 6-3 3-6-6zM15 3l6 6',
  'state-waiting': 'M6 12h.01M12 12h.01M18 12h.01',
  'state-blocked': 'M12 5v9M12 19h.01',
  'state-reviewing': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  'state-certifying': 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8l5.5-.8z',
  'state-complete': 'M4 12l5 5L20 6',
  'state-failed': 'M6 6l12 12M18 6L6 18',
  'state-stopped': 'M7 7h10v10H7z',
  'state-unknown': 'M9 9a3 3 0 115 2c-1 .8-2 1.4-2 3M12 18h.01',
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
