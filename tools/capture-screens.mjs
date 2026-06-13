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
  for (let i = 0; i < 7; i++) { const p = g.tower.at(-1); g.active.x = p.x + (i % 3 ? 5 : 0); g.drop(); }
  // force a miss to end
  g.active.x = g.W - g.active.w; g.drop();
  if (g.state !== 'over') { g.active.x = g.tower.at(-1).x + 300; g.drop(); }
});
await page.waitForTimeout(120);
await page.screenshot({ path: 'tools/shot-gameover.png' });

// Paused screen
await page.evaluate(() => { window.__app.startRun(false); for (let i=0;i<3;i++){const g=window.__app.game,p=g.tower.at(-1);g.active.x=p.x;g.drop();} window.__app.pauseGame(); });
await page.waitForTimeout(100);
await page.screenshot({ path: 'tools/shot-paused.png' });

await browser.close();
console.log('captured gameover + paused');
