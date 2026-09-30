import type { Page } from '@playwright/test';

export const ROUTES = [
  '/',
  '/floor',
  '/missions',
  '/missions/AN-0142',
  '/missions/AN-0139',
  '/workers',
  '/workers/w-cyrus',
  '/approvals',
  '/alerts',
  '/activity',
  '/settings',
];

/** Open a route with the demo simulation paused for deterministic checks. */
export async function openPaused(page: Page, route: string): Promise<void> {
  await page.goto(`/#${route}`);
  await page.getByRole('navigation', { name: 'Primary' }).waitFor();
  const pause = page.getByRole('button', { name: 'Pause simulation' });
  if (await pause.isVisible().catch(() => false)) await pause.click();
}

/** Collects console errors and uncaught exceptions for the page's lifetime. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
