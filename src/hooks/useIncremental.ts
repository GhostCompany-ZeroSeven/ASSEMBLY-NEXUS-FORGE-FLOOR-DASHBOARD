import { useState } from 'react';

/**
 * Render long lists in pages ("Show more") so thousands of records never mount at
 * once. Returns the visible slice plus a control descriptor.
 */
export function useIncremental<T>(items: readonly T[], pageSize = 50) {
  const [limit, setLimit] = useState(pageSize);
  const visible = items.slice(0, limit);
  return {
    visible,
    hidden: Math.max(0, items.length - limit),
    showMore: () => setLimit((n) => n + pageSize),
    reset: () => setLimit(pageSize),
  };
}
