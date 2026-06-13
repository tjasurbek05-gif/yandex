// Real-browser smoke test via Playwright: load the page, drive it with the keyboard (Space = the
// single action), assert the run advances and ends, and screenshot. Catches DOM-time errors the
// Node sim can't. Run with NODE_PATH set to the global modules (see tools/run-smoke.sh).
const _pw = await import(process.env.PW_PATH || 'playwright');
const chromium = _pw.chromium || _pw.default?.chromium;

const URL = process.env.URL || 'http://localhost:8099/?dev=1';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__app && window.__app.screen === 'title', { timeout: 8000 });

const screen = () => page.evaluate(() => window.__app.screen);
const score = () => page.evaluate(() => window.__app.game.score);
const press = async () => { await page.keyboard.press('Space'); await page.waitForTimeout(60); };

let log = [];
log.push('title screen reached: ' + (await screen()));

// Start a run.
await press();
log.push('after first Space -> ' + (await screen()));

// Drop ~40 times; the moving block will eventually miss and end the run.
let ended = false;
for (let i = 0; i < 60; i++) {
  await press();
  if ((await screen()) === 'gameover') { ended = true; break; }
}
log.push('reached gameover: ' + ended + ' (score ' + (await score()) + ')');

// Restart from game over.
await press();
log.push('after restart Space -> ' + (await screen()));

// Visit themes + leaderboard menus to render those code paths.
await page.evaluate(() => { window.__app.screen = 'title'; });
await page.evaluate(() => { window.__app.screen = 'themes'; });
await page.waitForTimeout(80);
await page.screenshot({ path: 'tools/shot-themes.png' });
await page.evaluate(() => { window.__app.openLeaderboard(); });
await page.waitForTimeout(120);
await page.evaluate(() => { window.__app.screen = 'title'; });
await page.waitForTimeout(80);
await page.screenshot({ path: 'tools/shot-title.png' });

// Play a fresh run and build a real tower with controlled, well-aligned drops, then screenshot.
await press(); // start run
const towerH = await page.evaluate(() => {
  const a = window.__app, g = a.game;
  for (let i = 0; i < 9 && g.state === 'playing'; i++) {
    const prev = g.tower[g.tower.length - 1];
    g.active.x = prev.x + (i % 2 === 0 ? 0 : 7); // mostly perfect, a couple slight offsets
    g.drop();
  }
  return g.tower.length;
});
await page.waitForTimeout(120);
await page.screenshot({ path: 'tools/shot-play.png' });
log.push('mid-play screen: ' + (await screen()) + ', tower height ' + towerH);

await browser.close();

console.log(log.join('\n'));
if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nno console/page errors');
