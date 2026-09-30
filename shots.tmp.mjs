import { chromium } from '@playwright/test';
const out =
  '/tmp/claude-0/-home-user-ASSEMBLY-NEXUS-FORGE-FLOOR-DASHBOARD/cd9ef5b9-3dfb-5d0e-9b9d-b83c96b16f38/scratchpad/shot2';
import fs from 'node:fs';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const jobs = process.argv.slice(2);
for (const j of jobs) {
  const [route, w, h, full] = j.split('@');
  const ctx = await b.newContext({ viewport: { width: +w, height: +h } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/#' + route);
  await page.getByRole('navigation', { name: 'Primary' }).waitFor();
  const p = page.getByRole('button', { name: 'Pause simulation' });
  if (await p.isVisible()) await p.click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: out + '/' + (route.replace(/\W+/g, '_') || 'root') + '_' + w + '.png',
    fullPage: full === 'full',
  });
  await ctx.close();
}
await b.close();
