// Capture the game-over (monetization) and paused screens for visual review.
const _pw = await import(process.env.PW_PATH || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8099/?dev=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__app && window.__app.screen === 'title');

// Build a tower, then force a clean game-over with some run coins + a fake new best.
await page.evaluate(() => {
  const a = window.__app, g = a.game;
  a.startRun(false);
  for (let i = 0; i < 7; i++) { const p = g.tower.at(-1), ax = g.active.axis; g.active[ax] = p[ax] + (i % 3 ? 0.8 : 0); g.drop(); }
  // force a total miss to end the run
  { const ax = g.active.axis; g.active[ax] = g.tower.at(-1)[ax] + 100; g.drop(); }
});
await page.waitForTimeout(120);
await page.screenshot({ path: 'tools/shot-gameover.png' });

// Paused screen
await page.evaluate(() => { const g = window.__app.game; window.__app.startRun(false); for (let i=0;i<3;i++){const p=g.tower.at(-1),ax=g.active.axis;g.active[ax]=p[ax];g.drop();} window.__app.pauseGame(); });
await page.waitForTimeout(100);
await page.screenshot({ path: 'tools/shot-paused.png' });

await browser.close();
console.log('captured gameover + paused');
