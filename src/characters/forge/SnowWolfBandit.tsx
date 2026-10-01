import { useId } from 'react';

/**
 * Snow Wolf Bandit: small dog/chihuahua-like crew member in a black knitted
 * ski mask, with a gold chain and streetwear. Mischievous and competent.
 * (Founder correction: NOT a silver/gray wolf, NOT realistic, NOT giant.)
 * Drawn in a 100 x 120 box, feet at y = 118, centred on x = 50.
 */
export type BanditActivity = 'console' | 'carry' | 'inspect' | 'chaos' | 'watch' | 'idle';

export interface SnowWolfBanditProps {
  /** Snow-white or cream fur. */
  fur?: 'snow' | 'cream' | 'fawn';
  hoodie: string;
  accent?: string;
  headphones?: boolean;
  crown?: boolean;
  activity?: BanditActivity;
  facing?: 1 | -1;
}

const FUR: Record<NonNullable<SnowWolfBanditProps['fur']>, [string, string, string]> = {
  snow: ['#ffffff', '#f1f4f8', '#cfd6df'],
  cream: ['#fff8ec', '#f3e3c8', '#d5bd98'],
  fawn: ['#f7e3c6', '#e3bf8f', '#b98e5d'],
};

export function SnowWolfBandit({
  fur = 'snow',
  hoodie,
  accent = '#a3e635',
  headphones = false,
  crown = false,
  activity = 'idle',
  facing = 1,
}: SnowWolfBanditProps) {
  const uid = useId().replace(/:/g, '');
  const [fHi, fBase, fShade] = FUR[fur];
  const furG = `swb-fur-${uid}`;
  const knit = `swb-knit-${uid}`;
  const hood = `swb-hood-${uid}`;
  const gold = `swb-gold-${uid}`;

  const paw = (cx: number, cy: number) => (
    <g>
      <ellipse cx={cx} cy={cy} rx="5" ry="4.2" fill={`url(#${furG})`} />
      <path
        d={`M${cx - 2} ${cy + 2.4} v1.4 M${cx} ${cy + 2.8} v1.4 M${cx + 2} ${cy + 2.4} v1.4`}
        stroke={fShade}
        strokeWidth="0.7"
      />
    </g>
  );
  const sleeve = (d: string) => (
    <path d={d} stroke={`url(#${hood})`} strokeWidth="9" strokeLinecap="round" fill="none" />
  );

  const arms = (() => {
    switch (activity) {
      case 'console':
        return (
          <g>
            {sleeve('M34 70 Q28 82 36 90')}
            {sleeve('M66 70 Q72 82 64 90')}
            {paw(37, 92)}
            {paw(63, 92)}
          </g>
        );
      case 'carry':
        return (
          <g>
            <g transform="rotate(-4 50 60)">
              <rect x="27" y="44" width="46" height="30" rx="3" fill="#3b2a1a" />
              <rect x="27" y="44" width="46" height="7" rx="2" fill="#4d3824" />
              <rect x="31" y="54" width="38" height="16" rx="1.5" fill="#2a1f14" />
              <text
                x="50"
                y="66"
                textAnchor="middle"
                fontSize="9"
                fontWeight="800"
                fill={accent}
                fontFamily="JetBrains Mono Variable, monospace"
              >
                07
              </text>
              <circle cx="36" cy="49" r="1.6" fill="#22d3ee" />
              <circle cx="41" cy="49" r="1.6" fill="#d946ef" />
            </g>
            {sleeve('M34 72 Q26 66 30 58')}
            {sleeve('M66 72 Q74 66 70 58')}
            {paw(30, 56)}
            {paw(70, 56)}
          </g>
        );
      case 'inspect':
        return (
          <g>
            {sleeve('M34 70 Q28 82 36 90')}
            {sleeve('M66 70 Q78 70 80 58')}
            {paw(37, 92)}
            <g>
              <path d="M82 60 L88 74" stroke="#4b3621" strokeWidth="4" strokeLinecap="round" />
              <circle
                cx="80"
                cy="54"
                r="9"
                fill="rgba(125,211,252,0.22)"
                stroke="#e5e7eb"
                strokeWidth="2.4"
              />
              <path
                d="M75 50 Q78 47 81 48"
                stroke="#ffffff"
                strokeWidth="1.2"
                fill="none"
                opacity="0.8"
              />
            </g>
            {paw(80, 60)}
          </g>
        );
      case 'chaos':
        return (
          <g>
            {sleeve('M34 70 Q22 60 20 48')}
            {sleeve('M66 70 Q74 84 66 92')}
            {paw(20, 46)}
            {paw(65, 94)}
            {/* tangled patch cable */}
            <path
              d="M14 104 C30 80 70 112 60 76 C54 58 30 84 44 98 C56 110 82 96 86 112"
              stroke="#d946ef"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M10 92 C28 110 64 74 88 96"
              stroke="#22d3ee"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
            />
            <g className="vf-spark" fill="#fde047">
              <path d="M88 96 l5 -4 l-2 5 l6 -1 l-6 4 l3 3 l-6 -3 Z" />
              <circle cx="12" cy="104" r="2" />
            </g>
          </g>
        );
      case 'watch':
        return (
          <g>
            {sleeve('M34 70 Q28 82 36 90')}
            {sleeve('M66 70 Q72 60 62 54')}
            {paw(37, 92)}
            {paw(60, 52)}
          </g>
        );
      default:
        return (
          <g>
            {sleeve('M34 70 Q27 82 33 92')}
            {sleeve('M66 70 Q73 82 67 92')}
            {paw(33, 94)}
            {paw(67, 94)}
          </g>
        );
    }
  })();

  return (
    <g transform={facing === -1 ? 'translate(100 0) scale(-1 1)' : undefined}>
      <defs>
        <radialGradient id={furG} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={fHi} />
          <stop offset="0.6" stopColor={fBase} />
          <stop offset="1" stopColor={fShade} />
        </radialGradient>
        <radialGradient id={knit} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#2e3138" />
          <stop offset="0.7" stopColor="#15171c" />
          <stop offset="1" stopColor="#08090c" />
        </radialGradient>
        <linearGradient id={hood} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={hoodie} />
          <stop offset="1" stopColor={hoodie} stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.45" stopColor="#facc15" />
          <stop offset="1" stopColor="#a16207" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="116" rx="22" ry="3.8" fill="rgba(0,0,0,0.45)" />
      {/* curled tail */}
      <path
        d="M70 100 Q90 98 86 82 Q84 74 78 80"
        stroke={`url(#${furG})`}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      {/* legs */}
      <ellipse cx="41" cy="112" rx="6" ry="5" fill={`url(#${furG})`} />
      <ellipse cx="59" cy="112" rx="6" ry="5" fill={`url(#${furG})`} />
      {/* hoodie */}
      <path d="M31 72 Q31 58 50 57 Q69 58 69 72 L72 106 Q50 113 28 106 Z" fill={`url(#${hood})`} />
      <path d="M36 92 Q50 96 64 92 L64 102 Q50 106 36 102 Z" fill="rgba(0,0,0,0.18)" />
      <path
        d="M44 62 L43 74 M56 62 L57 74"
        stroke="#f8fafc"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {activity !== 'carry' && (
        <text
          x="50"
          y="88"
          textAnchor="middle"
          fontSize="10"
          fontWeight="800"
          fill={accent}
          fontFamily="JetBrains Mono Variable, monospace"
          opacity="0.95"
        >
          07
        </text>
      )}
      {/* gold chain with a crown pendant */}
      <path
        d="M38 60 Q50 76 62 60"
        stroke={`url(#${gold})`}
        strokeWidth="2.4"
        fill="none"
        strokeDasharray="2.2 1.1"
        strokeLinecap="round"
      />
      <path d="M45.5 70 L47 66.5 L50 69 L53 66.5 L54.5 70 L54 73 L46 73 Z" fill={`url(#${gold})`} />
      {arms}
      {/* ears through the ski mask */}
      <path d="M33 30 L24 3 L45 22 Z" fill={`url(#${furG})`} />
      <path d="M67 30 L76 3 L55 22 Z" fill={`url(#${furG})`} />
      <path d="M34.5 25 L28.5 9 L41 21 Z" fill="#e8d3bd" />
      <path d="M65.5 25 L71.5 9 L59 21 Z" fill="#e8d3bd" />
      {/* head in a black knitted balaclava */}
      <ellipse cx="50" cy="38" rx="21" ry="19" fill={`url(#${knit})`} />
      <g stroke="rgba(255,255,255,0.07)" strokeWidth="0.9">
        <path d="M36 24 Q34 38 36 52" fill="none" />
        <path d="M43 20 Q41 38 43 56" fill="none" />
        <path d="M50 19 V57" />
        <path d="M57 20 Q59 38 57 56" fill="none" />
        <path d="M64 24 Q66 38 64 52" fill="none" />
      </g>
      <ellipse cx="34" cy="27" rx="5" ry="3" fill="#0b0c10" />
      <ellipse cx="66" cy="27" rx="5" ry="3" fill="#0b0c10" />
      {/* eye opening */}
      <rect x="32" y="30" width="36" height="13" rx="6.5" fill={`url(#${furG})`} />
      <ellipse cx="42.5" cy="36.5" rx="4.4" ry="4.8" fill="#14100c" />
      <ellipse cx="57.5" cy="36.5" rx="4.4" ry="4.8" fill="#14100c" />
      <circle cx="41" cy="34.6" r="1.4" fill="#ffffff" />
      <circle cx="56" cy="34.6" r="1.4" fill="#ffffff" />
      <circle cx="44" cy="38.6" r="0.6" fill="#ffffff" opacity="0.7" />
      <circle cx="59" cy="38.6" r="0.6" fill="#ffffff" opacity="0.7" />
      {/* mouth opening with snout */}
      <ellipse cx="50" cy="49" rx="7.5" ry="5.6" fill={`url(#${furG})`} />
      <path d="M47.2 46 Q50 44.4 52.8 46 Q52 48.4 50 48.6 Q48 48.4 47.2 46 Z" fill="#111" />
      <path
        d="M46.8 51 Q50 53.4 53.2 51"
        stroke="#3b2a20"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      {headphones && (
        <g>
          <path
            d="M28 40 Q28 13 50 13 Q72 13 72 40"
            stroke="#1e1b4b"
            strokeWidth="3.4"
            fill="none"
          />
          <rect x="22.5" y="34" width="9" height="13" rx="4" fill="#7c3aed" />
          <rect x="68.5" y="34" width="9" height="13" rx="4" fill="#7c3aed" />
          <rect x="24.5" y="37" width="3" height="7" rx="1.5" fill="#22d3ee" />
          <rect x="72.5" y="37" width="3" height="7" rx="1.5" fill="#22d3ee" />
        </g>
      )}
      {crown && (
        <g>
          <path d="M40 21 L42 11 L46.5 17 L50 9 L53.5 17 L58 11 L60 21 Z" fill={`url(#${gold})`} />
          <circle cx="50" cy="15.5" r="1.5" fill="#a3e635" />
        </g>
      )}
    </g>
  );
}
