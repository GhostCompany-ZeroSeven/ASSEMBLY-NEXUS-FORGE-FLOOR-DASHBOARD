import type { WorkerState } from '@/domain/types';
import type { WolfAppearance } from './types';

/**
 * Snow Wolf crew placeholder. Reserved identity — intentionally simple until
 * production art for the Snow Wolf crew exists.
 */
export function WolfFigure({
  appearance: a,
  state,
}: {
  appearance: WolfAppearance;
  state: WorkerState;
}) {
  const happy = state === 'COMPLETE';
  const sleepy = state === 'IDLE';
  return (
    <g>
      <ellipse cx="32" cy="77" rx="15" ry="3" fill="rgba(0,0,0,0.35)" />
      <rect x="25" y="64" width="5" height="12" rx="2" fill="#0f172a" />
      <rect x="34" y="64" width="5" height="12" rx="2" fill="#0f172a" />
      {/* jacket */}
      <path d="M18 46 Q18 39 26 38 L38 38 Q46 39 46 46 L48 68 Q32 71 16 68 Z" fill={a.coat} />
      <path d="M26 38 L32 48 L38 38" stroke={a.accent} strokeWidth="1.5" fill="none" />
      <path d="M22 52 L27 49 L32 52 L27 55 Z" fill={a.accent} opacity="0.8" />
      <path
        d="M19 45 Q14 54 17 61"
        stroke={a.coat}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M45 45 Q50 53 47 59"
        stroke={a.coat}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="17.5" cy="62" r="2.6" fill={a.fur} />
      <circle cx="47" cy="60" r="2.6" fill={a.fur} />
      {/* ears */}
      <path d="M19 16 L20 1 L29 11 Z" fill={a.fur} />
      <path d="M45 16 L44 1 L35 11 Z" fill={a.fur} />
      <path d="M21 13 L21.5 5 L26.5 10.5 Z" fill="#94a3b8" />
      <path d="M43 13 L42.5 5 L37.5 10.5 Z" fill="#94a3b8" />
      {/* head */}
      <path
        d="M17 22 Q17 8 32 8 Q47 8 47 22 Q47 32 40 36 L32 40 L24 36 Q17 32 17 22 Z"
        fill={a.fur}
      />
      <path d="M26 26 Q32 23 38 26 L36 36 L32 39 L28 36 Z" fill="#f8fafc" />
      <ellipse cx="32" cy="30" rx="2.6" ry="1.8" fill="#0f172a" />
      {sleepy ? (
        <g stroke="#0f172a" strokeWidth="1.4" strokeLinecap="round">
          <path d="M23.5 21 L28 21" />
          <path d="M36 21 L40.5 21" />
        </g>
      ) : happy ? (
        <g stroke="#0f172a" strokeWidth="1.4" fill="none" strokeLinecap="round">
          <path d="M23.5 21.5 Q26 19 28.5 21.5" />
          <path d="M35.5 21.5 Q38 19 40.5 21.5" />
        </g>
      ) : (
        <g>
          <ellipse cx="26" cy="20.5" rx="2.4" ry="2" fill={a.accent} />
          <ellipse cx="38" cy="20.5" rx="2.4" ry="2" fill={a.accent} />
          <circle cx="26" cy="20.5" r="1" fill="#0f172a" />
          <circle cx="38" cy="20.5" r="1" fill="#0f172a" />
        </g>
      )}
    </g>
  );
}
