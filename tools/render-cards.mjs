// Render the deploy card images (16:9 cover + 1:1 icon) from tools/card.html, on-brand and free.
const _pw = await import(process.env.PW_PATH || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const base = process.env.URL || 'http://localhost:8099/tools/card.html';
const browser = await chromium.launch();

async function shot(mode, w, h, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`${base}?mode=${mode}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log('wrote', out, `${w}x${h}`);
}

await shot('thumb', 1280, 720, 'tools/card-thumb.png');
await shot('icon', 512, 512, 'tools/card-icon.png');
await browser.close();
