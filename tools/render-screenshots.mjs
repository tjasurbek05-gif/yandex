// Render clean gameplay screenshots for the Yandex draft (no dev overlay, no system UI — §8.3.4).
// Real gameplay in three palettes + the title. Output: dist/screenshots/*.png
const _pw = await import(process.env.PW_PATH || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
import { mkdir } from 'node:fs/promises';
await mkdir('dist/screenshots', { recursive: true });

const browser = await chromium.launch();

async function shot(theme, blocks, out) {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8099/?dev=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__app && window.__app.screen === 'title');
  await page.evaluate(([themeId, n]) => {
    const a = window.__app, g = a.game;
    window.__store.setTheme(themeId);    // the 3D renderer reads the theme from the store
    a.startRun(false);
    for (let i = 0; i < n && g.state === 'playing'; i++) {
      const p = g.tower.at(-1), ax = g.active.axis;     // align on the active sliding axis
      g.active[ax] = p[ax] + (i % 4 === 3 ? 1.0 : 0);    // mostly perfect, occasional sliver
      g.drop();
    }
    a.hintT = 0;                          // no first-timer hint in marketing shots
    for (let f = 0; f < 80; f++) g.update(1 / 60); // settle camera + let slices fall away
  }, [theme, blocks]);
  await page.waitForTimeout(120);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 540, height: 960 } });
  await page.close();
  console.log('wrote', out);
}

await shot('spectrum', 11, 'dist/screenshots/play-spectrum.png');
await shot('sunset', 13, 'dist/screenshots/play-sunset.png');
await shot('ocean', 9, 'dist/screenshots/play-ocean.png');

// Title screen
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
await page.waitForTimeout(250);
await page.screenshot({ path: 'dist/screenshots/title.png', clip: { x: 0, y: 0, width: 540, height: 960 } });
await page.close();
console.log('wrote dist/screenshots/title.png');

await browser.close();
