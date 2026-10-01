import { memo, type ReactNode } from 'react';
import { BabyGhost } from '@/characters/forge/BabyGhost';
import { CrownTopScientist } from '@/characters/forge/CrownTopScientist';
import { SnowWolfBandit } from '@/characters/forge/SnowWolfBandit';
import type { VisualMode } from '../model';
import { BOLDNESS_BANNER, type HumorPhrase } from './humor';
import { SCENE_H, SCENE_W, STATIONS, type Station } from './stations';
import {
  Binder,
  Cable,
  CameraKit,
  CircuitBoard,
  Desk,
  Keyboard,
  Monitor,
  Mug,
  PartsBin,
  Plant,
  Schematic,
  ServerRack,
  SolderingStation,
  StickyNotes,
} from './props';

/**
 * The visual Forge Floor scene: a 1600 x 900 stylized command-center lab.
 * Decorative (aria-hidden): every operational fact is in the HTML panels and
 * the station hotspots, never only in the art.
 */
const MONO = 'JetBrains Mono Variable, monospace';

function Place({ st, children }: { st: Station; children: ReactNode }) {
  return (
    <g transform={`translate(${st.x} ${st.y}) scale(${st.s})`} data-station={st.id}>
      <g className="vf-idle">{children}</g>
    </g>
  );
}

function Character({ st, mode }: { st: Station; mode: VisualMode }) {
  if (st.kind === 'scientist')
    return (
      <Place st={st}>
        <CrownTopScientist {...st.look} />
      </Place>
    );
  if (st.kind === 'bandit')
    return (
      <Place st={st}>
        <SnowWolfBandit {...st.look} />
      </Place>
    );
  return (
    <Place st={st}>
      <BabyGhost
        {...st.look}
        mood={mode === 'accomplished' ? 'cheer' : mode === 'red-alert' ? 'alarm' : 'calm'}
      />
    </Place>
  );
}

/** A set-dressing phrase. Only phrases from the approved pool can render. */
function Humor({ phrase, children }: { phrase: HumorPhrase; children: ReactNode }) {
  return <g data-humor={phrase}>{children}</g>;
}

const byId = (id: string) => STATIONS.find((s) => s.id === id)!;

/* ------------------------------ set pieces ------------------------------ */

function Defs() {
  return (
    <defs>
      <linearGradient id="vf-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#05070d" />
        <stop offset="1" stopColor="#0b1020" />
      </linearGradient>
      <linearGradient id="vf-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0a0f1d" />
        <stop offset="1" stopColor="#03050a" />
      </linearGradient>
      <linearGradient id="vf-bench" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1a2233" />
        <stop offset="1" stopColor="#070a12" />
      </linearGradient>
      <linearGradient id="vf-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff3b0" />
        <stop offset="0.5" stopColor="#facc15" />
        <stop offset="1" stopColor="#a16207" />
      </linearGradient>
      <radialGradient id="vf-dais" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#4c1d95" stopOpacity="0.55" />
        <stop offset="1" stopColor="#0b1020" stopOpacity="0" />
      </radialGradient>
      <filter id="vf-neon" x="-20%" y="-40%" width="140%" height="180%">
        <feGaussianBlur stdDeviation="3.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="vf-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.6" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <pattern id="vf-pcb" width="120" height="80" patternUnits="userSpaceOnUse">
        <path
          d="M0 20 H40 L52 32 H120 M10 60 H70 L80 50 H120 M30 0 V14 M90 80 V60"
          stroke="#155e75"
          strokeWidth="1"
          fill="none"
        />
        <circle cx="40" cy="20" r="2" fill="#22d3ee" opacity="0.6" />
        <circle cx="70" cy="60" r="2" fill="#a3e635" opacity="0.5" />
        <circle cx="90" cy="60" r="1.6" fill="#d946ef" opacity="0.5" />
      </pattern>
    </defs>
  );
}

function BackWall() {
  return (
    <g>
      <rect x="0" y="0" width={SCENE_W} height="440" fill="url(#vf-wall)" />
      <rect x="0" y="0" width={SCENE_W} height="440" fill="url(#vf-pcb)" opacity="0.5" />
      {/* ceiling light strips */}
      <g opacity="0.8">
        <rect x="120" y="0" width="1360" height="6" fill="#0e7490" opacity="0.35" />
        <rect x="320" y="10" width="960" height="2" fill="#a5f3fc" opacity="0.4" />
      </g>
      {/* structural pillars with neon strips */}
      {[400, 1200].map((x) => (
        <g key={x}>
          <rect x={x - 14} y="0" width="28" height="440" fill="#0a0e18" stroke="#1e293b" />
          <rect
            x={x - 2}
            y="20"
            width="4"
            height="400"
            fill={x < 800 ? '#d946ef' : '#22d3ee'}
            opacity="0.7"
            filter="url(#vf-soft)"
          />
        </g>
      ))}
      {/* glowing wall traces (pulse) */}
      <g fill="none" strokeWidth="2" className="vf-pulse">
        <path d="M410 330 H520 L560 290 H640" stroke="#a3e635" />
        <path d="M1190 330 H1080 L1040 290 H960" stroke="#22d3ee" />
        <path d="M410 380 H600 L630 410 H760" stroke="#d946ef" opacity="0.7" />
        <path d="M1190 380 H1000 L970 410 H840" stroke="#a3e635" opacity="0.7" />
      </g>
      {/* floor/wall junction */}
      <rect x="0" y="432" width={SCENE_W} height="10" fill="#0e1424" />
      <path d="M0 440 H1600" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6" />
    </g>
  );
}

/** Large circuit skull / ghost motif embedded in the wall architecture. */
function CircuitSkull({ mode }: { mode: VisualMode }) {
  const tone = mode === 'red-alert' ? '#f43f5e' : mode === 'accomplished' ? '#a3e635' : '#8b5cf6';
  return (
    <g transform="translate(800 268) scale(1.12)" opacity="0.95">
      <g stroke={tone} strokeWidth="2.2" fill="none" filter="url(#vf-soft)">
        {/* cranium */}
        <path d="M-150 30 Q-160 -110 0 -122 Q160 -110 150 30 Q148 70 112 88 L104 128 H-104 L-112 88 Q-148 70 -150 30 Z" />
        {/* eye sockets */}
        <path d="M-96 -6 Q-60 -40 -24 -6 Q-30 34 -64 36 Q-98 34 -96 -6 Z" />
        <path d="M96 -6 Q60 -40 24 -6 Q30 34 64 36 Q98 34 96 -6 Z" />
        {/* nose */}
        <path d="M0 30 L-16 66 H16 Z" />
        {/* teeth */}
        <path d="M-80 104 H80 M-60 88 V128 M-30 88 V128 M0 88 V128 M30 88 V128 M60 88 V128" />
      </g>
      {/* circuitry inside */}
      <g stroke={tone} strokeWidth="1" fill="none" opacity="0.65" className="vf-pulse">
        <path d="M-140 -20 H-110 L-96 -40 V-80 H-40 L-20 -100" />
        <path d="M140 -20 H110 L96 -40 V-80 H40 L20 -100" />
        <path d="M-130 60 H-90 L-70 76 H-40" />
        <path d="M130 60 H90 L70 76 H40" />
        <path d="M0 -122 V-60 L-12 -48 V10" />
      </g>
      <g fill="#ecfeff">
        <circle cx="-60" cy="2" r="9" fill={tone} opacity="0.35" className="vf-node" />
        <circle cx="60" cy="2" r="9" fill={tone} opacity="0.35" className="vf-node" />
        <circle cx="-60" cy="2" r="3.4" />
        <circle cx="60" cy="2" r="3.4" />
        {[
          [-96, -80],
          [96, -80],
          [-20, -100],
          [20, -100],
          [-40, 76],
          [40, 76],
          [-12, 10],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill={tone} />
        ))}
      </g>
      {/* ghost circuitry halo */}
      <path
        d="M-190 120 Q-200 -170 0 -178 Q200 -170 190 120"
        stroke="#22d3ee"
        strokeWidth="1"
        fill="none"
        opacity="0.35"
        strokeDasharray="6 8"
      />
    </g>
  );
}

function Sign() {
  return (
    <g>
      <rect
        x="560"
        y="24"
        width="480"
        height="128"
        rx="10"
        fill="#060a14"
        stroke="#1e3a5f"
        strokeWidth="2"
      />
      <rect
        x="566"
        y="30"
        width="468"
        height="116"
        rx="7"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1"
        opacity="0.5"
      />
      <text
        x="800"
        y="78"
        textAnchor="middle"
        fontSize="40"
        fontWeight="800"
        letterSpacing="6"
        fill="#e0fbff"
        stroke="#22d3ee"
        strokeWidth="0.8"
        fontFamily={MONO}
        filter="url(#vf-neon)"
      >
        ASSEMBLY NEXUS
      </text>
      <text
        x="800"
        y="132"
        textAnchor="middle"
        fontSize="46"
        fontWeight="800"
        letterSpacing="8"
        fill="#d9f99d"
        stroke="#a3e635"
        strokeWidth="1"
        fontFamily={MONO}
        filter="url(#vf-neon)"
      >
        FORGE FLOOR
      </text>
      <text x="584" y="146" fontSize="11" fontWeight="700" fill="#a78bfa" fontFamily={MONO}>
        A•N
      </text>
      <text
        x="1016"
        y="146"
        textAnchor="end"
        fontSize="11"
        fontWeight="700"
        fill="#a78bfa"
        fontFamily={MONO}
      >
        07
      </text>
    </g>
  );
}

function CrownMark({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M-24 12 L-20 -10 L-9 2 L0 -16 L9 2 L20 -10 L24 12 Z"
        fill="url(#vf-gold)"
        stroke="#713f12"
        strokeWidth="1"
      />
      <rect x="-24" y="12" width="48" height="6" rx="1.5" fill="url(#vf-gold)" />
      <circle cx="0" cy="-16" r="3" fill="#a3e635" />
      <circle cx="-20" cy="-10" r="2.4" fill="#22d3ee" />
      <circle cx="20" cy="-10" r="2.4" fill="#d946ef" />
    </g>
  );
}

/** Symbolic Founder command position: no human likeness. */
function FounderCommand({ mode }: { mode: VisualMode }) {
  const rim = mode === 'red-alert' ? '#f43f5e' : mode === 'accomplished' ? '#a3e635' : '#d946ef';
  return (
    <g>
      <ellipse cx="800" cy="556" rx="210" ry="46" fill="url(#vf-dais)" />
      <ellipse
        cx="800"
        cy="548"
        rx="170"
        ry="32"
        fill="#0b1020"
        stroke={rim}
        strokeWidth="2"
        filter="url(#vf-soft)"
      />
      <ellipse
        cx="800"
        cy="540"
        rx="130"
        ry="22"
        fill="#0e1428"
        stroke="#22d3ee"
        strokeWidth="1.2"
        opacity="0.9"
      />
      <ellipse
        cx="800"
        cy="534"
        rx="96"
        ry="15"
        fill="none"
        stroke="#a3e635"
        strokeWidth="1"
        strokeDasharray="4 6"
        className="vf-spin"
      />
      {/* throne back */}
      <path
        d="M734 520 L728 360 Q728 330 760 326 L840 326 Q872 330 872 360 L866 520 Z"
        fill="#0d1222"
        stroke={rim}
        strokeWidth="2.4"
        filter="url(#vf-soft)"
      />
      <path
        d="M752 500 L748 372 Q748 350 770 348 L830 348 Q852 350 852 372 L848 500 Z"
        fill="#141a30"
        stroke="#22d3ee"
        strokeWidth="1"
      />
      <g stroke="#a3e635" strokeWidth="1.2" fill="none" opacity="0.8" className="vf-pulse">
        <path d="M800 360 V420 L780 440 V490" />
        <path d="M800 420 L820 440 V490" />
      </g>
      <circle cx="800" cy="420" r="4" fill="#a3e635" />
      {/* seat + arms */}
      <rect x="740" y="478" width="120" height="26" rx="6" fill="#1b2340" stroke="#334155" />
      <rect
        x="716"
        y="452"
        width="26"
        height="62"
        rx="6"
        fill="#111833"
        stroke={rim}
        strokeWidth="1.4"
      />
      <rect
        x="858"
        y="452"
        width="26"
        height="62"
        rx="6"
        fill="#111833"
        stroke={rim}
        strokeWidth="1.4"
      />
      <CrownMark x={800} y={306} s={1.2} />
      {/* plate */}
      <rect
        x="738"
        y="560"
        width="124"
        height="22"
        rx="4"
        fill="#070b16"
        stroke="#facc15"
        strokeWidth="1"
      />
      <text
        x="800"
        y="575"
        textAnchor="middle"
        fontSize="11"
        fontWeight="800"
        letterSpacing="1.5"
        fill="#fde68a"
        fontFamily={MONO}
      >
        FOUNDER #0007
      </text>
    </g>
  );
}

function Floor() {
  const vanish = { x: 800, y: 300 };
  return (
    <g>
      <rect x="0" y="440" width={SCENE_W} height="460" fill="url(#vf-floor)" />
      <g stroke="#14304a" strokeWidth="1" opacity="0.7">
        {Array.from({ length: 17 }, (_, i) => {
          const x = -200 + i * 125;
          return <path key={i} d={`M${vanish.x + (x - vanish.x) * 0.36} 440 L${x} 900`} />;
        })}
        {[470, 510, 570, 650, 760].map((y) => (
          <path key={y} d={`M0 ${y} H1600`} />
        ))}
      </g>
      {/* glowing floor PCB traces */}
      <g fill="none" strokeWidth="2.4" className="vf-pulse">
        <path d="M800 590 V640 L700 700 H520 L470 740" stroke="#a3e635" opacity="0.7" />
        <path d="M800 590 V640 L900 700 H1080 L1130 740" stroke="#22d3ee" opacity="0.7" />
        <path d="M600 600 L420 640 H260" stroke="#d946ef" opacity="0.55" />
        <path d="M1000 600 L1180 640 H1340" stroke="#d946ef" opacity="0.55" />
      </g>
      <g>
        {[
          [470, 740, '#a3e635'],
          [1130, 740, '#22d3ee'],
          [260, 640, '#d946ef'],
          [1340, 640, '#d946ef'],
        ].map(([x, y, c]) => (
          <circle
            key={`${x}${y}`}
            cx={x as number}
            cy={y as number}
            r="4"
            fill={c as string}
            className="vf-node"
          />
        ))}
      </g>
      {/* wolf paw prints (Snow Wolf mischief) */}
      <g fill="#e2e8f0" opacity="0.18">
        {[
          [700, 770],
          [730, 752],
          [760, 768],
          [790, 750],
        ].map(([x, y]) => (
          <g key={`${x}${y}`} transform={`translate(${x} ${y})`}>
            <ellipse cx="0" cy="3" rx="4" ry="3" />
            <circle cx="-4" cy="-2" r="1.4" />
            <circle cx="0" cy="-3.4" r="1.4" />
            <circle cx="4" cy="-2" r="1.4" />
          </g>
        ))}
      </g>
    </g>
  );
}

function WorkflowStrip() {
  const steps = ['BUILD', 'TEST', 'REVIEW', 'CERTIFY', 'DEPLOY'];
  return (
    <g>
      {steps.map((s, i) => {
        const x = 446 + i * 146;
        const locked = s === 'DEPLOY';
        return (
          <g key={s}>
            <rect
              x={x}
              y="610"
              width="118"
              height="22"
              rx="4"
              fill="#060a14"
              stroke={locked ? '#64748b' : '#22d3ee'}
              strokeWidth="1"
              opacity="0.95"
            />
            <text
              x={x + 59}
              y="625"
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              letterSpacing="2"
              fill={locked ? '#94a3b8' : '#a5f3fc'}
              fontFamily={MONO}
            >
              {locked ? 'DEPLOY · LOCKED' : s}
            </text>
            {i < steps.length - 1 && (
              <path d={`M${x + 120} 621 h22`} stroke="#a3e635" strokeWidth="1.4" />
            )}
          </g>
        );
      })}
    </g>
  );
}

function WallNotes() {
  return (
    <g>
      {/* handwritten note */}
      <g transform="rotate(-3 520 240)">
        <rect x="430" y="196" width="184" height="62" fill="#ecfccb" opacity="0.92" />
        <rect x="502" y="190" width="40" height="10" fill="#94a3b8" opacity="0.6" />
        <text
          x="440"
          y="222"
          fontSize="13"
          fill="#1e293b"
          fontFamily="Inter Variable, sans-serif"
          fontStyle="italic"
          fontWeight="600"
        >
          Adapt by choice,
        </text>
        <text
          x="440"
          y="242"
          fontSize="13"
          fill="#1e293b"
          fontFamily="Inter Variable, sans-serif"
          fontStyle="italic"
          fontWeight="600"
        >
          not by force.
        </text>
      </g>
      {/* neon wall phrase */}
      <g filter="url(#vf-soft)" fontFamily={MONO} fontWeight="700" letterSpacing="1.5">
        <text x="1090" y="186" textAnchor="middle" fontSize="13" fill="#f0abfc">
          One Mind.
        </text>
        <text x="1090" y="204" textAnchor="middle" fontSize="13" fill="#f0abfc">
          One Memory.
        </text>
        <text x="1090" y="222" textAnchor="middle" fontSize="13" fill="#f0abfc">
          One Mission.
        </text>
        <text x="1090" y="244" textAnchor="middle" fontSize="12" fill="#67e8f9">
          Many Hearts and Voices.
        </text>
      </g>
    </g>
  );
}

function BinderShelf() {
  const binders: [string, string][] = [
    ['CONSTITUTION', '#facc15'],
    ['ARCHITECTURE', '#22d3ee'],
    ['MISSIONS', '#a3e635'],
    ['RESEARCH', '#a78bfa'],
    ['IDEAS', '#f0abfc'],
    ['NOTES', '#e2e8f0'],
  ];
  return (
    <g>
      <rect x="1004" y="352" width="170" height="6" fill="#1e293b" />
      {binders.map(([label, tone], i) => (
        <Binder key={label} x={1010 + i * 26} y={288} label={label} tone={tone} />
      ))}
      <text
        x="1160"
        y="284"
        textAnchor="end"
        fontSize="10"
        fill="#a78bfa"
        fontFamily={MONO}
        opacity="0.8"
      >
        #0007
      </text>
    </g>
  );
}

function Desks() {
  return (
    <g>
      {/* left bay: monitors behind the crew; a Baby Ghost peeks over one */}
      <g transform="translate(626 270) scale(0.44)">
        <BabyGhost pose="peek" mark={false} />
      </g>
      <Monitor x={428} y={300} w={150} h={84} variant="graph" />
      <Monitor x={596} y={316} w={110} h={68} variant="code" tone="#a78bfa" />
      <Humor phrase="PAWFECT.">
        <g transform="translate(546 372) rotate(-8)">
          <rect x="-4" y="-9" width="50" height="14" rx="7" fill="#facc15" />
          <text
            x="21"
            y="1.6"
            textAnchor="middle"
            fontSize="8"
            fontWeight="800"
            fill="#1e1b4b"
            fontFamily={MONO}
          >
            PAWFECT.
          </text>
        </g>
      </Humor>
      {/* right bay */}
      <Monitor x={896} y={316} w={110} h={68} variant="schematic" />
      <Monitor x={1020} y={300} w={150} h={84} variant="map" tone="#a3e635" />
    </g>
  );
}

function DeskFronts() {
  return (
    <g>
      <Desk x={410} y={560} w={300} />
      <Keyboard x={470} y={552} />
      <Keyboard x={600} y={552} />
      <Mug x={660} y={540} />
      <Schematic x={420} y={540} w={40} h={22} rot={-6} />
      <StickyNotes x={540} y={536} />
      <Desk x={890} y={560} w={300} />
      <Keyboard x={950} y={552} />
      <Keyboard x={1090} y={552} />
      <Mug x={910} y={540} tone="#22d3ee" />
      <CircuitBoard x={1010} y={536} w={50} h={26} rot={4} />
    </g>
  );
}

function LeftInfrastructure() {
  return (
    <g>
      <ServerRack x={14} y={360} h={300} />
      <ServerRack x={104} y={400} h={250} />
      {/* small console for the Bandit */}
      <rect x="132" y="632" width="96" height="40" rx="4" fill="#111a29" stroke="#2c3a52" />
      <rect x="140" y="638" width="80" height="18" rx="2" fill="#050a12" />
      <rect
        x="144"
        y="642"
        width="56"
        height="3"
        fill="#a3e635"
        opacity="0.7"
        className="vf-flicker"
      />
      <rect x="144" y="648" width="40" height="3" fill="#22d3ee" opacity="0.6" />
      <Cable d="M90 660 C120 700 220 690 240 720" tone="#d946ef" />
    </g>
  );
}

function RightInfrastructure() {
  return (
    <g>
      <ServerRack x={1500} y={520} h={250} />
      <Cable d="M1500 600 C1460 640 1430 620 1400 660" tone="#22d3ee" />
      <Cable d="M1500 640 C1470 700 1420 690 1390 700" tone="#a3e635" />
      <Plant x={1460} y={800} s={1.2} />
    </g>
  );
}

function ForegroundBench() {
  return (
    <g>
      <path d="M0 800 L1600 800 L1600 900 L0 900 Z" fill="url(#vf-bench)" />
      <path d="M0 800 H1600" stroke="#a3e635" strokeWidth="1.6" opacity="0.6" />
      <CircuitBoard x={300} y={812} w={80} h={46} rot={-4} />
      <SolderingStation x={420} y={826} />
      <PartsBin x={716} y={834} />
      <CameraKit x={1040} y={830} />
      <CircuitBoard x={1150} y={820} w={70} h={40} rot={6} />
      <Mug x={1240} y={834} tone="#f0abfc" />
      <StickyNotes x={1290} y={826} />
      <Plant x={120} y={812} s={1.15} />
      <g fill="#94a3b8">
        <rect x="800" y="850" width="60" height="5" rx="2" />
        <rect x="870" y="846" width="8" height="18" rx="2" fill="#22d3ee" />
      </g>
      {/* Ghost Company mark */}
      <g transform="translate(960 860)" opacity="0.9">
        <path
          d="M-10 8 Q-10 -12 0 -12 Q10 -12 10 8 L6 4 L2 8 L-2 4 L-6 8 Z"
          fill="none"
          stroke="#a5f3fc"
          strokeWidth="1.4"
        />
        <circle cx="-3" cy="-3" r="1.4" fill="#a5f3fc" />
        <circle cx="3" cy="-3" r="1.4" fill="#a5f3fc" />
        <text x="16" y="4" fontSize="9" fill="#a5f3fc" fontFamily={MONO} fontWeight="700">
          07
        </text>
      </g>
    </g>
  );
}

/** Crown-Top lab banner, hung between the pillar and the sign. */
function BoldnessBanner() {
  return (
    <g data-banner="boldness">
      <path d="M432 0 V26 M548 0 V26" stroke="#475569" strokeWidth="1.2" />
      <path
        d="M420 26 H560 V150 L490 168 L420 150 Z"
        fill="#0f1a2e"
        stroke="#a3e635"
        strokeWidth="1.4"
      />
      <path
        d="M426 32 H554 V146 L490 162 L426 146 Z"
        fill="none"
        stroke="#a3e635"
        strokeWidth="0.6"
        opacity="0.5"
      />
      <g transform="translate(490 52)">
        {/* crown-top emblem: a dome with side hair and a crown */}
        <path d="M-12 8 Q-12 -8 0 -8 Q12 -8 12 8" fill="#e2e8f0" />
        <path
          d="M-12 2 Q-14 8 -10 12 M12 2 Q14 8 10 12"
          stroke="#64748b"
          strokeWidth="2.4"
          fill="none"
        />
        <path d="M-7 -10 L-5 -17 L-2 -13 L0 -19 L2 -13 L5 -17 L7 -10 Z" fill="#facc15" />
      </g>
      <g fontFamily={MONO} fontWeight="800" textAnchor="middle" fill="#ecfccb">
        <text x="490" y="84" fontSize="11.5">
          WITH BOLDNESS
        </text>
        <text x="490" y="99" fontSize="11.5">
          COMES
        </text>
        <text x="490" y="114" fontSize="11.5" fill="#a3e635">
          INTELLIGENCE.
        </text>
      </g>
      <g
        fontFamily="Inter Variable, sans-serif"
        textAnchor="middle"
        fill="#94a3b8"
        fontStyle="italic"
      >
        <text x="490" y="130" fontSize="7.4">
          {BOLDNESS_BANNER.subline}
        </text>
        <text x="490" y="141" fontSize="6.4">
          {BOLDNESS_BANNER.credit}
        </text>
      </g>
      <title>{BOLDNESS_BANNER.title}</title>
    </g>
  );
}

/** The Snow Wolf Crew DJ station (the DJ stands behind it). */
function DjDeck() {
  return (
    <g>
      <rect x="270" y="556" width="138" height="44" rx="4" fill="#111a29" stroke="#6d28d9" />
      <ellipse cx="298" cy="563" rx="20" ry="6" fill="#0b0f16" stroke="#22d3ee" strokeWidth="1" />
      <ellipse cx="380" cy="563" rx="20" ry="6" fill="#0b0f16" stroke="#d946ef" strokeWidth="1" />
      <rect x="325" y="558" width="28" height="10" rx="1.5" fill="#1e293b" />
      <g fill="#a3e635">
        <rect x="329" y="561" width="2" height="5" className="vf-blink" />
        <rect x="335" y="560" width="2" height="6" />
        <rect x="341" y="562" width="2" height="4" className="vf-blink" />
        <rect x="347" y="559" width="2" height="7" />
      </g>
      <Humor phrase="NEVER CHASE. ALWAYS CHEW.">
        <g fontFamily={MONO} fontWeight="800" fontSize="8" textAnchor="middle">
          <text x="339" y="583" fill="#f0abfc">
            NEVER CHASE.
          </text>
          <text x="339" y="594" fill="#67e8f9">
            ALWAYS CHEW.
          </text>
        </g>
      </Humor>
    </g>
  );
}

/** Crew sign on the right server rack. */
function PawSquadSign() {
  return (
    <Humor phrase="PAW SQUAD. HIGH RISK. NO APOLOGIES.">
      <g transform="translate(1506 606)">
        <rect width="76" height="40" rx="3" fill="#1c1917" stroke="#facc15" strokeWidth="1.2" />
        <g fontFamily={MONO} fontWeight="800" fontSize="7.4" textAnchor="middle">
          <text x="38" y="12" fill="#facc15">
            PAW SQUAD.
          </text>
          <text x="38" y="23" fill="#f8fafc">
            HIGH RISK.
          </text>
          <text x="38" y="34" fill="#f8fafc">
            NO APOLOGIES.
          </text>
        </g>
      </g>
    </Humor>
  );
}

/** Bench chalkboard and the milk bone jar: the case of the missing Milk Bone. */
function MilkBoneCase() {
  return (
    <g>
      <Humor phrase="TODAY'S MISSION: WHO ATE THE LAST MILK BONE?">
        <g transform="translate(540 810) rotate(-2)">
          <rect width="164" height="74" rx="3" fill="#7c4a24" />
          <rect x="5" y="5" width="154" height="64" rx="2" fill="#1f3326" />
          <g fontFamily={MONO} fontWeight="800" textAnchor="middle">
            <text x="82" y="22" fontSize="9" fill="#a3e635">
              TODAY&apos;S MISSION:
            </text>
            <text x="82" y="40" fontSize="10.5" fill="#f1f5f9">
              WHO ATE THE LAST
            </text>
            <text x="82" y="56" fontSize="10.5" fill="#f1f5f9">
              MILK BONE?
            </text>
          </g>
          <path d="M18 62 q6 -3 12 0" stroke="#f1f5f9" strokeWidth="1" fill="none" opacity="0.5" />
        </g>
      </Humor>
      <Humor phrase="BONE APPÉTIT.">
        <g transform="translate(866 750)">
          <rect
            x="0"
            y="6"
            width="54"
            height="46"
            rx="6"
            fill="rgba(186,230,253,0.18)"
            stroke="#bae6fd"
            strokeWidth="1.2"
          />
          <rect x="4" y="0" width="46" height="8" rx="2" fill="#475569" />
          <g fill="#f5e6c8">
            <rect x="8" y="38" width="18" height="5" rx="2" transform="rotate(-12 17 40)" />
            <rect x="26" y="40" width="18" height="5" rx="2" transform="rotate(10 35 42)" />
          </g>
          <rect x="4" y="18" width="46" height="13" rx="2" fill="#f8fafc" />
          <text
            x="27"
            y="27.6"
            textAnchor="middle"
            fontSize="6.4"
            fontWeight="800"
            fill="#1e1b4b"
            fontFamily={MONO}
          >
            BONE APPÉTIT.
          </text>
        </g>
      </Humor>
    </g>
  );
}

/** A dim red wash and beacons, only in red-alert mode. */
function AlertWash({ mode }: { mode: VisualMode }) {
  if (mode === 'red-alert')
    return (
      <g>
        <rect width={SCENE_W} height={SCENE_H} fill="#7f1d1d" opacity="0.16" />
        <circle cx="430" cy="16" r="10" fill="#f43f5e" className="vf-beacon" />
        <circle cx="1170" cy="16" r="10" fill="#f43f5e" className="vf-beacon" />
      </g>
    );
  if (mode === 'accomplished')
    return <rect width={SCENE_W} height={SCENE_H} fill="#365314" opacity="0.1" />;
  return null;
}

/**
 * The full scene. Memoized: it re-renders only when the mode changes, never on
 * clock ticks or data updates (the HTML panels carry those).
 */
export const ForgeScene = memo(function ForgeScene({ mode }: { mode: VisualMode }) {
  return (
    <svg
      className="vf-scene"
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      data-mode={mode}
    >
      <Defs />
      <BackWall />
      <CircuitSkull mode={mode} />
      <Sign />
      <BoldnessBanner />
      <WallNotes />
      <BinderShelf />
      <Desks />
      <Floor />
      <WorkflowStrip />
      <LeftInfrastructure />
      <RightInfrastructure />
      <PawSquadSign />
      <FounderCommand mode={mode} />
      <Character st={byId('wisp-1')} mode={mode} />
      {['sci-1', 'sci-2', 'sci-3', 'sci-4', 'ban-6'].map((id) => (
        <Character key={id} st={byId(id)} mode={mode} />
      ))}
      <DjDeck />
      <DeskFronts />
      {/* front row, back to front */}
      {['ban-1', 'ban-7', 'ban-2', 'ban-8', 'ban-5', 'sci-6', 'sci-7', 'sci-8', 'sci-5'].map(
        (id) => (
          <Character key={id} st={byId(id)} mode={mode} />
        ),
      )}
      <ForegroundBench />
      <MilkBoneCase />
      {/* on the bench */}
      {['ban-4', 'wisp-2', 'ban-3'].map((id) => (
        <Character key={id} st={byId(id)} mode={mode} />
      ))}
      <AlertWash mode={mode} />
    </svg>
  );
});
