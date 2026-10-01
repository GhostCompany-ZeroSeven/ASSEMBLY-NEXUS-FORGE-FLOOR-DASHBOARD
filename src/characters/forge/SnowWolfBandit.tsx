import { useId } from 'react';

/**
 * Snow Wolf Crew member: a SMALL DOG / CHIHUAHUA bandit (never a literal wolf:
 * no silver, gray, giant or realistic wolves). Black knitted ski mask,
 * expressive eyes, gold chain, comedic bandit energy.
 *
 * Wardrobe rule (Founder): the crew member's PERSONAL outfit (hoodie colour,
 * sleeves, hood, persona accessories) stays visible; the Assembly Nexus
 * uniform is an open vest worn OVER it, with A•N, paw and 07 marks.
 *
 * Each persona has its own look and job, so the crew never reads as clones.
 * Drawn in a 100 x 120 box, feet at y = 118, centred on x = 50.
 */
export type CrewPersona =
  'boxer' | 'dj' | 'wild-paw' | 'chuy' | 'coder' | 'hauler' | 'lookout' | 'snack-guard';

/** Kept for the avatar wrapper (WolfFigure): the arm pose only. */
export type BanditActivity = 'console' | 'carry' | 'inspect' | 'chaos' | 'watch' | 'idle';

export interface SnowWolfBanditProps {
  persona: CrewPersona;
  fur?: 'snow' | 'cream' | 'fawn';
  /** Personal outfit colour (hoodie). Overrides the persona default. */
  outfit?: string;
  /** A•N uniform layer colour (navy / charcoal / black / dark blue). */
  uniform?: string;
  accent?: string;
  /** Overrides the persona's arm pose (used by the small avatar). */
  activity?: BanditActivity;
  facing?: 1 | -1;
}

type Pose = BanditActivity | 'guard' | 'crossed' | 'walkie' | 'hug';

interface PersonaLook {
  outfit: string;
  uniform: string;
  pose: Pose;
  headphones?: boolean;
  crown?: boolean;
  goggles?: boolean;
  tattoo?: boolean;
  doubleChain?: boolean;
}

const PERSONA: Record<CrewPersona, PersonaLook> = {
  boxer: { outfit: '#dc2626', uniform: '#1e2a4a', pose: 'guard' },
  dj: { outfit: '#6d28d9', uniform: '#262a33', pose: 'console', headphones: true, tattoo: true },
  'wild-paw': { outfit: '#4d7c0f', uniform: '#0b0d12', pose: 'chaos', goggles: true, tattoo: true },
  chuy: { outfit: '#18181b', uniform: '#172554', pose: 'crossed', crown: true, doubleChain: true },
  coder: { outfit: '#0e7490', uniform: '#1e2a4a', pose: 'console' },
  hauler: { outfit: '#c2410c', uniform: '#262a33', pose: 'carry', tattoo: true },
  lookout: { outfit: '#be185d', uniform: '#0b0d12', pose: 'walkie' },
  'snack-guard': { outfit: '#ca8a04', uniform: '#172554', pose: 'hug' },
};

const FUR: Record<NonNullable<SnowWolfBanditProps['fur']>, [string, string, string]> = {
  snow: ['#ffffff', '#f1f4f8', '#cfd6df'],
  cream: ['#fff8ec', '#f3e3c8', '#d5bd98'],
  fawn: ['#f7e3c6', '#e3bf8f', '#b98e5d'],
};

const MONO = 'JetBrains Mono Variable, monospace';

export function SnowWolfBandit({
  persona,
  fur = 'snow',
  outfit,
  uniform,
  accent = '#a3e635',
  activity,
  facing = 1,
}: SnowWolfBanditProps) {
  const uid = useId().replace(/:/g, '');
  const p = PERSONA[persona];
  const top = outfit ?? p.outfit;
  const vest = uniform ?? p.uniform;
  const pose: Pose = activity ?? p.pose;
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
  /** Personal-outfit sleeve; tattooed personas roll it up to show a band tattoo. */
  const sleeve = (d: string) => (
    <g>
      <path
        d={d}
        pathLength={100}
        stroke={`url(#${hood})`}
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      {p.tattoo && (
        <g>
          <path
            d={d}
            pathLength={100}
            stroke={`url(#${furG})`}
            strokeWidth="7"
            strokeDasharray="0 58 42"
            fill="none"
          />
          <path
            d={d}
            pathLength={100}
            stroke="#1e1b4b"
            strokeWidth="7"
            strokeDasharray="0 72 6 22"
            fill="none"
            opacity="0.85"
            data-tattoo="band"
          />
        </g>
      )}
    </g>
  );

  const bone = (x: number, y: number, s = 1, rot = 0) => (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <rect x="-14" y="-3.4" width="28" height="6.8" rx="2" fill="#f5e6c8" />
      {[
        [-14, -3.6],
        [-14, 3.6],
        [14, -3.6],
        [14, 3.6],
      ].map(([cx, cy]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="3.9" fill="#f5e6c8" />
      ))}
      <path d="M-9 0 H9" stroke="#d9c39a" strokeWidth="1" />
    </g>
  );

  const arms = (() => {
    switch (pose) {
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
                fontFamily={MONO}
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
            <path d="M82 60 L88 74" stroke="#4b3621" strokeWidth="4" strokeLinecap="round" />
            <circle
              cx="80"
              cy="54"
              r="9"
              fill="rgba(125,211,252,0.22)"
              stroke="#e5e7eb"
              strokeWidth="2.4"
            />
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
      case 'guard':
        // Boxer: gloves up in a chin-level guard.
        return (
          <g>
            {sleeve('M33 70 Q26 70 36 62')}
            {sleeve('M67 70 Q74 70 64 62')}
            {[
              [39, 59],
              [61, 59],
            ].map(([cx, cy]) => (
              <g key={cx} data-accessory="boxing-glove">
                <ellipse cx={cx} cy={cy} rx="8" ry="8.6" fill="#b91c1c" />
                <ellipse
                  cx={cx! - 2}
                  cy={cy! - 2.6}
                  rx="2.8"
                  ry="3.2"
                  fill="#f87171"
                  opacity="0.5"
                />
                <path
                  d={`M${cx! - 4} ${cy! + 1} Q${cx} ${cy! + 4} ${cx! + 4} ${cy! + 1}`}
                  stroke="#7f1d1d"
                  strokeWidth="1"
                  fill="none"
                />
                <rect x={cx! - 5.5} y={cy! + 6.6} width="11" height="4.4" rx="1.4" fill="#f8fafc" />
              </g>
            ))}
          </g>
        );
      case 'crossed':
        // Crew leader: arms crossed.
        return (
          <g>
            {sleeve('M34 70 Q36 86 62 82')}
            {sleeve('M66 70 Q64 88 38 84')}
            {paw(62, 81)}
            {paw(38, 83)}
          </g>
        );
      case 'walkie':
        // Lookout: walkie-talkie up, binoculars on the vest strap.
        return (
          <g>
            {sleeve('M34 70 Q28 82 36 90')}
            {sleeve('M66 70 Q78 62 70 48')}
            {paw(37, 92)}
            <g data-accessory="walkie">
              <rect x="66" y="30" width="9" height="18" rx="2" fill="#111827" />
              <path d="M73 30 V20" stroke="#111827" strokeWidth="2" strokeLinecap="round" />
              <circle cx="70.5" cy="35" r="1.4" fill="#f43f5e" className="vf-blink" />
            </g>
            {paw(70, 46)}
            <g data-accessory="binoculars">
              <rect x="38" y="86" width="9" height="11" rx="3" fill="#0f172a" />
              <rect x="49" y="86" width="9" height="11" rx="3" fill="#0f172a" />
              <circle cx="42.5" cy="95" r="2.4" fill="#22d3ee" opacity="0.6" />
              <circle cx="53.5" cy="95" r="2.4" fill="#22d3ee" opacity="0.6" />
            </g>
          </g>
        );
      case 'hug':
        // Snack guard: hugging the last Milk Bone.
        return (
          <g>
            <g data-accessory="milk-bone">{bone(50, 82, 1.15, -6)}</g>
            {sleeve('M34 70 Q26 82 40 86')}
            {sleeve('M66 70 Q74 82 60 86')}
            {paw(41, 85)}
            {paw(59, 85)}
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
    <g
      transform={facing === -1 ? 'translate(100 0) scale(-1 1)' : undefined}
      data-character="snow-wolf"
      data-persona={persona}
      data-outfit={top}
      data-uniform={vest}
    >
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
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={top} stopOpacity="0.78" />
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
      {/* PERSONAL outfit: hood behind the neck + hoodie */}
      <ellipse cx="50" cy="59" rx="17" ry="6" fill={top} />
      <path
        d="M31 72 Q31 58 50 57 Q69 58 69 72 L72 106 Q50 113 28 106 Z"
        fill={`url(#${hood})`}
        data-layer="personal"
      />
      <path d="M47 62 L46.5 76 M53 62 L53.5 76" stroke="#f8fafc" strokeWidth="1" />
      {/* A•N UNIFORM: an open vest worn over the personal hoodie */}
      <g data-layer="an-uniform">
        <path d="M31 72 Q31 60 42 58 L45.5 61 L44 108.6 Q36 108.4 28.4 106 Z" fill={vest} />
        <path d="M69 72 Q69 60 58 58 L54.5 61 L56 108.6 Q64 108.4 71.6 106 Z" fill={vest} />
        <path
          d="M45.5 61 L44 108.6 M54.5 61 L56 108.6"
          stroke={accent}
          strokeWidth="0.9"
          opacity="0.8"
        />
        {/* A•N patch */}
        <rect
          x="32.5"
          y="76"
          width="10.5"
          height="7"
          rx="1.2"
          fill="#0b1020"
          stroke={accent}
          strokeWidth="0.5"
        />
        <text
          x="37.75"
          y="81.4"
          textAnchor="middle"
          fontSize="4.6"
          fontWeight="800"
          fill="#e0f2fe"
          fontFamily={MONO}
        >
          A•N
        </text>
        {/* paw patch */}
        <g fill={accent} opacity="0.95">
          <ellipse cx="62.5" cy="81" rx="2.4" ry="2" />
          <circle cx="59.8" cy="77.8" r="0.95" />
          <circle cx="62.5" cy="76.8" r="0.95" />
          <circle cx="65.2" cy="77.8" r="0.95" />
        </g>
        <text
          x="37.6"
          y="100"
          textAnchor="middle"
          fontSize="6.4"
          fontWeight="800"
          fill={accent}
          opacity="0.9"
          fontFamily={MONO}
        >
          07
        </text>
      </g>
      {/* gold chain with a crown pendant (double for the crew leader) */}
      <path
        d="M38 60 Q50 76 62 60"
        stroke={`url(#${gold})`}
        strokeWidth="2.4"
        fill="none"
        strokeDasharray="2.2 1.1"
        strokeLinecap="round"
      />
      {p.doubleChain && (
        <path
          d="M36 61 Q50 84 64 61"
          stroke={`url(#${gold})`}
          strokeWidth="2.8"
          fill="none"
          strokeDasharray="2.6 1.2"
          strokeLinecap="round"
        />
      )}
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
      {/* eye opening with big expressive eyes */}
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
        d={persona === 'wild-paw' ? 'M46 50.6 Q50 54.6 54.6 50' : 'M46.8 51 Q50 53.4 53.2 51'}
        stroke="#3b2a20"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      {p.goggles && (
        <g data-accessory="goggles">
          <path d="M29 24 Q50 18 71 24" stroke="#1f2937" strokeWidth="3" fill="none" />
          <circle cx="42" cy="22" r="5.2" fill="#0f172a" stroke="#fb923c" strokeWidth="1.6" />
          <circle cx="58" cy="22" r="5.2" fill="#0f172a" stroke="#fb923c" strokeWidth="1.6" />
          <circle cx="40.5" cy="20.5" r="1.4" fill="#fde68a" opacity="0.8" />
          <circle cx="56.5" cy="20.5" r="1.4" fill="#fde68a" opacity="0.8" />
        </g>
      )}
      {p.headphones && (
        <g data-accessory="headphones">
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
      {p.crown && (
        <g data-accessory="crown">
          <path d="M40 21 L42 11 L46.5 17 L50 9 L53.5 17 L58 11 L60 21 Z" fill={`url(#${gold})`} />
          <circle cx="50" cy="15.5" r="1.5" fill="#a3e635" />
        </g>
      )}
    </g>
  );
}
