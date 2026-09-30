import {
  CHECKPOINT_VERSION,
  parseCheckpoint,
  storedVersion,
  type Checkpoint,
} from '@/domain/checkpoint';
import { readStoredJson, removeStored, writeStoredJson } from './storage';

/**
 * Browser storage for the "last looked" checkpoint. Local to this browser and
 * this viewer; it is a view aid, never shared state and never authority.
 */
export const LAST_VIEW_KEY = 'forge-floor:last-view';
/** Larger than any valid checkpoint (bounded maps + watermark); refused before parsing. */
export const MAX_LAST_VIEW_CHARS = 512 * 1024;

/**
 * - `none`: nothing stored (first visit, or cleared)
 * - `ok`: a valid checkpoint was loaded
 * - `outdated`: a checkpoint from an older (or newer) schema version was discarded
 * - `rejected`: something was stored but failed validation and was ignored
 * - `unavailable`: browser storage could not be read or written
 */
export type LastViewStorage = 'none' | 'ok' | 'outdated' | 'rejected' | 'unavailable';

export function loadCheckpoint(nowMs: number): {
  checkpoint: Checkpoint | null;
  storage: LastViewStorage;
} {
  const r = readStoredJson(LAST_VIEW_KEY, MAX_LAST_VIEW_CHARS);
  if (r.kind === 'none') return { checkpoint: null, storage: 'none' };
  if (r.kind === 'unavailable') return { checkpoint: null, storage: 'unavailable' };
  if (r.kind !== 'value') return { checkpoint: null, storage: 'rejected' };
  const checkpoint = parseCheckpoint(r.value, nowMs);
  if (checkpoint) return { checkpoint, storage: 'ok' };
  const v = storedVersion(r.value);
  return {
    checkpoint: null,
    storage: v !== undefined && v !== CHECKPOINT_VERSION ? 'outdated' : 'rejected',
  };
}

/** Returns false when storage refused the write (quota, privacy mode). */
export function saveCheckpoint(cp: Checkpoint): boolean {
  return writeStoredJson(LAST_VIEW_KEY, cp);
}

export function clearCheckpoint(): boolean {
  return removeStored(LAST_VIEW_KEY);
}
