import { useId } from 'react';
import type { WorkerState } from '@/domain/types';
import { useConfig } from '@/store/hooks';
import { ScientistFigure } from './ScientistFigure';
import { fallbackCharacter } from './fallback';
import type { CharacterDefinition } from './types';
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
}: {
  characterId: string;
  state: WorkerState;
  size?: number;
  /** Accessible name. Omit for decorative usage next to visible text. */
  label?: string;
  className?: string;
}) {
  const { characters } = useConfig();
  const def: CharacterDefinition = characters[characterId] ?? fallbackCharacter(characterId);
  const titleId = useId();
  const a11y = label
    ? { role: 'img' as const, 'aria-labelledby': titleId }
    : { 'aria-hidden': true as const };

  if (def.kind === 'image') {
    const src = def.stateSrc?.[state] ?? def.src;
    return (
      <img
        src={src}
        alt={label ?? ''}
        width={size}
        height={size * 1.25}
        className={className}
        data-state={state}
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
