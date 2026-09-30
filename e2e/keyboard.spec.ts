import { expect, test } from '@playwright/test';
import { openPaused } from './helpers';

test('skip link is first and moves focus to main content', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('navigation', { name: 'Primary' }).waitFor();
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('focused controls show a visible focus indicator', async ({ page }) => {
  await openPaused(page, '/approvals');
  const btn = page
    .getByRole('group', { name: 'Decide APR-031' })
    .getByRole('button', { name: /approve/i });
  await btn.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const outline = await btn.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});

test('approval gate is fully operable by keyboard', async ({ page }) => {
  await openPaused(page, '/approvals');
  const gate = page.getByRole('group', { name: 'Decide APR-031' });
  await gate.getByRole('button', { name: /hold/i }).focus();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('button', { name: 'Confirm Hold / Review' });
  await expect(confirm).toBeVisible();
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('On hold').first()).toBeVisible();
});

test('palette: Ctrl+K opens, focus is trapped, Esc restores focus', async ({ page }) => {
  await openPaused(page, '/');
  const trigger = page.getByRole('button', { name: /Commands/ });
  await trigger.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Search commands/ })).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(inside).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('palette: navigate to a mission by keyboard', async ({ page }) => {
  await openPaused(page, '/');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('AN-0142');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/missions\/AN-0142$/);
  await expect(page.locator('#main')).toBeFocused();
});

test('G-sequences navigate and Escape leaves worker focus', async ({ page }) => {
  await openPaused(page, '/');
  await page.keyboard.press('g');
  await page.keyboard.press('a');
  await expect(page).toHaveURL(/#\/approvals$/);
  await page.goto('/#/workers/w-ada');
  await page.getByRole('heading', { level: 1, name: 'Ada Sprocket' }).waitFor();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/workers$/);
});

test('reduced motion disables animation and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPaused(page, '/floor');
  const token = page.locator('.token').first();
  const styles = await token.evaluate((el) => {
    const fig = el.querySelector('.token__figure')!;
    return {
      anim: getComputedStyle(fig).animationName,
      trans: getComputedStyle(el).transitionDuration,
    };
  });
  expect(styles.anim).toBe('none');
  expect(styles.trans).toMatch(/^0s/);
});
