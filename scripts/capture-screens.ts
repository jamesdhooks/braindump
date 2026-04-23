#!/usr/bin/env node
/**
 * Screenshot capture script. Depends on `playwright` (install as devDep if you run this).
 * Launches the dev server, points a headless Chromium at the renderer, and snaps docs/screenshots/*.png.
 *
 *   npm i -D playwright
 *   npm run dev &      # or start the vite server separately
 *   npx tsx scripts/capture-screens.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(__dirname, '../docs/screenshots');

const SHOTS = [
  { name: 'overview', path: '/', viewport: { width: 1440, height: 900 } },
  { name: 'composer-target', path: '/#composer-target', viewport: { width: 1440, height: 900 } },
  { name: 'pinned', path: '/#pinned', viewport: { width: 1440, height: 900 } },
  { name: 'ramble', path: '/#ramble', viewport: { width: 1440, height: 900 } },
  { name: 'brainstorm', path: '/#brainstorm', viewport: { width: 1440, height: 900 } },
  { name: 'settings-llm', path: '/#settings-llm', viewport: { width: 1440, height: 900 } }
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch {
    console.error('playwright is not installed. Run `npm i -D playwright` and re-run.');
    process.exit(1);
  }
  const browser = await pw.chromium.launch();
  const base = process.env.BRAINDUMP_SCREENS_URL ?? 'http://localhost:5173';
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ viewport: s.viewport });
    const page = await ctx.newPage();
    await page.goto(base + s.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`), fullPage: false });
    await ctx.close();
    console.log(`saved ${s.name}.png`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
