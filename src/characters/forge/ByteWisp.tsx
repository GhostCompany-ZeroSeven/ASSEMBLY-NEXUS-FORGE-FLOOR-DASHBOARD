import { useId } from 'react';

/**
 * ByteWisp: a translucent, holographic ghost of the Assembly Nexus technology
 * system. Glowing circuitry runs inside its body; edges are neon; a digital
 * glitch slice and the 07 mark identify it. Not Halloween decoration.
 * Drawn in a 120 x 140 box.
 */
export function ByteWisp({
  mood = 'calm',
  scale = 1,
}: {
  mood?: 'calm' | 'cheer' | 'alarm';
  scale?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const body = `bw-body-${uid}`;
  const glow = `bw-glow-${uid}`;
  const edge = mood === 'alarm' ? '#f43f5e' : mood === 'cheer' ? '#a3e635' : '#22d3ee';
  return (
    <g transform={scale !== 1 ? `scale(${scale})` : undefined} className="vf-wisp">
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#67e8f9" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#8b5cf6" stopOpacity="0.32" />
          <stop offset="1" stopColor="#d946ef" stopOpacity="0.08" />
        </linearGradient>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse cx="60" cy="134" rx="26" ry="4" fill={edge} opacity="0.18" />
      <g filter={`url(#${glow})`}>
        <path
          d="M20 72 Q20 10 60 10 Q100 10 100 72 L100 118 Q92 110 84 120 Q76 130 68 118 Q60 108 52 120 Q44 130 36 118 Q28 108 20 120 Z"
          fill={`url(#${body})`}
          stroke={edge}
          strokeWidth="1.8"
        />
      </g>
      {/* internal circuitry */}
      <g stroke="#a3e635" strokeWidth="1.1" fill="none" opacity="0.85" className="vf-trace">
        <path d="M34 96 V78 H48 V64" />
        <path d="M86 98 V84 H72 V70" />
        <path d="M60 104 V88" />
        <path d="M30 60 H42 L48 54" />
        <path d="M90 58 H78 L72 52" />
      </g>
      <g fill="#ecfccb">
        <circle cx="48" cy="64" r="2" />
        <circle cx="72" cy="70" r="2" />
        <circle cx="60" cy="88" r="2" />
        <circle cx="48" cy="54" r="1.6" />
        <circle cx="72" cy="52" r="1.6" />
      </g>
      {/* face */}
      {mood === 'cheer' ? (
        <g stroke="#ecfeff" strokeWidth="2.6" fill="none" strokeLinecap="round">
          <path d="M42 46 Q47 40 52 46" />
          <path d="M68 46 Q73 40 78 46" />
        </g>
      ) : (
        <g fill="#ecfeff">
          <ellipse cx="47" cy="44" rx="5" ry={mood === 'alarm' ? 7 : 6} />
          <ellipse cx="73" cy="44" rx="5" ry={mood === 'alarm' ? 7 : 6} />
        </g>
      )}
      <ellipse
        cx="60"
        cy="58"
        rx={mood === 'alarm' ? 5 : 3.4}
        ry={mood === 'alarm' ? 4.4 : 2.2}
        fill="#0e7490"
        opacity="0.8"
      />
      <text
        x="60"
        y="82"
        textAnchor="middle"
        fontSize="12"
        fontWeight="800"
        fill="#ecfeff"
        opacity="0.75"
        fontFamily="JetBrains Mono Variable, monospace"
      >
        07
      </text>
      {/* glitch slices */}
      <g className="vf-glitch">
        <rect x="16" y="66" width="22" height="2.4" fill="#d946ef" opacity="0.6" />
        <rect x="84" y="88" width="20" height="2" fill="#22d3ee" opacity="0.6" />
      </g>
    </g>
  );
}
