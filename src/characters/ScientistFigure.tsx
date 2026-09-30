import type { WorkerState } from '@/domain/types';
import type { ScientistAppearance } from './types';

/**
 * Procedural placeholder art for the Forge crew — original design.
 * Signature trait: the Forge took their hair as payment (bald crown with a
 * shine, hair surviving only on the sides/back).
 *
 * Pure SVG, no external assets. Replace via an `image` character definition.
 */
export function ScientistFigure({
  appearance: a,
  state,
}: {
  appearance: ScientistAppearance;
  state: WorkerState;
}) {
  const mood = moodFor(state);
  const dark = 'var(--char-ink, #1b2230)';
  return (
    <g>
      {/* ground shadow */}
      <ellipse cx="32" cy="77" rx="15" ry="3" fill="rgba(0,0,0,0.35)" />

      {/* legs */}
      <rect x="25" y="64" width="5" height="12" rx="2" fill={dark} />
      <rect x="34" y="64" width="5" height="12" rx="2" fill={dark} />
      <rect x="23.5" y="74" width="8" height="3.5" rx="1.5" fill="#0b0f16" />
      <rect x="32.5" y="74" width="8" height="3.5" rx="1.5" fill="#0b0f16" />

      {/* lab coat */}
      <path
        d="M18 46 Q18 39 26 38 L38 38 Q46 39 46 46 L48 68 Q32 71 16 68 Z"
        fill={a.coat}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="0.8"
      />
      {/* shirt + lapels */}
      <path d="M28 38 L32 47 L36 38 Z" fill={a.accent} opacity="0.85" />
      <path d="M26 38 L32 52 L28 38 Z" fill="rgba(0,0,0,0.08)" />
      <path d="M38 38 L32 52 L36 38 Z" fill="rgba(0,0,0,0.08)" />
      <line x1="32" y1="52" x2="32" y2="68" stroke="rgba(0,0,0,0.15)" strokeWidth="0.8" />
      {/* pocket with pens + badge */}
      <rect x="36.5" y="50" width="6" height="5" rx="0.8" fill="rgba(0,0,0,0.07)" />
      <rect x="37.5" y="47.5" width="1" height="3.5" fill="#3b82f6" />
      <rect x="39.5" y="47.5" width="1" height="3.5" fill="#ef4444" />
      <rect x="21.5" y="49" width="6" height="3.5" rx="0.8" fill={a.accent} />

      {/* arms / hands */}
      <path
        d="M19 45 Q14 54 17 61"
        stroke={a.coat}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="17.5" cy="62" r="2.6" fill={a.skin} />
      <path
        d="M45 45 Q50 53 47 59"
        stroke={a.coat}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="47" cy="60" r="2.6" fill={a.skin} />

      <Tool tool={a.tool} accent={a.accent} />

      {/* neck */}
      <rect x="29" y="34" width="6" height="5" fill={a.skin} />
      <rect x="29" y="34" width="6" height="2" fill="rgba(0,0,0,0.12)" />

      {/* back hair (behind head) */}
      <BackHair style={a.hairStyle} color={a.hair} />

      {/* ears */}
      <circle cx="18.6" cy="24" r="3" fill={a.skin} />
      <circle cx="45.4" cy="24" r="3" fill={a.skin} />

      {/* head — the bald crown */}
      <ellipse cx="32" cy="21" rx="13.5" ry="14" fill={a.skin} />
      {/* crown shine: payment received */}
      <ellipse
        cx="27"
        cy="11"
        rx="4.5"
        ry="2.2"
        fill="rgba(255,255,255,0.55)"
        transform="rotate(-18 27 11)"
      />
      <ellipse cx="33.5" cy="9" rx="1.4" ry="0.8" fill="rgba(255,255,255,0.5)" />

      {/* side hair (in front of head edges) */}
      <SideHair style={a.hairStyle} color={a.hair} />

      <Face appearance={a} mood={mood} />

      <Eyewear kind={a.eyewear} accent={a.accent} />
      <FacialHair kind={a.facialHair} color={a.hair} />
      {a.tool === 'headset' && (
        <g>
          <path d="M18 20 Q32 2 46 20" stroke="#111827" strokeWidth="2" fill="none" />
          <rect x="15.5" y="19" width="4" height="7" rx="1.5" fill="#111827" />
          <path d="M17.5 26 Q20 32 26 31" stroke="#111827" strokeWidth="1.2" fill="none" />
          <circle cx="26.5" cy="31" r="1.2" fill={a.accent} />
        </g>
      )}
    </g>
  );
}

type Mood = 'neutral' | 'focused' | 'happy' | 'worried' | 'upset' | 'dazed' | 'sleepy' | 'thinking';

function moodFor(state: WorkerState): Mood {
  switch (state) {
    case 'IDLE':
      return 'sleepy';
    case 'PLANNING':
      return 'thinking';
    case 'WORKING':
    case 'CERTIFYING':
    case 'REVIEWING':
      return 'focused';
    case 'WAITING':
      return 'worried';
    case 'BLOCKED':
      return 'upset';
    case 'COMPLETE':
      return 'happy';
    case 'FAILED':
      return 'dazed';
    case 'STOPPED':
      return 'neutral';
    case 'UNKNOWN':
      return 'thinking';
  }
}

function Face({ appearance: a, mood }: { appearance: ScientistAppearance; mood: Mood }) {
  const ink = '#1b1b1f';
  const browTilt = mood === 'upset' ? 3 : mood === 'worried' ? -2.5 : a.brow * 1.5;
  const eyes = (() => {
    switch (mood) {
      case 'happy':
        return (
          <g stroke={ink} strokeWidth="1.4" fill="none" strokeLinecap="round">
            <path d="M24.5 23 Q27 20.5 29.5 23" />
            <path d="M34.5 23 Q37 20.5 39.5 23" />
          </g>
        );
      case 'dazed':
        return (
          <g stroke={ink} strokeWidth="1.3" strokeLinecap="round">
            <path d="M25 20.5 L29 24.5 M29 20.5 L25 24.5" />
            <path d="M35 20.5 L39 24.5 M39 20.5 L35 24.5" />
          </g>
        );
      case 'sleepy':
        return (
          <g stroke={ink} strokeWidth="1.4" strokeLinecap="round">
            <path d="M24.8 23 L29.2 23" />
            <path d="M34.8 23 L39.2 23" />
          </g>
        );
      default: {
        const dx = mood === 'thinking' ? 1 : mood === 'worried' ? -0.6 : 0;
        const dy = mood === 'thinking' ? -1 : 0;
        return (
          <g>
            <ellipse cx="27" cy="22.5" rx="2.4" ry="2.7" fill="#fff" />
            <ellipse cx="37" cy="22.5" rx="2.4" ry="2.7" fill="#fff" />
            <circle cx={27 + dx} cy={22.8 + dy} r="1.4" fill={ink} />
            <circle cx={37 + dx} cy={22.8 + dy} r="1.4" fill={ink} />
            <circle cx={27.5 + dx} cy={22.2 + dy} r="0.45" fill="#fff" />
            <circle cx={37.5 + dx} cy={22.2 + dy} r="0.45" fill="#fff" />
          </g>
        );
      }
    }
  })();

  const mouth = (() => {
    switch (mood) {
      case 'happy':
        return <path d="M27 29 Q32 34 37 29 Z" fill="#7f1d1d" stroke={ink} strokeWidth="0.8" />;
      case 'upset':
        return (
          <path
            d="M28 31 Q32 27.5 36 31"
            stroke={ink}
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
        );
      case 'worried':
        return (
          <path
            d="M28.5 30.5 Q30.5 29 32 30.3 Q33.5 31.5 35.5 30"
            stroke={ink}
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        );
      case 'dazed':
        return <ellipse cx="32" cy="30.5" rx="1.8" ry="2.2" fill="#7f1d1d" />;
      case 'thinking':
        return <path d="M29 30.5 L34 29.8" stroke={ink} strokeWidth="1.2" strokeLinecap="round" />;
      case 'focused':
        return (
          <path
            d="M28.5 29.8 Q32 31.8 35.5 29.8"
            stroke={ink}
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        );
      default:
        return (
          <path
            d="M29 30 Q32 31 35 30"
            stroke={ink}
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        );
    }
  })();

  return (
    <g>
      {/* brows */}
      <g stroke={a.hair} strokeWidth="1.8" strokeLinecap="round">
        <line x1="24.5" y1={18.2 - browTilt / 2} x2="29.5" y2={18.2 + browTilt / 2} />
        <line x1="34.5" y1={18.2 + browTilt / 2} x2="39.5" y2={18.2 - browTilt / 2} />
      </g>
      {eyes}
      {/* nose */}
      <path
        d="M32 23.5 Q34 26.5 31.5 27"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      {/* cheeks */}
      <circle cx="24" cy="27.5" r="1.8" fill="#f87171" opacity="0.25" />
      <circle cx="40" cy="27.5" r="1.8" fill="#f87171" opacity="0.25" />
      {mouth}
    </g>
  );
}

function BackHair({ style, color }: { style: ScientistAppearance['hairStyle']; color: string }) {
  switch (style) {
    case 'bun':
      return <circle cx="45" cy="30" r="5" fill={color} />;
    case 'swoop':
      return <path d="M17 24 Q18 38 32 37 Q46 38 47 24 Q44 33 32 33 Q20 33 17 24 Z" fill={color} />;
    default:
      return null;
  }
}

function SideHair({ style, color }: { style: ScientistAppearance['hairStyle']; color: string }) {
  switch (style) {
    case 'wild':
      return (
        <g fill={color}>
          <path d="M19 14 Q9 12 12 19 Q6 22 12 26 Q8 31 16 30 Q18 22 20 17 Z" />
          <path d="M45 14 Q55 12 52 19 Q58 22 52 26 Q56 31 48 30 Q46 22 44 17 Z" />
        </g>
      );
    case 'tufts':
      return (
        <g fill={color}>
          <path d="M19 15 L14 13 L17 17 L13 18 L18 20 L19.5 22 Z" />
          <path d="M45 15 L50 13 L47 17 L51 18 L46 20 L44.5 22 Z" />
        </g>
      );
    case 'bun':
    case 'sides':
    case 'swoop':
    default:
      return (
        <g fill={color}>
          <path d="M18.5 15 Q15 20 17 28 Q19 27 20 24 Q19.5 19 21 15.5 Z" />
          <path d="M45.5 15 Q49 20 47 28 Q45 27 44 24 Q44.5 19 43 15.5 Z" />
        </g>
      );
  }
}

function Eyewear({ kind, accent }: { kind: ScientistAppearance['eyewear']; accent: string }) {
  switch (kind) {
    case 'glasses':
      return (
        <g stroke="#111827" strokeWidth="1" fill="rgba(186,230,253,0.18)">
          <circle cx="27" cy="22.5" r="3.9" />
          <circle cx="37" cy="22.5" r="3.9" />
          <path d="M30.9 22 Q32 21 33.1 22" fill="none" />
        </g>
      );
    case 'goggles':
      // pushed up onto the bald crown — safety first, style second
      return (
        <g>
          <path d="M18.8 14 Q32 8 45.2 14" stroke="#374151" strokeWidth="2.4" fill="none" />
          <circle cx="27" cy="12.2" r="3.6" fill="#1f2937" stroke={accent} strokeWidth="1.2" />
          <circle cx="37" cy="12.2" r="3.6" fill="#1f2937" stroke={accent} strokeWidth="1.2" />
          <circle cx="26" cy="11.2" r="1" fill="rgba(255,255,255,0.6)" />
          <circle cx="36" cy="11.2" r="1" fill="rgba(255,255,255,0.6)" />
        </g>
      );
    case 'monocle':
      return (
        <g>
          <circle
            cx="37"
            cy="22.5"
            r="4"
            fill="rgba(186,230,253,0.2)"
            stroke="#b45309"
            strokeWidth="1.1"
          />
          <path d="M40.5 25 Q43 33 41 38" stroke="#b45309" strokeWidth="0.6" fill="none" />
        </g>
      );
    case 'visor':
      return (
        <rect
          x="22"
          y="19.5"
          width="20"
          height="5.5"
          rx="2.5"
          fill={accent}
          opacity="0.55"
          stroke="#0f172a"
          strokeWidth="0.8"
        />
      );
    case 'none':
      return null;
  }
}

function FacialHair({ kind, color }: { kind: ScientistAppearance['facialHair']; color: string }) {
  switch (kind) {
    case 'mustache':
      return (
        <path
          d="M26.5 28.2 Q29.5 25.8 32 27.6 Q34.5 25.8 37.5 28.2 Q34.5 28.8 32 28.4 Q29.5 28.8 26.5 28.2 Z"
          fill={color}
        />
      );
    case 'beard':
      return (
        <path
          d="M20 25 Q21 36 32 37 Q43 36 44 25 Q41 31 37 31.5 Q32 33.5 27 31.5 Q23 31 20 25 Z"
          fill={color}
        />
      );
    case 'goatee':
      return <path d="M29.5 32 Q32 37 34.5 32 Q32 33 29.5 32 Z" fill={color} />;
    case 'none':
      return null;
  }
}

function Tool({ tool, accent }: { tool: ScientistAppearance['tool']; accent: string }) {
  switch (tool) {
    case 'clipboard':
      return (
        <g transform="translate(44 50) rotate(8)">
          <rect x="0" y="0" width="10" height="13" rx="1" fill="#a16207" />
          <rect x="1.2" y="2" width="7.6" height="10" fill="#f8fafc" />
          <rect x="3" y="-1" width="4" height="2.4" rx="0.6" fill="#9ca3af" />
          <line x1="2.5" y1="5" x2="7.5" y2="5" stroke="#94a3b8" strokeWidth="0.7" />
          <line x1="2.5" y1="7.5" x2="7.5" y2="7.5" stroke="#94a3b8" strokeWidth="0.7" />
          <line x1="2.5" y1="10" x2="6" y2="10" stroke={accent} strokeWidth="0.7" />
        </g>
      );
    case 'wrench':
      return (
        <g transform="translate(47 60) rotate(-35)" className="tool-swing">
          <rect x="-1.2" y="-14" width="2.4" height="14" rx="1" fill="#9ca3af" />
          <path d="M-3.5 -18 A4 4 0 1 1 3.5 -18 L1.5 -15.5 L-1.5 -15.5 Z" fill="#9ca3af" />
          <rect x="-1.4" y="-19.5" width="2.8" height="3" fill="var(--char-bg, #0f172a)" />
        </g>
      );
    case 'magnifier':
      return (
        <g transform="translate(47 60) rotate(-30)">
          <rect x="-1" y="-10" width="2" height="10" rx="1" fill="#78350f" />
          <circle
            cx="0"
            cy="-14"
            r="4.5"
            fill="rgba(186,230,253,0.35)"
            stroke="#d1d5db"
            strokeWidth="1.4"
          />
        </g>
      );
    case 'shield':
      return (
        <g transform="translate(40 49)">
          <path
            d="M0 0 L10 0 L10 7 Q10 13 5 15 Q0 13 0 7 Z"
            fill="#1f2937"
            stroke={accent}
            strokeWidth="1.2"
          />
          <path d="M5 3 L5 12 M2 6.5 L8 6.5" stroke={accent} strokeWidth="1.2" />
        </g>
      );
    case 'tablet':
      return (
        <g transform="translate(40 51) rotate(-6)">
          <rect x="0" y="0" width="12" height="9" rx="1.2" fill="#111827" />
          <rect
            x="1"
            y="1"
            width="10"
            height="7"
            rx="0.6"
            fill={accent}
            opacity="0.7"
            className="screen-flicker"
          />
        </g>
      );
    case 'stamp':
      return (
        <g transform="translate(44 52)">
          <rect x="2" y="0" width="3" height="6" rx="1" fill="#78350f" />
          <circle cx="3.5" cy="-0.5" r="2.3" fill="#92400e" />
          <rect x="0" y="6" width="7" height="3" rx="0.6" fill="#b91c1c" />
        </g>
      );
    case 'flask':
      return (
        <g transform="translate(44 49)">
          <rect x="3" y="0" width="3" height="4" fill="#e2e8f0" />
          <path
            d="M3 4 L0 11 Q0 13 2 13 L7 13 Q9 13 9 11 L6 4 Z"
            fill="rgba(226,232,240,0.6)"
            stroke="#94a3b8"
            strokeWidth="0.6"
          />
          <path
            d="M1.1 9 L7.9 9 L9 11 Q9 13 7 13 L2 13 Q0 13 0 11 Z"
            fill={accent}
            className="flask-bubble"
          />
        </g>
      );
    case 'headset':
    case 'none':
      return null;
  }
}
