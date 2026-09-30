import { chromium } from '@playwright/test';
const out =
  '/tmp/claude-0/-home-user-ASSEMBLY-NEXUS-FORGE-FLOOR-DASHBOARD/cd9ef5b9-3dfb-5d0e-9b9d-b83c96b16f38/scratchpad/shot3';
const b = await chromium.launch();
const errors = [];
for (const j of process.argv.slice(2)) {
  const [route, w, h] = j.split('@');
  const ctx = await b.newContext({ viewport: { width: +w, height: +h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(route + ': ' + e));
  page.on('console', (m) => m.type() === 'error' && errors.push(route + ': ' + m.text()));
  await page.goto('http://localhost:4173/#' + route);
  await page.getByRole('navigation', { name: 'Primary' }).waitFor();
  const p = page.getByRole('button', { name: 'Pause simulation' });
  if (await p.isVisible()) await p.click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: out + '/' + (route.replace(/\W+/g, '_') || 'root') + '_' + w + '.png',
  });
  await ctx.close();
}
console.log('errors', JSON.stringify(errors));
await b.close();
