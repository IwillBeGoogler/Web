// Visual QA: node scripts/screenshots.ts   (npm run qa:screenshots)
// Needs the dev server (URL, default http://localhost:5180/) and a local Chrome (CHROME_PATH to override).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL_ = process.env.URL ?? 'http://localhost:5180/';
const OUT = process.env.OUT ?? 'screenshots';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const sizes = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;
let problems = 0;

for (const theme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') { const t = m.text(); if (/React Flow|\[icons\]|xyflow|attribution/i.test(t)) { problems++; console.log('CONSOLE', t.slice(0, 200)); } } });
    page.on('pageerror', (e) => { problems++; console.log('PAGEERROR', e.message); });
    await page.addInitScript((t) => localStorage.setItem('sdd:settings', JSON.stringify({ theme: t })), theme);
    // landing page ("/", WebGL hero via swiftshader): hero viewport + full page
    await page.goto(URL_, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="landing"]');
    await page.waitForFunction(() => document.querySelector('.hero-visual')?.getAttribute('data-mode') !== 'loading', null, { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(1800);
    console.log(`landing ${size}/${theme}: hero mode = ${await page.getAttribute('.hero-visual', 'data-mode')}`);
    await page.screenshot({ path: `${OUT}/landing-${size}-${theme}.png` });
    for (const [i, y] of (size === 'desktop' ? [900, 1900, 2900] : [900, 2200, 3600]).entries()) {
      await page.evaluate((top) => document.querySelector('.landing')?.scrollTo(0, top), y);
      await page.waitForTimeout(1100);
      await page.screenshot({ path: `${OUT}/landing-scroll${i + 1}-${size}-${theme}.png` });
    }
    await page.evaluate(() => document.querySelector('.landing')?.scrollTo(0, 0));
    const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (landingOverflow > 1) { problems++; console.log(`OVERFLOW landing ${size}/${theme}: ${landingOverflow}px`); }
    // projects dashboard
    await page.goto(new URL('/projects', URL_).toString(), { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/home-${size}-${theme}.png` });
    if (size === 'desktop') {
      // template -> editor, command palette
      await page.locator('button[aria-label^="Use template Monitoring — medium"]').click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/editor-${theme}.png` });
      // Data flow mode: packets on every edge (Monitoring — medium template)
      await page.keyboard.press('Shift+F');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/editor-flow-${theme}.png` });
      await page.keyboard.press('Shift+F');
      await page.keyboard.press('Meta+k');
      await page.keyboard.type('postgres');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/command-palette-${theme}.png` });
    }
    // horizontal overflow check (phone must not scroll sideways)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) { problems++; console.log(`OVERFLOW ${size}/${theme}: ${overflow}px`); }
    await ctx.close();
  }
}
// every built-in template, desktop light + dark, fitted to view (OUT/templates/<slug>-<theme>.png)
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
mkdirSync(`${OUT}/templates`, { recursive: true });
for (const theme of ['light', 'dark'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { problems++; console.log('PAGEERROR', e.message); });
  await page.addInitScript((t) => localStorage.setItem('sdd:settings', JSON.stringify({ theme: t })), theme);
  await page.goto(new URL('/projects', URL_).toString(), { waitUntil: 'networkidle' });
  const names = await page.$$eval('button[aria-label^="Use template "]', (els) => els.map((e) => (e.getAttribute('aria-label') ?? '').replace('Use template ', '')));
  for (const name of names) {
    await page.goto(new URL('/projects', URL_).toString(), { waitUntil: 'networkidle' });
    await page.locator(`button[aria-label="Use template ${name}"]`).click();
    await page.waitForSelector('.react-flow__node', { timeout: 15000 });
    await page.waitForTimeout(900);
    await page.keyboard.press('Shift+Digit1'); // zoom to fit
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/templates/${slug(name)}-${theme}.png` });
    console.log('template', name, theme);
  }
  await ctx.close();
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'screenshots OK', '->', OUT);
process.exitCode = problems ? 1 : 0;
