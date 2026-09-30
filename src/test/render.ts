import { screen, waitFor } from '@testing-library/react';

/** Wait until the shell and the (lazy) route surface have rendered. */
export async function waitForSurface(): Promise<void> {
  await screen.findByRole('navigation', { name: 'Primary' });
  await waitFor(
    () => {
      if (!document.querySelector('[data-surface="ready"]')) throw new Error('surface not ready');
    },
    { timeout: 5000 },
  );
}
