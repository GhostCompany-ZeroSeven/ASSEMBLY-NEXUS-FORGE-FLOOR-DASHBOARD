import type { Mission } from './types';

/**
 * Lifetime mission ordinal: the creation-order number an AUTHORITATIVE mission
 * store assigns once, when a mission is created. The first mission of a fresh
 * store is 0, the next 1, and so on; a number never changes with the
 * mission's status and is never reused, even when a mission is cancelled,
 * archived or deleted. Reading a mission's number therefore tells roughly how
 * many missions that installation has created.
 *
 * The dashboard only DISPLAYS ordinals. It never derives one: not from an
 * array index, a count, a sort position or a timestamp. A mission whose source
 * reports no trustworthy ordinal has an UNKNOWN number and is shown by the
 * identifier its source gave it.
 *
 * MISSION ORDINAL ≠ active count ≠ completed count ≠ readiness ≠ worker count
 * ≠ approval number ≠ execution id ≠ certification id.
 */

export interface MissionNumbering {
  /** Display prefix / ecosystem namespace, e.g. `AN-`. Empty by default. */
  prefix: string;
  /** Minimum digits; a minimum width, never a capacity (10000 stays 10000). */
  minDigits: number;
}

export const DEFAULT_MISSION_NUMBERING: MissionNumbering = { prefix: '', minDigits: 4 };

export function resolveNumbering(n?: Partial<MissionNumbering>): MissionNumbering {
  const minDigits = n?.minDigits;
  return {
    prefix: n?.prefix ?? DEFAULT_MISSION_NUMBERING.prefix,
    minDigits:
      Number.isSafeInteger(minDigits) && minDigits! >= 1
        ? minDigits!
        : DEFAULT_MISSION_NUMBERING.minDigits,
  };
}

/** A trustworthy ordinal: a non-negative safe integer. Anything else is unknown. */
export function isOrdinal(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** Zero-padded to the minimum width; no rollover, no modulo. */
export function formatOrdinal(n: number, minDigits = DEFAULT_MISSION_NUMBERING.minDigits): string {
  if (!isOrdinal(n)) throw new RangeError(`Not a mission ordinal: ${String(n)}`);
  return String(n).padStart(minDigits, '0');
}

/** The mission's number with its prefix, or null when the source reported none. */
export function missionNumber(
  m: Pick<Mission, 'ordinal'>,
  numbering: MissionNumbering = DEFAULT_MISSION_NUMBERING,
): string | null {
  return isOrdinal(m.ordinal)
    ? numbering.prefix + formatOrdinal(m.ordinal, numbering.minDigits)
    : null;
}

/**
 * How a mission is referred to on every surface: its number when the source
 * reported one, otherwise the identifier the source gave it (never invented).
 */
export function missionLabel(
  m: Pick<Mission, 'id' | 'ordinal'>,
  numbering: MissionNumbering = DEFAULT_MISSION_NUMBERING,
): string {
  return missionNumber(m, numbering) ?? m.id;
}
