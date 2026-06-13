// STACK core — deterministic simulation + rendering. Logic is split from draw; all randomness comes
// from a seeded RNG. The game emits results through callbacks; the host (main.js) owns coins, best,
// leaderboard and UI. Audio + particles are handled here so feedback is frame-tight.
import { mulberry32 } from './rng.js';
import { audio } from './audio.js';
import { themeById, GOLD } from './themes.js';

// --- frozen metrics (see design/thresholds.md) ---
const BLOCK_H = 26;
const BASE_W_FRAC = 0.62;
const BASE_W_MAX = 240;
const MIN_W_GAMEOVER = 1;
const SPEED_START = 150;
const SPEED_STEP = 6;
const SPEED_MAX = 560;
const PERFECT_EPS = 4;
const PERFECT_REGROW = 6;
const ACTIVE_SCREEN_FRAC = 0.42; // active block's TOP sits this far down the screen
const CAMERA_LERP = 0.12;
const POOL = 64;

function makeSlice() { return { live: false, x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, vr: 0, rot: 0, color: '#fff' }; }
function makeParticle() { return { live: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0 }; }

export class Game {
  constructor(events = {}) {
    this.events = events;       // { onStack({perfect,combo,coins}), onGameOver(score,isDaily) }
    this.W = 360; this.H = 640;
    this.themeId = 'spectrum';
    this.slices = Array.from({ length: POOL }, makeSlice);
    this.particles = Array.from({ length: POOL * 2 }, makeParticle);
    this.reset(1, false);
  }

  setSize(w, h) { this.W = w; this.H = h; }
  setTheme(id) { this.themeId = id; }

  baseW() { return Math.min(BASE_W_MAX, this.W * BASE_W_FRAC); }

  reset(seed, isDaily) {
    this.rng = mulberry32(seed >>> 0);
    this.isDaily = !!isDaily;
    this.state = 'playing';
    this.score = 0;
    this.perfectCombo = 0;
    this.bestCombo = 0;
    this.revived = false;
    this.flash = 0;            // white perfect-flash alpha
    this.perfectTextT = 0;     // floating "PERFECT" timer
    const bw = this.baseW();
    const cx = (this.W - bw) / 2;
    this.tower = [{ x: cx, w: bw, colorIndex: 0 }];
    this.slices.forEach((s) => (s.live = false));
    this.particles.forEach((p) => (p.live = false));
    this._spawnActive(bw, 1);
    // Camera starts already framed on the active block.
    this.viewY = this._targetViewY();
  }

  _spawnActive(width, colorIndex) {
    const startLeft = this.rng() < 0.5;
    this.active = {
      x: startLeft ? 0 : this.W - width,
      w: width,
      dir: startLeft ? 1 : -1,
      speed: Math.min(SPEED_MAX, SPEED_START + this.score * SPEED_STEP),
      colorIndex,
    };
    this.canDrop = true;
  }

  // Global-Y of the TOP edge of the block currently being placed (it rests one BLOCK_H above the
  // current tower top). Blocks occupy global Y [i*BLOCK_H, (i+1)*BLOCK_H]; we draw by the top edge.
  _activeTopGlobalY() { return (this.tower.length + 1) * BLOCK_H; }

  _targetViewY() {
    // Frame the active block: its top edge lands ACTIVE_SCREEN_FRAC down the screen.
    return this._activeTopGlobalY() - this.H * (1 - ACTIVE_SCREEN_FRAC);
  }

  worldToScreenY(globalY) { return this.H - (globalY - this.viewY); }

  // The single player action.
  drop() {
    if (this.state !== 'playing' || !this.canDrop) return;
    this.canDrop = false;
    const a = this.active;
    const prev = this.tower[this.tower.length - 1];
    const overlapLeft = Math.max(a.x, prev.x);
    const overlapRight = Math.min(a.x + a.w, prev.x + prev.w);
    const overlap = overlapRight - overlapLeft;
    const dropY = this._activeTopGlobalY();

    if (overlap <= MIN_W_GAMEOVER) {
      // Whole block missed — it tumbles off and the run ends.
      this._spawnSlice(a.x, dropY, a.w, a.colorIndex, a.x + a.w / 2 < prev.x + prev.w / 2 ? -1 : 1);
      audio.over();
      this._gameOver();
      return;
    }

    const dx = a.x - prev.x;
    let newX, newW;
    if (Math.abs(dx) <= PERFECT_EPS) {
      // PERFECT — snap, regrow a little (never above base), reward + ascending chime.
      newW = Math.min(prev.w + PERFECT_REGROW, this.baseW());
      newX = prev.x - (newW - prev.w) / 2;
      newX = Math.max(0, Math.min(this.W - newW, newX));
      this.perfectCombo++;
      this.bestCombo = Math.max(this.bestCombo, this.perfectCombo);
      this.flash = 1;
      this.perfectTextT = 0.8;
      this._burst(prev.x + prev.w / 2, dropY);
      audio.perfect(this.perfectCombo);
    } else {
      // Imperfect — keep the overlap, slice the overhang off to fall.
      newX = overlapLeft;
      newW = overlap;
      if (a.x < prev.x) this._spawnSlice(a.x, dropY, overlapLeft - a.x, a.colorIndex, -1);
      else this._spawnSlice(overlapRight, dropY, a.x + a.w - overlapRight, a.colorIndex, 1);
      this.perfectCombo = 0;
      audio.slice();
      audio.drop();
    }

    this.tower.push({ x: newX, w: newW, colorIndex: a.colorIndex });
    this.score++;
    const coins = 1 + (this.perfectCombo > 0 ? 2 * Math.min(this.perfectCombo, 5) : 0);
    this.events.onStack?.({ perfect: this.perfectCombo > 0, combo: this.perfectCombo, coins });

    if (newW <= MIN_W_GAMEOVER) { audio.over(); this._gameOver(); return; }
    this._spawnActive(newW, a.colorIndex + 1);
  }

  _gameOver() {
    this.state = 'over';
    this.events.onGameOver?.(this.score, this.isDaily);
  }

  // Rewarded-ad revive: widen the top block and resume at the same height (once per run).
  revive() {
    if (this.state !== 'over' || this.revived) return false;
    this.revived = true;
    const top = this.tower[this.tower.length - 1];
    const w = Math.max(top.w, this.baseW() * 0.5);
    top.x = Math.max(0, Math.min(this.W - w, top.x - (w - top.w) / 2));
    top.w = w;
    this.perfectCombo = 0;
    this.state = 'playing';
    this._spawnActive(w, top.colorIndex + 1);
    return true;
  }

  _spawnSlice(x, globalY, w, colorIndex, dir) {
    if (w <= 0) return;
    const s = this.slices.find((p) => !p.live) || this.slices[0];
    s.live = true;
    s.x = x; s.y = globalY; s.w = w; s.h = BLOCK_H;
    s.vx = dir * (60 + this.rng() * 60);
    s.vy = 40 + this.rng() * 40;
    s.vr = dir * (1.5 + this.rng() * 2);
    s.rot = 0;
    s.color = themeById(this.themeId).block(colorIndex);
  }

  _burst(globalX, globalY) {
    let n = 14;
    for (const p of this.particles) {
      if (n <= 0) break;
      if (p.live) continue;
      p.live = true;
      const ang = this.rng() * Math.PI * 2;
      const spd = 80 + this.rng() * 160;
      p.x = globalX; p.y = globalY;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd - 40;
      p.max = p.life = 0.5 + this.rng() * 0.3;
      n--;
    }
  }

  update(dt) {
    // Camera always eases toward its framing target (also when game over, so the tower settles).
    this.viewY += (this._targetViewY() - this.viewY) * CAMERA_LERP;

    if (this.state === 'playing') {
      const a = this.active;
      a.x += a.dir * a.speed * dt;
      if (a.x <= 0) { a.x = 0; a.dir = 1; }
      else if (a.x >= this.W - a.w) { a.x = this.W - a.w; a.dir = -1; }
    }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    if (this.perfectTextT > 0) this.perfectTextT -= dt;

    for (const s of this.slices) {
      if (!s.live) continue;
      s.vy += 900 * dt;       // gravity (world units/s^2)
      s.x += s.vx * dt;
      s.y -= s.vy * dt;       // world Y is up, falling = decreasing globalY
      s.rot += s.vr * dt;
      if (this.worldToScreenY(s.y) > this.H + 120) s.live = false;
    }
    for (const p of this.particles) {
      if (!p.live) continue;
      p.vy -= 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;       // particle world Y up
      p.life -= dt;
      if (p.life <= 0) p.live = false;
    }
  }

  // --- rendering ---
  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _drawBlock(ctx, x, screenY, w, color) {
    const h = BLOCK_H;
    // soft long shadow (no outline, per style formula)
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    this._roundRect(ctx, x + 4, screenY + 6, w, h, 6);
    ctx.fill();
    // body
    ctx.fillStyle = color;
    this._roundRect(ctx, x, screenY, w, h, 6);
    ctx.fill();
    // single gentle top-light highlight
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    this._roundRect(ctx, x + 3, screenY + 3, w - 6, h * 0.32, 4);
    ctx.fill();
  }

  render(ctx) {
    const W = this.W, H = this.H;
    const theme = themeById(this.themeId);
    const frac = Math.min(1, this.score / 120);
    const [top, bottom] = theme.sky(frac);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // tower — drawn from the top down, culled the moment it leaves the screen below
    for (let i = this.tower.length - 1; i >= 0; i--) {
      const b = this.tower[i];
      const sy = this.worldToScreenY((i + 1) * BLOCK_H);
      if (sy > H + BLOCK_H) break;        // this and everything below is off-screen
      if (sy + BLOCK_H < 0) continue;     // above the view, keep scanning down
      this._drawBlock(ctx, b.x, sy, b.w, theme.block(b.colorIndex));
    }

    // falling slices
    for (const s of this.slices) {
      if (!s.live) continue;
      const sy = this.worldToScreenY(s.y);
      ctx.save();
      ctx.translate(s.x + s.w / 2, sy + s.h / 2);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.color;
      this._roundRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, 5);
      ctx.fill();
      ctx.restore();
    }

    // active block
    if (this.state === 'playing') {
      const a = this.active;
      this._drawBlock(ctx, a.x, this.worldToScreenY(this._activeTopGlobalY()), a.w, theme.block(a.colorIndex));
    }

    // perfect gold particles
    for (const p of this.particles) {
      if (!p.live) continue;
      const sy = this.worldToScreenY(p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(p.x, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // perfect flash
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

export { BLOCK_H, GOLD };
