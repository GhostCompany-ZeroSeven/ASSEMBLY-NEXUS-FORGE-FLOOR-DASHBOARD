import { parseCheckpoint, type Checkpoint } from '@/domain/checkpoint';

/**
 * Browser storage for the "last looked" checkpoint. Local to this browser and
 * this viewer; it is a view aid, never shared state and never authority.
 */
export const LAST_VIEW_KEY = 'forge-floor:last-view';

/**
 * - `none`: nothing stored (first visit, or cleared)
 * - `ok`: a valid checkpoint was loaded
 * - `rejected`: something was stored but failed validation and was ignored
 * - `unavailable`: browser storage could not be read or written
 */
export type LastViewStorage = 'none' | 'ok' | 'rejected' | 'unavailable';

export function loadCheckpoint(nowMs: number): {
  checkpoint: Checkpoint | null;
  storage: LastViewStorage;
} {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LAST_VIEW_KEY);
  } catch {
    return { checkpoint: null, storage: 'unavailable' };
  }
  if (raw === null) return { checkpoint: null, storage: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { checkpoint: null, storage: 'rejected' };
  }
  const checkpoint = parseCheckpoint(parsed, nowMs);
  return checkpoint ? { checkpoint, storage: 'ok' } : { checkpoint: null, storage: 'rejected' };
}

/** Returns false when storage refused the write (quota, privacy mode). */
export function saveCheckpoint(cp: Checkpoint): boolean {
  try {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(cp));
    return true;
  } catch {
    return false;
  }
}

export function clearCheckpoint(): boolean {
  try {
    localStorage.removeItem(LAST_VIEW_KEY);
    return true;
  } catch {
    return false;
  }
}
