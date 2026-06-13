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

// A single pointer tap must drop exactly once. Align the block over the base first (so the drop
// counts); a double-fire would drop again on the freshly-spawned edge block -> miss -> game over,
// so "delta 1 AND still playing AND a perfect" proves exactly one drop fired.
await page.evaluate(() => { const g = window.__app.game, a = g.active; a[a.axis] = g.tower.at(-1)[a.axis]; });
const before = await score();
await page.mouse.click(195, 500); // center-ish, clear of HUD buttons
await page.waitForTimeout(80);
const after = await score();
const st = await screen();
const combo = await page.evaluate(() => window.__app.game.perfectCombo);
log.push(`single tap: delta=${after - before}, screen=${st}, combo=${combo} (expect 1, playing, 1)`);
if (after - before !== 1 || st !== 'playing' || combo !== 1) { console.log('FAIL: tap not exactly one drop'); process.exitCode = 1; }

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
  for (let i = 0; i < 11 && g.state === 'playing'; i++) {
    const p = g.tower.at(-1), ax = g.active.axis;       // align on the active sliding axis
    g.active[ax] = p[ax] + (i % 4 === 3 ? 1.2 : 0);      // mostly perfect, occasional sliver
    g.drop();
  }
  return g.tower.length;
});
const hasGL = await page.evaluate(() => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('webgl2')); }
  catch (_) { return false; }
});
await page.waitForTimeout(140);
await page.screenshot({ path: 'tools/shot-play.png' });
log.push('mid-play screen: ' + (await screen()) + ', tower height ' + towerH + ', webgl ' + hasGL);

// On every loss a SKIPPABLE interstitial must be requested; Revive uses the rewarded (unskippable)
// video, not the interstitial. Spy on both and force a clean game-over.
const ads = await page.evaluate(async () => {
  const p = window.__platform, a = window.__app, g = a.game;
  let inter = 0, rewarded = 0;
  const oi = p.showInterstitial.bind(p); p.showInterstitial = async () => { inter++; return oi(); };
  const orw = p.showRewarded.bind(p); p.showRewarded = async () => { rewarded++; return orw(); };
  a.startRun(false);
  const ax = g.active.axis; g.active[ax] = g.tower.at(-1)[ax] + 100; g.drop(); // total miss -> game over
  await new Promise((r) => setTimeout(r, 950)); // wait past the 700ms on-death timer
  return { inter, rewarded, screen: a.screen };
});
log.push(`on-loss interstitial=${ads.inter} rewarded=${ads.rewarded} screen=${ads.screen} (expect inter>=1, rewarded 0)`);
if (ads.inter < 1 || ads.rewarded !== 0) { console.log('FAIL: loss-ad behavior wrong'); process.exitCode = 1; }

await browser.close();

console.log(log.join('\n'));
if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nno console/page errors');
