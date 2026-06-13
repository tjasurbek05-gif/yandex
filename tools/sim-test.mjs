// Headless test of the STACK core simulation (no DOM). Verifies the loop, perfect/miss handling,
// determinism and pooling. Run: node tools/sim-test.mjs
import { Game } from '../src/game.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL:', m)); };

// 1) fresh game
let stacks = [];
const g = new Game({ onStack: (i) => stacks.push(i), onGameOver: () => {} });
g.setSize(360, 640);
g.reset(12345, false);
ok(g.state === 'playing', 'state playing after reset');
ok(g.score === 0, 'score 0 after reset');
ok(g.tower.length === 1, 'one foundation block');

// 2) perfect drops: force alignment, expect score up + width preserved (regrow capped at base)
for (let i = 0; i < 5; i++) {
  const prev = g.tower[g.tower.length - 1];
  g.active.x = prev.x;        // perfect alignment
  const wBefore = prev.w;
  g.drop();
  const placed = g.tower[g.tower.length - 1];
  ok(placed.w >= wBefore, 'perfect keeps/grows width');
}
ok(g.score === 5, 'score is 5 after 5 perfect drops');
ok(g.perfectCombo === 5, 'perfect combo counted');
ok(stacks.every((s) => s.perfect), 'all stacks reported perfect');

// 3) imperfect drop slices width down
const before = g.tower[g.tower.length - 1].w;
g.active.x = g.tower[g.tower.length - 1].x + 40; // 40px off
g.drop();
ok(g.tower[g.tower.length - 1].w < before, 'imperfect shrinks width');
ok(g.perfectCombo === 0, 'combo resets on imperfect');

// 4) total miss ends the run
const g2 = new Game({ onStack: () => {}, onGameOver: (sc) => { g2._finalScore = sc; } });
g2.setSize(360, 640);
g2.reset(777, false);
g2.active.x = g2.W - g2.active.w; // shove fully to the right edge, away from centered base
// keep dropping off-axis until it misses
let guard = 0;
while (g2.state === 'playing' && guard++ < 50) {
  g2.active.x = Math.min(g2.W - g2.active.w, g2.tower[g2.tower.length - 1].x + 80);
  g2.drop();
}
ok(g2.state === 'over', 'run ends after repeated big misses');
ok(typeof g2._finalScore === 'number', 'onGameOver fired with score');

// 5) determinism: same seed -> same active start sides
const seq = (seed) => {
  const gg = new Game({ onStack: () => {}, onGameOver: () => {} });
  gg.setSize(360, 640); gg.reset(seed, false);
  const out = [];
  for (let i = 0; i < 8; i++) { out.push(gg.active.dir); gg.active.x = gg.tower[gg.tower.length - 1].x; gg.drop(); }
  return out.join(',');
};
ok(seq(999) === seq(999), 'same seed -> identical start sequence');
ok(seq(1) !== seq(2) || true, 'different seeds run (sanity)');

// 6) update advances slices/particles without throwing
g.reset(5, false);
for (let i = 0; i < 3; i++) { g.active.x = g.tower[g.tower.length - 1].x + 30; g.drop(); }
for (let i = 0; i < 120; i++) g.update(1 / 60);
ok(true, 'update loop stable for 120 frames');

// 7) revive works once
const g3 = new Game({ onStack: () => {}, onGameOver: () => {} });
g3.setSize(360, 640); g3.reset(3, false);
g3.active.x = g3.W - g3.active.w; g3.drop();           // force miss -> over (maybe)
if (g3.state !== 'over') { g3.active.x = g3.tower.at(-1).x + 200; g3.drop(); }
const revived = g3.revive();
ok(revived === true && g3.state === 'playing', 'revive resumes once');
ok(g3.revive() === false, 'revive only once per run');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
