import type { ReactNode } from 'react';
import type { EquipmentKind } from '@/config/types';

/**
 * Room furniture/instrumentation drawn as lightweight SVG. `active` lights
 * equipment up (screens, forge glow, LEDs) when the room has busy workers.
 */
export function Equipment({ kind, active }: { kind: EquipmentKind; active: boolean }) {
  return (
    <svg
      viewBox="0 0 60 50"
      className="equip"
      data-kind={kind}
      data-active={active}
      aria-hidden="true"
    >
      {DRAW[kind]}
    </svg>
  );
}

const metal = 'var(--equip-metal)';
const dark = 'var(--equip-dark)';
const glow = 'var(--equip-glow)';

const DRAW: Record<EquipmentKind, ReactNode> = {
  whiteboard: (
    <g>
      <rect
        x="6"
        y="4"
        width="48"
        height="30"
        rx="2"
        fill="#e8edf3"
        stroke={metal}
        strokeWidth="2"
      />
      <path d="M12 12 L24 12 M12 18 L30 18 M12 24 L20 24" stroke="#3b82f6" strokeWidth="1.5" />
      <path d="M34 26 L40 14 L46 22 L50 10" stroke="#f97316" strokeWidth="1.5" fill="none" />
      <rect x="14" y="34" width="2" height="14" fill={metal} />
      <rect x="44" y="34" width="2" height="14" fill={metal} />
    </g>
  ),
  workbench: (
    <g>
      <rect x="4" y="26" width="52" height="5" rx="1" fill="#7c5a3a" />
      <rect x="8" y="31" width="3" height="17" fill={dark} />
      <rect x="49" y="31" width="3" height="17" fill={dark} />
      <rect x="12" y="18" width="12" height="8" rx="1" fill={metal} />
      <circle cx="36" cy="22" r="4" fill={dark} stroke={metal} />
      <rect x="42" y="14" width="8" height="12" rx="1" fill={dark} />
      <rect x="43.5" y="16" width="5" height="4" className="equip__screen" fill={glow} />
    </g>
  ),
  forge: (
    <g>
      <path d="M10 48 L10 20 Q30 4 50 20 L50 48 Z" fill={dark} stroke={metal} strokeWidth="2" />
      <path d="M18 48 L18 30 Q30 20 42 30 L42 48 Z" fill="#1c0d05" />
      <path
        className="equip__fire"
        d="M22 48 Q24 36 30 32 Q28 40 34 36 Q33 42 38 40 Q38 46 38 48 Z"
        fill="var(--ember)"
      />
      <rect x="26" y="0" width="8" height="10" fill={metal} />
    </g>
  ),
  'server-rack': (
    <g>
      <rect
        x="16"
        y="2"
        width="28"
        height="46"
        rx="2"
        fill={dark}
        stroke={metal}
        strokeWidth="1.5"
      />
      {[8, 16, 24, 32, 40].map((y, i) => (
        <g key={y}>
          <rect x="19" y={y} width="22" height="5" fill="#0b1220" />
          <circle
            cx="23"
            cy={y + 2.5}
            r="1.2"
            className={`equip__led equip__led--${i % 3}`}
            fill={glow}
          />
          <circle
            cx="27"
            cy={y + 2.5}
            r="1.2"
            className={`equip__led equip__led--${(i + 1) % 3}`}
            fill="#34d399"
          />
        </g>
      ))}
    </g>
  ),
  microscope: (
    <g>
      <rect x="18" y="42" width="24" height="5" rx="1" fill={metal} />
      <path d="M26 42 L26 30 L36 14" stroke={metal} strokeWidth="4" fill="none" />
      <rect
        x="31"
        y="6"
        width="7"
        height="14"
        rx="2"
        transform="rotate(30 34 13)"
        fill={dark}
        stroke={metal}
      />
      <rect x="22" y="32" width="16" height="3" fill={dark} />
      <circle cx="30" cy="36" r="2" className="equip__screen" fill={glow} />
    </g>
  ),
  console: (
    <g>
      <path d="M4 48 L10 28 L50 28 L56 48 Z" fill={dark} stroke={metal} strokeWidth="1.5" />
      <rect
        x="10"
        y="4"
        width="40"
        height="22"
        rx="2"
        fill="#0b1220"
        stroke={metal}
        strokeWidth="1.5"
      />
      <path
        className="equip__trace"
        d="M13 18 L20 18 L23 10 L27 22 L31 14 L35 18 L47 18"
        stroke={glow}
        strokeWidth="1.3"
        fill="none"
      />
      <circle cx="18" cy="38" r="2" fill="#f43f5e" />
      <circle cx="26" cy="38" r="2" fill="#fbbf24" />
      <circle cx="34" cy="38" r="2" fill="#34d399" />
      <rect x="40" y="36" width="10" height="4" rx="1" fill={metal} />
    </g>
  ),
  scanner: (
    <g>
      <rect
        x="10"
        y="6"
        width="40"
        height="40"
        rx="4"
        fill={dark}
        stroke={metal}
        strokeWidth="1.5"
      />
      <rect x="14" y="10" width="32" height="32" rx="2" fill="#0b1220" />
      <rect className="equip__scan" x="14" y="10" width="32" height="2" fill={glow} />
      <circle cx="30" cy="26" r="8" fill="none" stroke={glow} strokeOpacity="0.5" />
    </g>
  ),
  vault: (
    <g>
      <rect x="8" y="4" width="44" height="44" rx="3" fill={dark} stroke={metal} strokeWidth="2" />
      <circle cx="30" cy="26" r="12" fill="none" stroke={metal} strokeWidth="2.5" />
      <path d="M30 14 L30 38 M18 26 L42 26" stroke={metal} strokeWidth="2" />
      <circle cx="30" cy="26" r="3" fill={glow} />
    </g>
  ),
  coffee: (
    <g>
      <rect
        x="14"
        y="10"
        width="26"
        height="36"
        rx="3"
        fill={dark}
        stroke={metal}
        strokeWidth="1.5"
      />
      <rect x="18" y="14" width="18" height="8" rx="1" fill="#0b1220" />
      <rect x="21" y="30" width="12" height="10" rx="2" fill="#e8edf3" />
      <path
        className="equip__steam"
        d="M25 28 Q23 24 26 21 M30 28 Q28 24 31 21"
        stroke="#cbd5e1"
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="46" cy="40" r="5" fill="#16a34a" />
      <rect x="45" y="44" width="2" height="4" fill="#7c5a3a" />
    </g>
  ),
  couch: (
    <g>
      <rect x="4" y="24" width="52" height="16" rx="5" fill="#6d28d9" opacity="0.75" />
      <rect x="4" y="16" width="52" height="12" rx="5" fill="#7c3aed" opacity="0.8" />
      <rect x="8" y="40" width="3" height="6" fill={dark} />
      <rect x="49" y="40" width="3" height="6" fill={dark} />
    </g>
  ),
  terminal: (
    <g>
      <rect
        x="10"
        y="6"
        width="40"
        height="28"
        rx="2"
        fill="#0b1220"
        stroke={metal}
        strokeWidth="2"
      />
      <path d="M15 14 L19 17 L15 20" stroke={glow} strokeWidth="1.5" fill="none" />
      <rect className="equip__cursor" x="22" y="18" width="6" height="2" fill={glow} />
      <rect x="26" y="34" width="8" height="8" fill={metal} />
      <rect x="18" y="42" width="24" height="4" rx="1" fill={metal} />
    </g>
  ),
  'stamp-press': (
    <g>
      <rect x="10" y="40" width="40" height="8" rx="1" fill={metal} />
      <rect x="26" y="4" width="8" height="18" fill={dark} stroke={metal} />
      <rect className="equip__press" x="18" y="22" width="24" height="8" rx="1" fill="#b91c1c" />
      <rect x="16" y="34" width="28" height="6" fill="#f8fafc" />
    </g>
  ),
  gate: (
    <g>
      <rect x="4" y="4" width="8" height="44" fill={metal} />
      <rect x="48" y="4" width="8" height="44" fill={metal} />
      <rect x="4" y="2" width="52" height="6" fill={metal} />
      {[16, 24, 32, 40].map((x) => (
        <rect
          key={x}
          x={x}
          y="8"
          width="3"
          height="40"
          className="equip__bar"
          fill="var(--gate-bar)"
        />
      ))}
      <circle cx="30" cy="5" r="2" className="equip__led equip__led--0" fill="var(--gate-lamp)" />
    </g>
  ),
  'snow-banner': (
    <g>
      <rect x="28" y="2" width="2" height="46" fill={metal} />
      <path
        d="M30 4 L56 4 L50 14 L56 24 L30 24 Z"
        fill="#1e3a5f"
        stroke="#7dd3fc"
        strokeWidth="1"
      />
      <path d="M36 20 L38 9 L42 14 L46 9 L48 20 L42 23 Z" fill="#dbe4ee" />
      <circle cx="10" cy="14" r="1.2" fill="#e0f2fe" className="equip__snow" />
      <circle cx="18" cy="30" r="1" fill="#e0f2fe" className="equip__snow" />
      <circle cx="8" cy="40" r="1.4" fill="#e0f2fe" className="equip__snow" />
    </g>
  ),
};
