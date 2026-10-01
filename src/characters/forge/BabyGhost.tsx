import { useId } from 'react';

/**
 * BABY GHOST: the Forge Floor's tiny digital laboratory creature (display
 * nickname; it replaces the Phase 9 "ByteWisp" treatment). Small, translucent,
 * holographic, cute but mischievous: visible internal circuitry, glitch
 * particles, neon cyan / lime / purple / magenta energy and an occasional 07.
 * Technology, not supernatural horror. Decorative only: it is not a runtime.
 * Drawn in a 120 x 140 box.
 */
export type BabyGhostPose = 'float' | 'point' | 'peek' | 'bone';
export type BabyGhostMood = 'calm' | 'cheer' | 'alarm';

export interface BabyGhostProps {
  mood?: BabyGhostMood;
  pose?: BabyGhostPose;
  /** Show the 07 mark on the body. */
  mark?: boolean;
}

export function BabyGhost({ mood = 'calm', pose = 'float', mark = true }: BabyGhostProps) {
  const uid = useId().replace(/:/g, '');
  const body = `bg-body-${uid}`;
  const glow = `bg-glow-${uid}`;
  const edge = mood === 'alarm' ? '#fb7185' : mood === 'cheer' ? '#a3e635' : '#67e8f9';
  const nub = (d: string) => (
    <path
      d={d}
      stroke={`url(#${body})`}
      strokeWidth="9"
      strokeLinecap="round"
      fill="none"
      opacity="0.95"
    />
  );
  return (
    <g className="vf-wisp" data-character="baby-ghost" data-pose={pose} data-mood={mood}>
      <defs>
        <radialGradient id={body} cx="0.45" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#ecfeff" stopOpacity="0.75" />
          <stop offset="0.35" stopColor="#67e8f9" stopOpacity="0.55" />
          <stop offset="0.75" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="1" stopColor="#d946ef" stopOpacity="0.12" />
        </radialGradient>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse cx="60" cy="134" rx="22" ry="3.6" fill={edge} opacity="0.2" />
      {/* arms (little nubs) behind the body */}
      {pose === 'point' && nub('M88 76 Q102 66 110 54')}
      {pose === 'bone' && nub('M34 84 Q42 94 52 92')}
      {pose === 'bone' && nub('M86 84 Q78 94 68 92')}
      {pose !== 'peek' && pose !== 'bone' && nub('M32 82 Q22 88 20 98')}
      {pose === 'float' && nub('M88 82 Q98 88 100 98')}
      {/* round baby body with a wavy tail */}
      <g filter={`url(#${glow})`}>
        <path
          d="M24 66 Q24 16 60 16 Q96 16 96 66 L96 104 Q90 98 84 106 Q78 116 70 106 Q64 98 58 108 Q50 118 44 106 Q38 96 30 108 Q24 114 24 104 Z"
          fill={`url(#${body})`}
          stroke={edge}
          strokeWidth="1.8"
        />
      </g>
      {/* internal circuitry */}
      <g stroke="#a3e635" strokeWidth="1" fill="none" opacity="0.8" className="vf-trace">
        <path d="M38 94 V80 H48 V72" />
        <path d="M82 96 V84 H72 V76" />
        <path d="M60 102 V90" />
      </g>
      <g fill="#ecfccb">
        <circle cx="48" cy="72" r="1.8" />
        <circle cx="72" cy="76" r="1.8" />
        <circle cx="60" cy="90" r="1.8" />
      </g>
      {/* big expressive eyes */}
      {mood === 'cheer' ? (
        <g stroke="#ecfeff" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M40 50 Q46 42 52 50" />
          <path d="M68 50 Q74 42 80 50" />
        </g>
      ) : (
        <g>
          <ellipse cx="46" cy="48" rx="8" ry={mood === 'alarm' ? 10 : 9} fill="#0b1226" />
          <ellipse cx="74" cy="48" rx="8" ry={mood === 'alarm' ? 10 : 9} fill="#0b1226" />
          <circle cx="43.5" cy="44.5" r="3" fill="#ecfeff" />
          <circle cx="71.5" cy="44.5" r="3" fill="#ecfeff" />
          <circle cx="48.5" cy="51.5" r="1.4" fill="#67e8f9" />
          <circle cx="76.5" cy="51.5" r="1.4" fill="#67e8f9" />
        </g>
      )}
      {/* mischievous grin (one corner up), or a small "o" when alarmed */}
      {mood === 'alarm' ? (
        <ellipse cx="60" cy="64" rx="4" ry="4.6" fill="#0b1226" opacity="0.85" />
      ) : (
        <path
          d="M52 62 Q60 68 69 59"
          stroke="#0b1226"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {mark && (
        <text
          x="60"
          y="86"
          textAnchor="middle"
          fontSize="10"
          fontWeight="800"
          fill="#ecfeff"
          opacity="0.7"
          fontFamily="JetBrains Mono Variable, monospace"
        >
          07
        </text>
      )}
      {/* held milk bone (the one everyone is looking for) */}
      {pose === 'bone' && (
        <g transform="translate(60 94) rotate(-8)">
          <rect x="-13" y="-3.2" width="26" height="6.4" rx="2" fill="#f5e6c8" />
          <circle cx="-13" cy="-3.4" r="3.6" fill="#f5e6c8" />
          <circle cx="-13" cy="3.4" r="3.6" fill="#f5e6c8" />
          <circle cx="13" cy="-3.4" r="3.6" fill="#f5e6c8" />
          <circle cx="13" cy="3.4" r="3.6" fill="#f5e6c8" />
        </g>
      )}
      {/* glitch particles */}
      <g className="vf-glitch">
        <rect x="12" y="58" width="9" height="2.4" fill="#d946ef" opacity="0.7" />
        <rect x="100" y="80" width="10" height="2" fill="#22d3ee" opacity="0.7" />
        <rect x="104" y="40" width="4" height="4" fill="#a3e635" opacity="0.8" />
        <rect x="14" y="30" width="3" height="3" fill="#67e8f9" opacity="0.8" />
        <rect x="96" y="22" width="3" height="3" fill="#f0abfc" opacity="0.8" />
      </g>
    </g>
  );
}
