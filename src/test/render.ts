import { screen, waitFor } from '@testing-library/react';

/** Wait until the shell and the (lazy) route surface have rendered. */
export async function waitForSurface(): Promise<void> {
  // Language-independent: the primary nav is the shell's only navigation landmark.
  await screen.findByRole('navigation');
  await waitFor(
    () => {
      if (!document.querySelector('[data-surface="ready"]')) throw new Error('surface not ready');
    },
    { timeout: 5000 },
  );
}
