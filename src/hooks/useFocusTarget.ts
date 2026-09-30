import { useEffect } from 'react';
import { useHashQuery } from '@/app/router';

/**
 * Deep-link focus: when the hash query has `?focus=<id>`, scroll the element
 * with `data-focus-id="<id>"` into view, move keyboard focus to it, and mark it
 * briefly so sighted users see where they landed.
 */
export function useFocusTarget(ready = true): string | undefined {
  const { focus } = useHashQuery();
  useEffect(() => {
    if (!focus || !ready) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>('[data-focus-id]')).find(
      (n) => n.getAttribute('data-focus-id') === focus,
    );
    if (!el) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.scrollIntoView?.({ block: 'center' });
    el.focus({ preventScroll: true });
    el.setAttribute('data-targeted', 'true');
    const t = setTimeout(() => el.removeAttribute('data-targeted'), 2500);
    return () => clearTimeout(t);
  }, [focus, ready]);
  return focus;
}
