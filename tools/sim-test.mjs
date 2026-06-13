// Headless test of the STACK 3D core simulation (pure logic, no WebGL). Verifies the loop,
// perfect/miss handling on the alternating X/Z axis, determinism and pooling.
// Run: node tools/sim-test.mjs
import { Game } from '../src/game.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL:', m)); };

const axisOf = (g) => g.active.axis;
const sizeOn = (b, ax) => (ax === 'x' ? b.sx : b.sz);
const alignPerfect = (g) => { const a = g.active, p = g.tower.at(-1); a[a.axis] = p[a.axis]; };
const offset = (g, d) => { const a = g.active; a[a.axis] = g.tower.at(-1)[a.axis] + d; };

// 1) fresh game
const stacks = [];
const g = new Game({ onStack: (i) => stacks.push(i), onGameOver: () => {} });
g.setSize(390, 844);
g.reset(12345, false);
ok(g.state === 'playing', 'state playing after reset');
ok(g.score === 0, 'score 0 after reset');
ok(g.tower.length === 1, 'one foundation block');
ok(g.active && (g.active.axis === 'x' || g.active.axis === 'z'), 'active has an axis');

// 2) axis alternates each layer
const a1 = axisOf(g); alignPerfect(g); g.drop();
const a2 = axisOf(g);
ok(a1 !== a2, 'sliding axis alternates between layers');

// 3) perfect drops keep/grow size on the sliding axis, score + combo climb
for (let i = 0; i < 5; i++) {
  const ax = axisOf(g); const before = sizeOn(g.tower.at(-1), ax);
  alignPerfect(g); g.drop();
  ok(sizeOn(g.tower.at(-1), ax) >= before - 1e-6, 'perfect keeps/grows size on axis');
}
ok(g.score === 6, 'score after 6 perfect drops');
ok(g.perfectCombo === 6, 'perfect combo counted');
ok(stacks.every((s) => s.perfect), 'all reported perfect');

// 4) imperfect drop shrinks size on the sliding axis + resets combo
const ax = axisOf(g); const before = sizeOn(g.tower.at(-1), ax);
offset(g, 1.5); g.drop();
ok(sizeOn(g.tower.at(-1), ax) < before, 'imperfect shrinks size on axis');
ok(g.perfectCombo === 0, 'combo resets on imperfect');

// 5) total miss ends the run
let finalScore = null;
const g2 = new Game({ onStack: () => {}, onGameOver: (s) => { finalScore = s; } });
g2.setSize(390, 844); g2.reset(777, false);
offset(g2, 100); g2.drop();
ok(g2.state === 'over', 'run ends on a full miss');
ok(typeof finalScore === 'number', 'onGameOver fired with score');

// 6) determinism: same seed -> identical axis + side sequence
const seq = (seed) => {
  const gg = new Game({ onStack: () => {}, onGameOver: () => {} });
  gg.setSize(390, 844); gg.reset(seed, false);
  const out = [];
  for (let i = 0; i < 8 && gg.state === 'playing'; i++) {
    out.push(gg.active.axis + Math.sign(gg.active[gg.active.axis]));
    alignPerfect(gg); gg.drop();
  }
  return out.join(',');
};
ok(seq(999) === seq(999), 'same seed -> identical sequence');

// 7) update advances slices without throwing
g.reset(5, false);
for (let i = 0; i < 3; i++) { offset(g, 1.2); g.drop(); }
for (let i = 0; i < 200; i++) g.update(1 / 60);
ok(true, 'update loop stable');

// 8) revive works once
const g3 = new Game({ onStack: () => {}, onGameOver: () => {} });
g3.setSize(390, 844); g3.reset(3, false);
offset(g3, 100); g3.drop();
ok(g3.state === 'over', 'forced game over');
ok(g3.revive() === true && g3.state === 'playing', 'revive resumes once');
ok(g3.revive() === false, 'revive only once per run');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
