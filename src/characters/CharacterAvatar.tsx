import { useId } from 'react';
import type { WorkerState } from '@/domain/types';
import { useConfig } from '@/store/hooks';
import { ScientistFigure } from './ScientistFigure';
import { fallbackCharacter } from './fallback';
import { resolveImageSrc, resolvePose } from './pose';
import type { CharacterDefinition, CharacterPose } from './types';
import { WolfFigure } from './WolfFigure';

/**
 * Single entry point for rendering any character. Resolves the definition
 * from config and falls back to a deterministic generated scientist, so an
 * unknown `characterId` from a new backend never breaks the floor.
 */
export function CharacterAvatar({
  characterId,
  state,
  size = 64,
  label,
  className,
  pose: poseProp,
  roomId,
}: {
  characterId: string;
  state: WorkerState;
  size?: number;
  /** Presentation pose; defaults to one derived from `state`. */
  pose?: CharacterPose;
  /** Room the character is shown in (for room-specific art). */
  roomId?: string;
  /** Accessible name. Omit for decorative usage next to visible text. */
  label?: string;
  className?: string;
}) {
  const { characters } = useConfig();
  const def: CharacterDefinition = characters[characterId] ?? fallbackCharacter(characterId);
  const pose = poseProp ?? resolvePose(state);
  const titleId = useId();
  const a11y = label
    ? { role: 'img' as const, 'aria-labelledby': titleId }
    : { 'aria-hidden': true as const };

  if (def.kind === 'image') {
    const src = resolveImageSrc(def, pose, state, roomId);
    return (
      <img
        src={src}
        alt={label ?? ''}
        width={size}
        height={size * 1.25}
        className={className}
        data-state={state}
        data-pose={pose}
        draggable={false}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 64 80"
      width={size}
      height={size * 1.25}
      className={className}
      data-state={state}
      data-pose={pose}
      {...a11y}
    >
      {label && <title id={titleId}>{label}</title>}
      {def.kind === 'procedural-wolf' ? (
        <WolfFigure appearance={def.appearance} state={state} />
      ) : (
        <ScientistFigure appearance={def.appearance} state={state} />
      )}
    </svg>
  );
}
