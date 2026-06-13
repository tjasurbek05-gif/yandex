// STACK core — deterministic 3D simulation (pure logic, NO WebGL/DOM, so it runs headlessly).
// The tower is a stack of boxes; each new block slides along an axis that alternates X / Z (the
// classic 3D Stack). Rendering lives in scene3d.js, which reads this state. Audio is here so
// feedback is frame-tight.
import { mulberry32 } from './rng.js';
import { audio } from './audio.js';

// --- frozen metrics (world units; BLOCK_H = 1) ---
const BLOCK_H = 1;
const BASE = 8;          // base block size on X and Z
const RANGE = 9;         // how far the active block travels from centre (can fully miss)
const MIN_OVERLAP = 0.05;
const SPEED_START = 4.0;  // units/s
const SPEED_STEP = 0.18;  // per stacked block
const SPEED_MAX = 14.0;
const EPS = 0.2;          // |offset| within this = perfect
const REGROW = 0.4;       // size returned on a perfect (capped at BASE)
const CAM_LERP = 0.1;
const GRAVITY = 22;       // units/s^2 for falling slices
const POOL = 48;

const makeSlice = () => ({
  live: false, gold: false, colorIndex: 0,
  x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1,
  vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, rvx: 0, rvy: 0, rvz: 0,
});

export class Game {
  constructor(events = {}) {
    this.events = events;          // { onStack({perfect,combo,coins}), onGameOver(score,isDaily) }
    this.W = 360; this.H = 640;
    this.gen = 0;                  // bumped on reset so the renderer can detect a fresh tower
    this.slices = Array.from({ length: POOL }, makeSlice);
    this.reset(1, false);
  }

  setSize(w, h) {
    this.W = w; this.H = h;
    if (this.active) {             // keep the moving block on its rail after a resize
      this.active.x = Math.max(-RANGE, Math.min(RANGE, this.active.x));
      this.active.z = Math.max(-RANGE, Math.min(RANGE, this.active.z));
    }
  }

  setTheme(id) { this.themeId = id; } // colors are resolved by the renderer from this id

  reset(seed, isDaily) {
    this.rng = mulberry32(seed >>> 0);
    this.isDaily = !!isDaily;
    this.gen++;
    this.state = 'playing';
    this.score = 0;
    this.perfectCombo = 0;
    this.bestCombo = 0;
    this.revived = false;
    this.flash = 0;
    this.perfectTextT = 0;
    this.tower = [{ x: 0, z: 0, sx: BASE, sz: BASE, colorIndex: 0 }];
    this.slices.forEach((s) => (s.live = false));
    this._spawnActive();
    this.camTargetY = this._activeCenterY();
  }

  _activeCenterY() { return (this.tower.length + 0.5) * BLOCK_H; }

  _spawnActive() {
    const layer = this.tower.length;
    const prev = this.tower[layer - 1];
    const axis = layer % 2 === 1 ? 'x' : 'z';       // alternate the sliding axis each layer
    const side = this.rng() < 0.5 ? -1 : 1;
    this.active = {
      axis, x: prev.x, z: prev.z, sx: prev.sx, sz: prev.sz,
      dir: -side, speed: Math.min(SPEED_MAX, SPEED_START + this.score * SPEED_STEP),
      colorIndex: prev.colorIndex + 1, layer,
    };
    if (axis === 'x') this.active.x = side * RANGE; else this.active.z = side * RANGE;
    this.canDrop = true;
  }

  // The single player action.
  drop() {
    if (this.state !== 'playing' || !this.canDrop) return;
    this.canDrop = false;
    const a = this.active;
    const prev = this.tower[this.tower.length - 1];
    const axis = a.axis;                      // 'x' or 'z'
    const ac = a[axis], pc = prev[axis];      // centres on the sliding axis
    const as = axis === 'x' ? a.sx : a.sz;    // active size on the sliding axis
    const ps = axis === 'x' ? prev.sx : prev.sz;
    const overlapLo = Math.max(ac - as / 2, pc - ps / 2);
    const overlapHi = Math.min(ac + as / 2, pc + ps / 2);
    const overlap = overlapHi - overlapLo;
    const yTop = this._activeCenterY();

    if (overlap <= MIN_OVERLAP) {             // total miss — the block tumbles off, run ends
      this._spawnSlice(a.x, yTop, a.z, a.sx, BLOCK_H, a.sz, a.colorIndex, false,
        axis === 'x' ? Math.sign(ac - pc) * 5 : 0, 1, axis === 'z' ? Math.sign(ac - pc) * 5 : 0);
      audio.over();
      this._gameOver();
      return;
    }

    const delta = ac - pc;
    let newC, newS;
    if (Math.abs(delta) <= EPS) {             // PERFECT — snap, regrow a touch, reward
      newC = pc;
      newS = Math.min(Math.max(as, ps) + REGROW, BASE);
      this.perfectCombo++;
      this.bestCombo = Math.max(this.bestCombo, this.perfectCombo);
      this.flash = 1; this.perfectTextT = 0.8;
      this._burst(axis === 'x' ? pc : a.x, yTop, axis === 'z' ? pc : a.z);
      audio.perfect(this.perfectCombo);
    } else {                                  // imperfect — keep overlap, slice the overhang off
      newC = (overlapLo + overlapHi) / 2;
      newS = overlap;
      const overhang = as - overlap;
      const sideSign = Math.sign(delta);
      const ohCenter = sideSign > 0 ? overlapHi + overhang / 2 : overlapLo - overhang / 2;
      if (axis === 'x') {
        this._spawnSlice(ohCenter, yTop, a.z, overhang, BLOCK_H, a.sz, a.colorIndex, false,
          sideSign * (2 + this.rng() * 2), 2 + this.rng() * 2, 0);
      } else {
        this._spawnSlice(a.x, yTop, ohCenter, a.sx, BLOCK_H, overhang, a.colorIndex, false,
          0, 2 + this.rng() * 2, sideSign * (2 + this.rng() * 2));
      }
      this.perfectCombo = 0;
      audio.slice(); audio.drop();
    }

    // place the block (write back the new centre + size on the sliding axis)
    const placed = { x: a.x, z: a.z, sx: a.sx, sz: a.sz, colorIndex: a.colorIndex };
    if (axis === 'x') { placed.x = newC; placed.sx = newS; }
    else { placed.z = newC; placed.sz = newS; }
    this.tower.push(placed);
    this.score++;
    const coins = 1 + (this.perfectCombo > 0 ? 2 * Math.min(this.perfectCombo, 5) : 0);
    this.events.onStack?.({ perfect: this.perfectCombo > 0, combo: this.perfectCombo, coins });

    if (newS <= MIN_OVERLAP) { audio.over(); this._gameOver(); return; }
    this._spawnActive();
  }

  _gameOver() { this.state = 'over'; this.events.onGameOver?.(this.score, this.isDaily); }

  // Rewarded-ad revive: widen the top block and resume at the same height (once per run).
  revive() {
    if (this.state !== 'over' || this.revived) return false;
    this.revived = true;
    const top = this.tower[this.tower.length - 1];
    top.sx = Math.max(top.sx, BASE * 0.55);
    top.sz = Math.max(top.sz, BASE * 0.55);
    this.perfectCombo = 0;
    this.state = 'playing';
    this._spawnActive();
    return true;
  }

  _spawnSlice(x, y, z, sx, sy, sz, colorIndex, gold, vx, vy, vz) {
    if (sx <= 0 || sz <= 0) return;
    const s = this.slices.find((p) => !p.live) || this.slices[0];
    s.live = true; s.gold = gold; s.colorIndex = colorIndex;
    s.x = x; s.y = y; s.z = z; s.sx = sx; s.sy = sy; s.sz = sz;
    s.vx = vx; s.vy = vy; s.vz = vz;
    s.rx = 0; s.ry = 0; s.rz = 0;
    s.rvx = (this.rng() - 0.5) * 5; s.rvy = (this.rng() - 0.5) * 5; s.rvz = (this.rng() - 0.5) * 5;
  }

  _burst(x, y, z) {
    for (let i = 0; i < 8; i++) {
      const ang = this.rng() * Math.PI * 2, sp = 3 + this.rng() * 4;
      this._spawnSlice(x, y, z, 0.28, 0.28, 0.28, -1, true,
        Math.cos(ang) * sp, 3 + this.rng() * 4, Math.sin(ang) * sp);
    }
  }

  update(dt) {
    // camera eases toward the active block's height (also after game over, so the tower settles)
    this.camTargetY += (this._activeCenterY() - this.camTargetY) * CAM_LERP;

    if (this.state === 'playing') {
      const a = this.active;
      const c = a.axis === 'x' ? 'x' : 'z';
      a[c] += a.dir * a.speed * dt;
      if (a[c] <= -RANGE) { a[c] = -RANGE; a.dir = 1; }
      else if (a[c] >= RANGE) { a[c] = RANGE; a.dir = -1; }
    }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    if (this.perfectTextT > 0) this.perfectTextT -= dt;

    for (const s of this.slices) {
      if (!s.live) continue;
      s.vy -= GRAVITY * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.rx += s.rvx * dt; s.ry += s.rvy * dt; s.rz += s.rvz * dt;
      if (s.y < this.camTargetY - 30) s.live = false;
    }
  }

  // Geometry the renderer needs.
  activeLayer() { return this.tower.length; }
  RANGE() { return RANGE; }
  BASE() { return BASE; }
}

export { BLOCK_H, BASE };
