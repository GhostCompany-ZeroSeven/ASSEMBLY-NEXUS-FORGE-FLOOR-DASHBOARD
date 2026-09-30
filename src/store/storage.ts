/**
 * Defensive browser-storage access shared by the local view checkpoints.
 * Storage is untrusted input: it can be missing, throw (privacy mode, quota),
 * be corrupted, huge, or written by another version of the dashboard.
 */
export type StoredRead =
  | { kind: 'none' }
  | { kind: 'unavailable' }
  | { kind: 'too-large' }
  | { kind: 'malformed' }
  | { kind: 'value'; value: unknown };

/** Read and JSON-parse a key, refusing payloads over `maxChars` before parsing. */
export function readStoredJson(key: string, maxChars: number): StoredRead {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { kind: 'unavailable' };
  }
  if (raw === null) return { kind: 'none' };
  if (raw.length > maxChars) return { kind: 'too-large' };
  try {
    return { kind: 'value', value: JSON.parse(raw) as unknown };
  } catch {
    return { kind: 'malformed' };
  }
}

/** Returns false when storage refused the write (quota, privacy mode). */
export function writeStoredJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
