import type { CSSProperties } from 'react';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { WORKER_STATE_META } from '@/domain/status';
import type { Worker } from '@/domain/types';

const STATE_GLYPH: Partial<Record<Worker['state'], string>> = {
  IDLE: 'z',
  WAITING: '…',
  BLOCKED: '!',
  COMPLETE: '✓',
  FAILED: '✕',
  PLANNING: '?',
  STOPPED: '■',
};

/** A worker standing on the floor. The whole token is a button. */
export function WorkerToken({
  worker,
  selected,
  onSelect,
  size = 52,
  style,
}: {
  worker: Worker;
  selected: boolean;
  onSelect: (id: string) => void;
  size?: number;
  style?: CSSProperties;
}) {
  const meta = WORKER_STATE_META[worker.state];
  const glyph = STATE_GLYPH[worker.state];
  return (
    <button
      type="button"
      className="token"
      data-state={worker.state}
      data-tone={meta.tone}
      data-selected={selected || undefined}
      style={style}
      onClick={() => onSelect(worker.id)}
      aria-pressed={selected}
      aria-label={`${worker.name}, ${worker.role}, ${meta.label}${worker.currentActivity ? `: ${worker.currentActivity}` : ''}`}
    >
      {glyph && (
        <span className="token__bubble" aria-hidden="true">
          {glyph}
        </span>
      )}
      {(worker.state === 'WORKING' || worker.state === 'CERTIFYING') && (
        <span className="token__sparks" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="token__figure">
        <CharacterAvatar characterId={worker.characterId} state={worker.state} size={size} />
      </span>
      <span className="token__plate">
        <span className="token__lamp" aria-hidden="true" />
        <span className="token__name">{worker.name.split(' ')[0]}</span>
      </span>
      {typeof worker.progress === 'number' && worker.state !== 'COMPLETE' && (
        <span className="token__progress" aria-hidden="true">
          <span style={{ width: `${Math.round(worker.progress * 100)}%` }} />
        </span>
      )}
    </button>
  );
}
