/**
 * Whether the diagnostic pseudo-locale was requested for this page load. Read
 * from the page URL's search string (before the `#`), so it survives in-app
 * navigation but is never stored.
 */
export function pseudoRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('pseudo') === '1';
  } catch {
    return false;
  }
}
