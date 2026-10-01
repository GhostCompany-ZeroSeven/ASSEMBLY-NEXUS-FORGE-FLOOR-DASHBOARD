/**
 * Environment props for the visual Forge Floor (SVG, decorative). Everything
 * here is set dressing: none of it encodes operational state.
 */
const MONO = 'JetBrains Mono Variable, monospace';

export function Monitor({
  x,
  y,
  w,
  h,
  tone = '#22d3ee',
  variant = 'code',
  tilt = 0,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: string;
  variant?: 'code' | 'graph' | 'schematic' | 'map';
  tilt?: number;
}) {
  const lines = Math.max(3, Math.floor(h / 9));
  return (
    <g transform={tilt ? `rotate(${tilt} ${x + w / 2} ${y + h})` : undefined}>
      <rect x={x + w / 2 - 4} y={y + h} width="8" height="14" fill="#1f2937" />
      <rect x={x + w / 2 - 16} y={y + h + 12} width="32" height="4" rx="2" fill="#111827" />
      <rect
        x={x - 3}
        y={y - 3}
        width={w + 6}
        height={h + 6}
        rx="4"
        fill="#0b1018"
        stroke="#273449"
      />
      <rect x={x} y={y} width={w} height={h} rx="2" fill="#050a12" />
      <g className="vf-flicker">
        <rect x={x} y={y} width={w} height={h} rx="2" fill={tone} opacity="0.08" />
        {variant === 'code' &&
          Array.from({ length: lines }, (_, i) => (
            <rect
              key={i}
              x={x + 5 + ((i * 7) % 12)}
              y={y + 5 + i * 8}
              width={((i * 37) % (w - 20)) + 10}
              height="2.6"
              rx="1"
              fill={i % 4 === 0 ? '#d946ef' : i % 3 === 0 ? '#a3e635' : tone}
              opacity="0.75"
            />
          ))}
        {variant === 'graph' && (
          <g>
            <path
              d={`M${x + 4} ${y + h - 8} L${x + w * 0.2} ${y + h * 0.55} L${x + w * 0.4} ${y + h * 0.7} L${x + w * 0.6} ${y + h * 0.3} L${x + w * 0.8} ${y + h * 0.45} L${x + w - 4} ${y + 8}`}
              stroke="#a3e635"
              strokeWidth="2"
              fill="none"
            />
            <path
              d={`M${x + 4} ${y + h - 6} H${x + w - 4}`}
              stroke={tone}
              strokeWidth="0.8"
              opacity="0.6"
            />
          </g>
        )}
        {variant === 'schematic' && (
          <g stroke={tone} strokeWidth="1" fill="none" opacity="0.85">
            <rect x={x + w * 0.15} y={y + h * 0.2} width={w * 0.3} height={h * 0.35} />
            <path
              d={`M${x + w * 0.45} ${y + h * 0.37} H${x + w * 0.8} V${y + h * 0.75} H${x + w * 0.3}`}
            />
            <circle cx={x + w * 0.8} cy={y + h * 0.37} r="3" fill={tone} />
            <circle cx={x + w * 0.3} cy={y + h * 0.75} r="3" fill="#d946ef" stroke="none" />
          </g>
        )}
        {variant === 'map' && (
          <g fill={tone} opacity="0.7">
            {Array.from({ length: 12 }, (_, i) => (
              <circle
                key={i}
                cx={x + 8 + ((i * 29) % (w - 16))}
                cy={y + 8 + ((i * 17) % (h - 16))}
                r="2"
              />
            ))}
          </g>
        )}
      </g>
      <rect x={x} y={y} width={w} height={h * 0.35} fill="#ffffff" opacity="0.035" />
    </g>
  );
}

export function Desk({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <path
        d={`M${x} ${y} L${x + w} ${y} L${x + w - 10} ${y + 16} L${x + 10} ${y + 16} Z`}
        fill="#141c2a"
        stroke="#2c3a52"
      />
      <path d={`M${x} ${y} L${x + w} ${y}`} stroke="#22d3ee" strokeWidth="1.4" opacity="0.55" />
      <rect x={x + 14} y={y + 16} width="8" height="44" fill="#0e141f" />
      <rect x={x + w - 22} y={y + 16} width="8" height="44" fill="#0e141f" />
      <rect
        x={x + w * 0.62}
        y={y + 18}
        width={w * 0.24}
        height="34"
        rx="2"
        fill="#101827"
        stroke="#24324a"
      />
      <circle cx={x + w * 0.74} cy={y + 28} r="1.6" fill="#a3e635" />
      <circle cx={x + w * 0.74} cy={y + 40} r="1.6" fill="#d946ef" />
    </g>
  );
}

export function Keyboard({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="44" height="9" rx="2" fill="#1e293b" stroke="#334155" />
      <g fill="#7dd3fc" opacity="0.35">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={x + 3 + i * 5} y={y + 2.5} width="3.5" height="2" rx="0.5" />
        ))}
      </g>
    </g>
  );
}

export function Mug({ x, y, tone = '#a3e635' }: { x: number; y: number; tone?: string }) {
  return (
    <g>
      <path
        d={`M${x} ${y} h12 v14 q0 3 -3 3 h-6 q-3 0 -3 -3 Z`}
        fill="#0f172a"
        stroke={tone}
        strokeWidth="1"
      />
      <path
        d={`M${x + 12} ${y + 4} q6 0 6 5 q0 5 -6 5`}
        stroke={tone}
        strokeWidth="1.4"
        fill="none"
      />
      <text
        x={x + 6}
        y={y + 11}
        textAnchor="middle"
        fontSize="5.5"
        fontWeight="800"
        fill={tone}
        fontFamily={MONO}
      >
        07
      </text>
      <path
        className="vf-steam"
        d={`M${x + 4} ${y - 3} q2 -4 0 -8 M${x + 8} ${y - 3} q2 -4 0 -8`}
        stroke="#e2e8f0"
        strokeWidth="0.9"
        fill="none"
        opacity="0.35"
      />
    </g>
  );
}

export function StickyNotes({ x, y }: { x: number; y: number }) {
  const notes: [number, number, string, number][] = [
    [0, 0, '#d9f99d', -6],
    [16, 4, '#f5d0fe', 4],
    [6, 16, '#a5f3fc', -2],
  ];
  return (
    <g>
      {notes.map(([dx, dy, c, r], i) => (
        <g key={i} transform={`rotate(${r} ${x + dx + 7} ${y + dy + 7})`}>
          <rect x={x + dx} y={y + dy} width="14" height="14" fill={c} opacity="0.9" />
          <path
            d={`M${x + dx + 2} ${y + dy + 5} h9 M${x + dx + 2} ${y + dy + 9} h7`}
            stroke="#334155"
            strokeWidth="0.8"
          />
        </g>
      ))}
    </g>
  );
}

export function Schematic({
  x,
  y,
  w,
  h,
  rot = 0,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}) {
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} fill="#0c2a4a" stroke="#38bdf8" strokeWidth="0.8" />
      <g stroke="#bae6fd" strokeWidth="0.7" fill="none" opacity="0.8">
        <path d={`M${x + 6} ${y + h / 2} H${x + w * 0.4} V${y + 6} H${x + w - 6}`} />
        <rect x={x + w * 0.5} y={y + h * 0.45} width={w * 0.3} height={h * 0.35} />
        <circle cx={x + w * 0.25} cy={y + h * 0.75} r="4" />
      </g>
    </g>
  );
}

export function Binder({
  x,
  y,
  label,
  tone,
}: {
  x: number;
  y: number;
  label: string;
  tone: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width="17"
        height="62"
        rx="2"
        fill="#0f172a"
        stroke={tone}
        strokeWidth="1.2"
      />
      <rect x={x + 2} y={y + 6} width="13" height="4" fill={tone} opacity="0.85" />
      <circle cx={x + 8.5} cy={y + 52} r="3" fill="none" stroke={tone} strokeWidth="1" />
      <text
        x={x + 8.5}
        y={y + 15}
        transform={`rotate(90 ${x + 8.5} ${y + 15})`}
        fontSize="6.4"
        fontWeight="700"
        fill="#e2e8f0"
        fontFamily={MONO}
        letterSpacing="0.6"
      >
        {label}
      </text>
    </g>
  );
}

export function ServerRack({ x, y, h = 240 }: { x: number; y: number; h?: number }) {
  const units = Math.floor((h - 20) / 18);
  return (
    <g>
      <rect x={x} y={y} width="86" height={h} rx="3" fill="#0a0f18" stroke="#25324a" />
      {Array.from({ length: units }, (_, i) => (
        <g key={i}>
          <rect
            x={x + 6}
            y={y + 10 + i * 18}
            width="74"
            height="13"
            rx="1.5"
            fill="#111a29"
            stroke="#1d2a40"
          />
          <circle
            className={i % 3 === 0 ? 'vf-blink' : i % 3 === 1 ? 'vf-blink vf-blink--b' : undefined}
            cx={x + 13}
            cy={y + 16.5 + i * 18}
            r="2"
            fill={
              i % 4 === 0
                ? '#a3e635'
                : i % 4 === 1
                  ? '#22d3ee'
                  : i % 4 === 2
                    ? '#d946ef'
                    : '#a3e635'
            }
          />
          <rect
            x={x + 20}
            y={y + 15 + i * 18}
            width={20 + ((i * 13) % 34)}
            height="3"
            fill="#22d3ee"
            opacity="0.25"
          />
        </g>
      ))}
    </g>
  );
}

export function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-14 0 L14 0 L10 24 L-10 24 Z" fill="#1e293b" stroke="#334155" />
      <path d="M-14 0 H14" stroke="#a3e635" strokeWidth="1.2" opacity="0.6" />
      <g fill="#3f8f3a" stroke="#1f5c25" strokeWidth="0.6">
        <path d="M0 0 Q-24 -18 -20 -44 Q-6 -26 0 0 Z" />
        <path d="M0 0 Q22 -14 24 -40 Q8 -24 0 0 Z" />
        <path d="M0 0 Q-6 -32 4 -58 Q10 -28 0 0 Z" fill="#4ea845" />
        <path d="M0 0 Q-30 -4 -34 -22 Q-14 -14 0 0 Z" fill="#357a31" />
        <path d="M0 0 Q30 -2 34 -18 Q14 -12 0 0 Z" fill="#357a31" />
      </g>
    </g>
  );
}

export function CircuitBoard({
  x,
  y,
  w = 70,
  h = 44,
  rot = 0,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  rot?: number;
}) {
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="3"
        fill="#0f3d2a"
        stroke="#22c55e"
        strokeWidth="0.8"
      />
      <g stroke="#facc15" strokeWidth="0.8" opacity="0.8" fill="none">
        <path d={`M${x + 6} ${y + 8} H${x + w * 0.45} V${y + h - 8}`} />
        <path d={`M${x + w - 6} ${y + 10} H${x + w * 0.6} V${y + h * 0.6} H${x + 10}`} />
      </g>
      <rect x={x + w * 0.5} y={y + h * 0.2} width={w * 0.22} height={h * 0.3} fill="#0b0f16" />
      <rect x={x + 8} y={y + h * 0.62} width={w * 0.18} height={h * 0.22} fill="#111" />
      <circle cx={x + w * 0.85} cy={y + h * 0.75} r="2.4" fill="#a3e635" />
    </g>
  );
}

export function SolderingStation({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="40" height="22" rx="3" fill="#1c2433" stroke="#334155" />
      <rect x={x + 6} y={y + 5} width="16" height="8" rx="1.5" fill="#050a12" />
      <text
        x={x + 14}
        y={y + 11.4}
        textAnchor="middle"
        fontSize="6"
        fill="#f97316"
        fontFamily={MONO}
      >
        350
      </text>
      <circle cx={x + 31} cy={y + 11} r="4" fill="#0b1018" stroke="#475569" />
      <path
        d={`M${x + 40} ${y + 8} C${x + 60} ${y - 10} ${x + 70} ${y + 6} ${x + 76} ${y - 6}`}
        stroke="#334155"
        strokeWidth="2"
        fill="none"
      />
      <path
        d={`M${x + 74} ${y - 4} L${x + 92} ${y - 18}`}
        stroke="#94a3b8"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d={`M${x + 92} ${y - 18} L${x + 98} ${y - 23}`}
        stroke="#f97316"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </g>
  );
}

export function CameraKit({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="34" height="22" rx="3" fill="#111827" stroke="#374151" />
      <rect x={x + 4} y={y - 5} width="12" height="6" rx="1.5" fill="#1f2937" />
      <circle cx={x + 19} cy={y + 11} r="8.5" fill="#0b0f16" stroke="#4b5563" strokeWidth="1.5" />
      <circle cx={x + 19} cy={y + 11} r="5" fill="#0e7490" opacity="0.6" />
      <circle cx={x + 17} cy={y + 9} r="1.5" fill="#ecfeff" opacity="0.8" />
      <g>
        <rect x={x + 42} y={y + 6} width="16" height="16" rx="3" fill="#111827" stroke="#4b5563" />
        <circle cx={x + 50} cy={y + 14} r="5.2" fill="#3b0764" opacity="0.7" />
        <rect x={x + 62} y={y + 10} width="12" height="12" rx="3" fill="#111827" stroke="#4b5563" />
        <circle cx={x + 68} cy={y + 16} r="3.6" fill="#164e63" opacity="0.8" />
      </g>
    </g>
  );
}

export function PartsBin({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="60" height="30" rx="2" fill="#151d2c" stroke="#2c3a52" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={x + 3 + i * 19} y={y + 3} width="16" height="24" rx="1" fill="#0b111b" />
          {Array.from({ length: 4 }, (_, j) => (
            <circle
              key={j}
              cx={x + 7 + i * 19 + (j % 2) * 7}
              cy={y + 9 + Math.floor(j / 2) * 9}
              r="1.8"
              fill={['#a3e635', '#22d3ee', '#d946ef', '#facc15'][(i + j) % 4]}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

export function Cable({ d, tone }: { d: string; tone: string }) {
  return (
    <path d={d} stroke={tone} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />
  );
}
