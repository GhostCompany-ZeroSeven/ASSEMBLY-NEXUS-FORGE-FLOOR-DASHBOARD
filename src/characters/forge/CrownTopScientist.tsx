import { useId } from 'react';

/**
 * Crown-Top Scientist (stylized high-definition, smooth shading).
 *
 * Founder-approved rules:
 * - Natural stylized skin shading only. NO cheek blush circles of any colour.
 * - `chrome`: a completely smooth bald top (specular highlight, no dots), with
 *   hair kept around the sides and back.
 * - `stubble`: the top is freshly, frantically shaved (subtle dark follicle
 *   dots clipped to the scalp cap), and the side/back hair is KEPT.
 * - `generation`: most of the team are veteran Crown-Tops (laugh lines, lighter
 *   side hair); the `young` Crown-Top is a younger ADULT professional of the same
 *   tradition (same crown-top cut, darker fuller side hair, ID lanyard).
 * Drawn in a 100 x 150 box, feet at y = 150, centred on x = 50.
 */
export type ScalpStyle = 'chrome' | 'stubble';
export type ScientistPose =
  'type' | 'clipboard' | 'point' | 'beaker' | 'think' | 'tablet' | 'solder' | 'lens';
export type FacialHair = 'none' | 'mustache' | 'beard' | 'goatee';

export interface CrownTopProps {
  scalp: ScalpStyle;
  skin: 'light' | 'medium' | 'tan' | 'deep';
  hair: string;
  glasses?: 'round' | 'square';
  brow?: 'flat' | 'raised' | 'furrowed';
  pose?: ScientistPose;
  generation?: 'veteran' | 'young';
  facial?: FacialHair;
  /** Lab goggles hanging around the neck. */
  goggles?: boolean;
  facing?: 1 | -1;
}

const SKIN: Record<CrownTopProps['skin'], [string, string, string]> = {
  // highlight, base, shade
  light: ['#ffe9dc', '#f3c9ad', '#d69f80'],
  medium: ['#f6d2b4', '#dba882', '#b07a56'],
  tan: ['#e6b98f', '#c28a5e', '#8f5f3c'],
  deep: ['#b98463', '#8a5a3c', '#5e3b26'],
};

export function CrownTopScientist({
  scalp,
  skin,
  hair,
  glasses,
  brow = 'flat',
  pose = 'type',
  generation = 'veteran',
  facial = 'none',
  goggles = false,
  facing = 1,
}: CrownTopProps) {
  const older = generation === 'veteran';
  const uid = useId().replace(/:/g, '');
  const [hi, base, shade] = SKIN[skin];
  const coat = `ct-coat-${uid}`;
  const face = `ct-face-${uid}`;
  const cap = `ct-cap-${uid}`;
  const dots = `ct-dots-${uid}`;
  const glove = '#1c2230';

  const arms = (() => {
    const sleeve = (d: string) => (
      <path d={d} stroke={`url(#${coat})`} strokeWidth="11" strokeLinecap="round" fill="none" />
    );
    const hand = (cx: number, cy: number) => (
      <g>
        <circle cx={cx} cy={cy} r="5.2" fill={glove} />
        <circle cx={cx - 1.5} cy={cy - 1.6} r="1.6" fill="#3a4458" opacity="0.8" />
      </g>
    );
    switch (pose) {
      case 'type':
        return (
          <g>
            {sleeve('M30 66 Q24 86 34 98')}
            {sleeve('M70 66 Q76 86 66 98')}
            {hand(36, 100)}
            {hand(64, 100)}
          </g>
        );
      case 'clipboard':
        return (
          <g>
            {sleeve('M30 66 Q24 84 38 88')}
            {sleeve('M70 66 Q78 82 62 86')}
            <g transform="rotate(-8 50 86)">
              <rect x="36" y="74" width="26" height="32" rx="2.5" fill="#6b4f3a" />
              <rect x="38.5" y="77" width="21" height="27" rx="1.2" fill="#f8fafc" />
              <rect x="44" y="72.5" width="10" height="4" rx="1.4" fill="#94a3b8" />
              <g stroke="#7c8aa5" strokeWidth="0.9">
                <path d="M41 83 H56" />
                <path d="M41 87 H54" />
                <path d="M41 91 H57" />
              </g>
              <path d="M41 96 l2 2 l4 -5" stroke="#65a30d" strokeWidth="1.4" fill="none" />
            </g>
            {hand(40, 90)}
            {hand(61, 87)}
          </g>
        );
      case 'point':
        return (
          <g>
            {sleeve('M30 66 Q24 86 34 98')}
            {sleeve('M70 64 Q84 52 90 36')}
            {hand(36, 100)}
            <g>
              <circle cx="91" cy="33" r="5.2" fill={glove} />
              <path d="M92 29 L97 20" stroke={glove} strokeWidth="3" strokeLinecap="round" />
            </g>
          </g>
        );
      case 'beaker':
        return (
          <g>
            {sleeve('M30 66 Q24 86 34 98')}
            {sleeve('M70 66 Q80 80 72 90')}
            {hand(36, 100)}
            <g>
              <path
                d="M66 78 L66 86 L60 98 Q59 102 63 102 L79 102 Q83 102 82 98 L76 86 L76 78 Z"
                fill="rgba(226,232,240,0.35)"
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <path
                d="M62.5 96 L79.5 96 L81.6 99.6 Q81.8 101 79.6 101 L62.4 101 Q60.4 101 60.6 99.6 Z"
                fill="#a3e635"
              />
              <circle cx="68" cy="93" r="1.3" fill="#d9f99d" opacity="0.9" />
              <circle cx="73" cy="90" r="0.9" fill="#d9f99d" opacity="0.8" />
            </g>
            {hand(72, 92)}
          </g>
        );
      case 'think':
        return (
          <g>
            {sleeve('M30 66 Q24 86 34 98')}
            {sleeve('M70 66 Q78 70 62 52')}
            {hand(36, 100)}
            {hand(58, 50)}
          </g>
        );
      case 'tablet':
        // Holding a glowing tablet up, mid-explanation.
        return (
          <g>
            {sleeve('M30 66 Q22 80 36 86')}
            {sleeve('M70 66 Q82 74 76 60')}
            <g transform="rotate(-10 46 84)">
              <rect x="32" y="74" width="30" height="21" rx="2.5" fill="#0b1020" stroke="#22d3ee" />
              <path
                d="M36 89 L42 83 L47 86 L55 78"
                stroke="#a3e635"
                strokeWidth="1.4"
                fill="none"
              />
              <circle cx="57" cy="80" r="1.4" fill="#f0abfc" />
            </g>
            {hand(37, 88)}
            {hand(76, 58)}
          </g>
        );
      case 'solder':
        // Soldering iron in hand, a puff of smoke.
        return (
          <g>
            {sleeve('M30 66 Q24 86 34 98')}
            {sleeve('M70 66 Q80 82 70 92')}
            {hand(36, 100)}
            <path d="M70 92 L86 104" stroke="#fbbf24" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M86 104 L93 109" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="94" cy="110" r="1.6" fill="#fb923c" className="vf-blink" />
            <path
              d="M94 104 Q90 98 95 94 Q99 90 95 86"
              stroke="#cbd5e1"
              strokeWidth="1"
              fill="none"
              opacity="0.5"
              className="vf-steam"
            />
            {hand(70, 92)}
          </g>
        );
      case 'lens':
        // Inspecting something through a big magnifying lens.
        return (
          <g>
            {sleeve('M30 66 Q24 86 34 98')}
            {sleeve('M70 66 Q82 62 82 50')}
            {hand(36, 100)}
            <path d="M84 54 L90 68" stroke="#4b3621" strokeWidth="4" strokeLinecap="round" />
            <circle
              cx="80"
              cy="44"
              r="10"
              fill="rgba(125,211,252,0.2)"
              stroke="#e5e7eb"
              strokeWidth="2.6"
            />
            <path
              d="M74 40 Q77 36 81 37"
              stroke="#ffffff"
              strokeWidth="1.2"
              fill="none"
              opacity="0.8"
            />
            {hand(82, 52)}
          </g>
        );
    }
  })();

  const browY = brow === 'raised' ? 27.5 : 29;
  const brows =
    brow === 'furrowed' ? (
      <g stroke={hair} strokeWidth="2.2" strokeLinecap="round">
        <path d="M38 29 L46 30.8" />
        <path d="M62 29 L54 30.8" />
      </g>
    ) : (
      <g stroke={hair} strokeWidth={older ? 2.6 : 2.1} strokeLinecap="round" fill="none">
        <path d={`M38 ${browY + 0.6} Q42 ${browY - 1} 46 ${browY + 0.4}`} />
        <path d={`M54 ${browY + 0.4} Q58 ${browY - 1} 62 ${browY + 0.6}`} />
      </g>
    );

  return (
    <g
      transform={facing === -1 ? 'translate(100 0) scale(-1 1)' : undefined}
      data-character="crown-top"
      data-crown={scalp}
      data-generation={generation}
    >
      <defs>
        <linearGradient id={coat} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#e7edf4" />
          <stop offset="1" stopColor="#b9c5d3" />
        </linearGradient>
        <radialGradient id={face} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.55" stopColor={base} />
          <stop offset="1" stopColor={shade} />
        </radialGradient>
        <clipPath id={cap}>
          {/* The scalp above the side hair line. */}
          <ellipse cx="50" cy="22" rx="16.5" ry="11" />
        </clipPath>
        <pattern id={dots} width="2.6" height="2.4" patternUnits="userSpaceOnUse">
          <circle cx="0.7" cy="0.7" r="0.42" fill="rgba(40,30,24,0.55)" />
          <circle cx="2" cy="1.9" r="0.36" fill="rgba(40,30,24,0.45)" />
        </pattern>
      </defs>
      <ellipse cx="50" cy="147" rx="27" ry="4.5" fill="rgba(0,0,0,0.45)" />
      {/* legs + shoes */}
      <rect x="38" y="116" width="10" height="28" rx="3.5" fill="#1f2937" />
      <rect x="52" y="116" width="10" height="28" rx="3.5" fill="#1a2230" />
      <ellipse cx="42" cy="145" rx="8" ry="3.4" fill={older ? '#0b0f16' : '#e2e8f0'} />
      <ellipse cx="58" cy="145" rx="8" ry="3.4" fill={older ? '#0b0f16' : '#e2e8f0'} />
      {!older && (
        <path d="M36 146 H48 M52 146 H64" stroke="#a3e635" strokeWidth="1.2" opacity="0.9" />
      )}
      {/* lab coat */}
      <path
        d="M24 70 Q24 57 38 55 L62 55 Q76 57 76 70 L81 128 Q50 135 19 128 Z"
        fill={`url(#${coat})`}
      />
      <path d="M50 74 L50 130" stroke="#aab6c5" strokeWidth="1" />
      <path d="M42 55 L50 76 L58 55 Z" fill="#1e293b" />
      <path d="M48.6 58 L51.4 58 L52.4 72 L50 76 L47.6 72 Z" fill="#22d3ee" opacity="0.85" />
      <path d="M38 55 L47 78 L42 60 Z" fill="#dfe6ee" />
      <path d="M62 55 L53 78 L58 60 Z" fill="#cdd6e1" />
      <rect x="57" y="84" width="13" height="10" rx="1.6" fill="#d5dde7" />
      <path d="M60 84 L60 79" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M63.5 84 L63.5 78.5" stroke="#d946ef" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M67 84 L67 80" stroke="#a3e635" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="30" y="98" width="12" height="8" rx="1.4" fill="#d5dde7" />
      {!older && (
        <g data-accessory="lanyard">
          <path d="M43 56 L47 80 M57 56 L53 80" stroke="#a3e635" strokeWidth="1.2" />
          <rect
            x="45"
            y="79"
            width="10"
            height="13"
            rx="1.4"
            fill="#0b1020"
            stroke="#a3e635"
            strokeWidth="0.6"
          />
          <rect x="47" y="82" width="6" height="2" fill="#22d3ee" />
          <rect x="47" y="86" width="4" height="1.4" fill="#e2e8f0" />
        </g>
      )}
      {goggles && (
        <g data-accessory="goggles">
          <path d="M38 58 Q50 66 62 58" stroke="#1f2937" strokeWidth="2.2" fill="none" />
          <ellipse
            cx="44"
            cy="62"
            rx="5"
            ry="3.8"
            fill="#0f172a"
            stroke="#22d3ee"
            strokeWidth="1.4"
          />
          <ellipse
            cx="56"
            cy="62"
            rx="5"
            ry="3.8"
            fill="#0f172a"
            stroke="#22d3ee"
            strokeWidth="1.4"
          />
          <circle cx="42.5" cy="60.8" r="1.1" fill="#e0f2fe" opacity="0.8" />
        </g>
      )}
      {arms}
      {/* neck + head */}
      <rect x="45" y="47" width="10" height="10" rx="3" fill={shade} />
      <ellipse cx="31.5" cy="37" rx="4" ry="5.6" fill={base} />
      <ellipse cx="68.5" cy="37" rx="4" ry="5.6" fill={base} />
      <ellipse cx="50" cy="33" rx="19" ry="21" fill={`url(#${face})`} />
      {/* side and back hair: kept for BOTH scalp styles */}
      <path
        d={
          older
            ? 'M31 27 Q27.5 38 32.5 48 Q35.5 42 35 31 Z'
            : 'M31.5 24 Q26 37 32 49 Q36.5 42 35.6 28 Z'
        }
        fill={hair}
      />
      <path
        d={
          older
            ? 'M69 27 Q72.5 38 67.5 48 Q64.5 42 65 31 Z'
            : 'M68.5 24 Q74 37 68 49 Q63.5 42 64.4 28 Z'
        }
        fill={hair}
      />
      <path d="M33 44 Q50 56 67 44 Q61 52 50 53.5 Q39 52 33 44 Z" fill={hair} opacity="0.9" />
      {scalp === 'chrome' ? (
        <g>
          <ellipse cx="44" cy="19" rx="8.5" ry="4.2" fill="#ffffff" opacity="0.38" />
          <ellipse cx="41.5" cy="17.6" rx="3" ry="1.4" fill="#ffffff" opacity="0.55" />
        </g>
      ) : (
        <g clipPath={`url(#${cap})`}>
          <ellipse cx="50" cy="22" rx="16.5" ry="11" fill="rgba(52,40,32,0.07)" />
          <rect x="30" y="8" width="40" height="26" fill={`url(#${dots})`} />
          <ellipse cx="44" cy="18" rx="6" ry="2.6" fill="#ffffff" opacity="0.18" />
        </g>
      )}
      {/* face (no blush, natural shading only) */}
      {brows}
      <ellipse cx="43" cy="36.5" rx="2.6" ry="3.1" fill="#1b2230" />
      <ellipse cx="57" cy="36.5" rx="2.6" ry="3.1" fill="#1b2230" />
      <circle cx="42.1" cy="35.4" r="0.85" fill="#ffffff" />
      <circle cx="56.1" cy="35.4" r="0.85" fill="#ffffff" />
      <path
        d="M50 38 Q52.6 42.6 49.4 43.6"
        stroke={shade}
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      {older && (
        <g stroke={shade} strokeWidth="0.8" opacity="0.7" fill="none">
          <path d="M36.5 41 Q35.5 43.5 37 45.5" />
          <path d="M63.5 41 Q64.5 43.5 63 45.5" />
        </g>
      )}
      <path
        d={older ? 'M45 47 Q50 49.6 55 47' : 'M44.5 46.4 Q50 50.6 55.5 46.4'}
        stroke="#6b3a2c"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      {facial === 'mustache' && (
        <path
          d="M43 45.6 Q46.5 42.4 50 44.4 Q53.5 42.4 57 45.6 Q53.5 45.4 50 46 Q46.5 45.4 43 45.6 Z"
          fill={hair}
          data-facial="mustache"
        />
      )}
      {facial === 'beard' && (
        <path
          d="M32.6 40 Q33 52 42 54.6 Q50 57.6 58 54.6 Q67 52 67.4 40 Q64 48 58 48.6 Q55 45.2 50 45.4 Q45 45.2 42 48.6 Q36 48 32.6 40 Z"
          fill={hair}
          opacity="0.95"
          data-facial="beard"
        />
      )}
      {facial === 'goatee' && (
        <path
          d="M46 49.6 Q50 51.4 54 49.6 Q53.6 55 50 55.6 Q46.4 55 46 49.6 Z"
          fill={hair}
          data-facial="goatee"
        />
      )}
      {glasses === 'round' && (
        <g stroke="#0f172a" strokeWidth="1.5" fill="rgba(125,211,252,0.16)">
          <circle cx="43" cy="36.6" r="5.4" />
          <circle cx="57" cy="36.6" r="5.4" />
          <path d="M48.4 36 Q50 35 51.6 36" fill="none" />
          <path d="M39.5 33.5 L41.5 32" stroke="#e0f2fe" strokeWidth="0.9" />
        </g>
      )}
      {glasses === 'square' && (
        <g stroke="#0f172a" strokeWidth="1.5" fill="rgba(167,139,250,0.14)">
          <rect x="37.2" y="32.4" width="11" height="8.4" rx="2" />
          <rect x="51.8" y="32.4" width="11" height="8.4" rx="2" />
          <path d="M48.2 35.6 L51.8 35.6" fill="none" />
          <path d="M39 34.5 L41.4 33.4" stroke="#ede9fe" strokeWidth="0.9" />
        </g>
      )}
    </g>
  );
}
