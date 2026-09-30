/**
 * Defence in depth for links taken from data. Adapters already keep only
 * http(s) artifact links; the UI re-checks so a future adapter cannot slip a
 * `javascript:` (or any other scheme) into an href.
 */
export function safeExternalHref(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  try {
    const u = new URL(uri);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
