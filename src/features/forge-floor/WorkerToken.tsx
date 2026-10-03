import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CharacterAvatar } from '@/characters/CharacterAvatar';
import { resolvePose } from '@/characters/pose';
import { WORKER_STATE_META } from '@/domain/status';
import type { Worker } from '@/domain/types';
import { Icon } from '@/components/Icon';
import { STATE_GLYPH } from './stateGlyph';
import { useI18n } from '@/i18n/useI18n';

const WALK_MS = 1600;

/** A worker standing on the floor. The whole token is a button. */
export function WorkerToken({
  worker,
  roomId,
  roomLabel,
  selected,
  onSelect,
  size = 52,
  style,
  waitingForFounder = false,
  dimmed = false,
  related = false,
  compact = false,
}: {
  worker: Worker;
  roomId?: string;
  roomLabel?: string;
  selected: boolean;
  onSelect: (id: string) => void;
  size?: number;
  style?: CSSProperties;
  waitingForFounder?: boolean;
  /** Filtered out by the floor filter (still visible, de-emphasised). */
  dimmed?: boolean;
  /** Shares the selected worker's mission. */
  related?: boolean;
  compact?: boolean;
}) {
  const meta = WORKER_STATE_META[worker.state];
  const { m } = useI18n();
  const moving = useWalking(roomId);
  const pose = resolvePose(worker.state, { moving, waitingForFounder });
  const stateText = waitingForFounder ? m.floor.awaitingFounder : m.status.worker[worker.state];

  return (
    <button
      type="button"
      className="token"
      data-state={worker.state}
      data-tone={meta.tone}
      data-pose={pose}
      data-selected={selected || undefined}
      data-dimmed={dimmed || undefined}
      data-related={related || undefined}
      data-founder={waitingForFounder || undefined}
      style={style}
      onClick={() => onSelect(worker.id)}
      aria-pressed={selected}
      aria-label={[
        `${worker.name}, ${worker.role ?? m.common.roleUnknown}`,
        stateText,
        worker.currentMissionId ? m.floor.tokenMission(worker.currentMissionId) : undefined,
        roomLabel ? m.floor.tokenIn(roomLabel) : undefined,
        worker.currentActivity,
        dimmed ? m.floor.hiddenByFilter : undefined,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <span className="token__bubble" aria-hidden="true">
        <Icon name={STATE_GLYPH[worker.state]} size={11} />
      </span>
      {(worker.state === 'WORKING' || worker.state === 'CERTIFYING') && !moving && (
        <span className="token__sparks" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="token__figure">
        <CharacterAvatar
          characterId={worker.characterId}
          state={worker.state}
          pose={pose}
          roomId={roomId}
          size={size}
        />
      </span>
      <span className="token__plate">
        <span className="token__lamp" aria-hidden="true" />
        <span className="token__name">{worker.name.split(' ')[0]}</span>
      </span>
      {!compact && (
        <span className="token__state" aria-hidden="true">
          {stateText}
        </span>
      )}
      {typeof worker.progress === 'number' && worker.state !== 'COMPLETE' && (
        <span className="token__progress" aria-hidden="true">
          <span style={{ width: `${Math.round(worker.progress * 100)}%` }} />
        </span>
      )}
    </button>
  );
}

/** True for the duration of the walk animation after the worker changes room. */
function useWalking(roomId: string | undefined): boolean {
  const prev = useRef(roomId);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (prev.current === roomId) return;
    prev.current = roomId;
    const start = setTimeout(() => setMoving(true), 0);
    const stop = setTimeout(() => setMoving(false), WALK_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [roomId]);
  return moving;
}
