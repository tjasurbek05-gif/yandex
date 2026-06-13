// App orchestration: boot, screens, input (touch + mouse + keyboard physical codes + gamepad),
// fixed-timestep loop, and the wiring of ads / leaderboard / streak / themes. UI is drawn on the
// canvas with hit-tested buttons so the look stays consistent and there is nothing extra to load.
import { Game } from './game.js';
import { Scene3D } from './scene3d.js';
import { platform } from './platform.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { THEMES, themeById, GOLD } from './themes.js';
import { initLang, t } from './i18n.js';
import { dailySeed } from './rng.js';

const LB_BOARD = 'score'; // leaderboard id configured in the Yandex console (no-op if absent)
const UI = {
  text: '#f5f7fb', dim: 'rgba(245,247,251,0.6)',
  panel: 'rgba(10,12,20,0.42)',
  primary: GOLD, primaryText: '#1a1407',
  secondary: 'rgba(255,255,255,0.16)',
  locked: 'rgba(255,255,255,0.08)', lockedText: 'rgba(245,247,251,0.4)',
};

class App {
  constructor() {
    this.canvas = document.getElementById('ui');   // transparent 2D overlay (UI + input)
    this.ctx = this.canvas.getContext('2d');
    this.bg = document.getElementById('bg');        // CSS gradient sky behind the 3D
    this.W = innerWidth; this.H = innerHeight;
    this.screen = 'loading';
    this.buttons = [];
    this.runCoins = 0;
    this.lastNewBest = false;
    this.doubled = false;
    this.lbEntries = null;
    this.hintT = 0;
    this.adActive = false;
    this.game = new Game({
      onStack: (info) => { this.runCoins += info.coins; },
      onGameOver: (score, isDaily) => this.onGameOver(score, isDaily),
    });
    // 3D renderer. Degrade gracefully if WebGL is unavailable so the game never crashes (§1.14).
    try { this.scene = new Scene3D(document.getElementById('gl')); }
    catch (_) { this.scene = { sync() {}, render() {}, resize() {} }; }
  }

  async boot() {
    const lang = await platform.init();
    initLang(lang);
    await store.init();
    audio.setEnabled(store.get().sound);
    this.game.setTheme(store.get().theme);
    platform.setAdHooks(
      () => { this.adActive = true; audio.suspend(); platform.gameplayStop(); },
      () => { this.adActive = false; audio.resume(); },
    );
    // SDK-initiated pause/resume (§1.19.4) — route to the same hide/show as blur/visibility.
    platform.onSystemPause(() => this.handleHide());
    platform.onSystemResume(() => this.handleShow());
    this.resize();
    this.bindInput();
    platform.ready();           // tell Yandex the game is interactive
    this.screen = 'title';
    requestAnimationFrame((t0) => this.loop(t0));
  }

  // ---------- layout ----------
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.W = innerWidth; this.H = innerHeight;
    this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr;
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.game.setSize(this.W, this.H);
    this.scene.resize(this.W, this.H);
  }

  S() { return Math.min(this.W, this.H) / 100; } // scale unit

  // ---------- input ----------
  bindInput() {
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => this.resize());

    const tap = (x, y) => { if (this.adActive) return; audio.unlock(); this.onTap(x, y); };
    // Use Pointer Events when available (covers mouse + touch + pen with ONE event, so a single
    // tap never double-fires). Fall back to touch + mouse for old Safari/iOS that lack them.
    if (window.PointerEvent) {
      this.canvas.addEventListener('pointerdown', (e) => tap(e.clientX, e.clientY));
    } else {
      this.canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); const t = e.changedTouches[0]; tap(t.clientX, t.clientY);
      }, { passive: false });
      this.canvas.addEventListener('mousedown', (e) => tap(e.clientX, e.clientY));
    }
    // No scroll, no long-press selection, no context menu inside the game field (§1.6.1.8/1.6.2.7).
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('selectstart', (e) => e.preventDefault());

    addEventListener('keydown', (e) => {
      if (this.adActive) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); audio.unlock(); this.onPrimary(); }
      else if (e.code === 'Escape') { this.onEscape(); }
    });

    // Stop sound + pause on minimize/tab-switch (§1.3); flush save on exit (§1.9).
    addEventListener('blur', () => this.handleHide());
    addEventListener('focus', () => this.handleShow());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.handleHide() : this.handleShow()));
    addEventListener('pagehide', () => { store.flush(); audio.suspend(); });
    this._prevPad = false;
  }

  handleHide() { if (this.screen === 'playing') this.pauseGame(); else audio.suspend(); }
  handleShow() { if (!this.adActive) audio.resume(); }

  pollGamepad() {
    let action = false;
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (gp && (gp.buttons[0]?.pressed || gp.buttons[9]?.pressed)) action = true;
    }
    if (action && !this._prevPad) { audio.unlock(); this.onPrimary(); }
    this._prevPad = action;
  }

  onTap(x, y) {
    // Buttons take precedence; during play a non-button tap drops.
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return; }
    }
    if (this.screen === 'playing') { this.game.drop(); this.hintT = 0; }
  }

  onPrimary() {
    if (this.screen === 'title') this.startRun(false);
    else if (this.screen === 'playing') { this.game.drop(); this.hintT = 0; }
    else if (this.screen === 'paused') this.resumeGame();
    else if (this.screen === 'gameover') this.startRun(this.game.isDaily);
  }

  onEscape() {
    if (this.screen === 'playing') this.pauseGame();
    else if (this.screen === 'paused') this.resumeGame();
    else if (this.screen === 'themes' || this.screen === 'leaderboard') this.screen = 'title';
  }

  // ---------- run lifecycle ----------
  startRun(isDaily) {
    const seed = isDaily ? dailySeed() : (Math.random() * 0xffffffff) >>> 0;
    const ms = store.touchStreak();
    if (ms.milestone) { /* coins already added in store; surfaced on next title */ }
    this.runCoins = 0;
    this.doubled = false;
    this.lastNewBest = false;
    this.hintT = store.get().best === 0 ? 3 : 0; // show drop hint to first-timers
    this.game.setTheme(store.get().theme);
    this.game.reset(seed, isDaily);
    this.screen = 'playing';
    platform.gameplayStart();
  }

  pauseGame() {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    platform.gameplayStop();
    audio.suspend();
  }

  resumeGame() {
    if (this.screen !== 'paused') return;
    this.screen = 'playing';
    audio.resume();
    platform.gameplayStart();
  }

  onGameOver(score, isDaily) {
    // Note: with a revive this fires twice per run, so coins are NOT committed here (that would
    // double-count pre-revive coins). Best/leaderboard are idempotent on max, so they update now.
    platform.gameplayStop();
    this.lastNewBest = store.recordScore(score, isDaily) || this.lastNewBest;
    platform.submitScore(LB_BOARD, score);
    this.screen = 'gameover';
    // Every loss shows a SKIPPABLE fullscreen (interstitial) ad — after a short beat so the player
    // sees the result first. Yandex enforces a >=60s gap (platform.showInterstitial self-throttles),
    // and the guard skips it if the player already left the game-over screen (e.g. tapped Revive).
    // Revive itself uses the UNSKIPPABLE rewarded video (watchRewarded), not this.
    setTimeout(() => { if (this.screen === 'gameover') platform.showInterstitial(); }, 700);
  }

  // Commit this run's coins exactly once, when the run truly ends (leaving the game-over screen).
  commitRunCoins() {
    const total = this.runCoins * (this.doubled ? 2 : 1);
    if (total) store.addCoins(total);
    this.runCoins = 0; this.doubled = false;
  }

  async watchRewarded(onReward) {
    if (!platform.rewardedAvailable()) { onReward(); return; } // standalone fallback: grant directly
    const ok = await platform.showRewarded();
    if (ok) onReward();
  }

  async leaveGameOver(isDaily) {
    this.commitRunCoins();
    // Fallback loss-ad for a very fast restart (before the on-death interstitial fired). The >=60s
    // self-throttle means this never double-shows with the on-death ad in the same loss cycle.
    await platform.showInterstitial();
    if (isDaily !== null) this.startRun(isDaily); else { this.screen = 'title'; this.lbEntries = null; }
  }

  async openLeaderboard() {
    this.screen = 'leaderboard';
    this.lbEntries = await platform.getTopEntries(LB_BOARD, 10);
  }

  // ---------- UI primitives ----------
  button(id, x, y, w, h, label, opts = {}) {
    const ctx = this.ctx;
    const bg = opts.disabled ? UI.locked : (opts.primary ? UI.primary : (opts.bg || UI.secondary));
    const fg = opts.disabled ? UI.lockedText : (opts.primary ? UI.primaryText : (opts.fg || UI.text));
    this.roundRect(x, y, w, h, Math.min(14, h / 2));
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${opts.fontPx || Math.min(h * 0.42, this.S() * 3.2)}px system-ui, sans-serif`;
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    if (opts.sub) {
      ctx.font = `500 ${this.S() * 1.6}px system-ui, sans-serif`;
      ctx.fillStyle = opts.disabled ? UI.lockedText : fg;
      ctx.fillText(opts.sub, x + w / 2, y + h - this.S() * 1.4);
    }
    if (!opts.disabled && opts.action) this.buttons.push({ x, y, w, h, action: opts.action, id });
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  label(text, x, y, px, color = UI.text, align = 'center', weight = 700) {
    const ctx = this.ctx;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.font = `${weight} ${px}px system-ui, sans-serif`;
    ctx.fillText(text, x, y);
  }

  panel(x, y, w, h) {
    this.roundRect(x, y, w, h, this.S() * 2.4);
    this.ctx.fillStyle = UI.panel; this.ctx.fill();
  }

  // ---------- screens ----------
  drawTitle() {
    const { W, H } = this; const S = this.S(); const d = store.get();
    this.label(t('title'), W / 2, H * 0.2, S * 9, UI.text, 'center', 800);
    // stat chips
    const chipY = H * 0.31;
    this.label(`${t('best')} ${d.best}`, W / 2, chipY, S * 2.4, UI.dim);
    this.label(`★ ${d.coins}   ·   ${t('streak')} ${d.streak}`, W / 2, chipY + S * 3.4, S * 2.4, UI.dim);

    const bw = Math.min(W * 0.7, S * 36), bx = (W - bw) / 2;
    this.button('play', bx, H * 0.46, bw, S * 9, t('play'), { primary: true, action: () => this.startRun(false) });
    this.button('daily', bx, H * 0.46 + S * 11, bw, S * 7, t('daily'),
      { action: () => this.startRun(true), sub: store.dailyBest() ? `${t('today_best')}: ${store.dailyBest()}` : '' });

    // bottom row: themes / leaderboard / sound
    const r = S * 6.5, gap = S * 2, total = r * 3 + gap * 2, sx = (W - total) / 2, sy = H * 0.86;
    this.button('themes', sx, sy, r, r, '🎨', { action: () => (this.screen = 'themes') });
    this.button('lb', sx + r + gap, sy, r, r, '🏆', { action: () => this.openLeaderboard() });
    this.button('sound', sx + (r + gap) * 2, sy, r, r, d.sound ? '🔊' : '🔇',
      { action: () => { const on = !store.get().sound; store.setSound(on); audio.setEnabled(on); } });
  }

  drawHUD() {
    const { W, H } = this; const S = this.S();
    this.label(String(this.game.score), W / 2, H * 0.12, S * 11, UI.text, 'center', 800);
    const playing = this.screen === 'playing'; // transient overlays only on the live scene
    if (playing && this.game.perfectCombo > 1) {
      this.label(`${t('combo')} x${this.game.perfectCombo}`, W / 2, H * 0.12 + S * 7, S * 2.6, GOLD);
    }
    this.label(`★ ${store.get().coins + this.runCoins}`, S * 3, S * 5, S * 2.6, UI.dim, 'left');
    // pause button top-right
    const pr = S * 6;
    this.button('pause', W - pr - S * 2, S * 2, pr, pr, '⏸', { action: () => this.pauseGame() });
    if (playing && this.game.perfectTextT > 0) {
      this.ctx.globalAlpha = Math.min(1, this.game.perfectTextT * 2);
      this.label(t('perfect'), W / 2, H * 0.3, S * 4.5, GOLD, 'center', 800);
      this.ctx.globalAlpha = 1;
    }
    if (playing && this.hintT > 0) {
      // In the clear sky between the score and the active block, so it never overlaps the tower.
      this.ctx.globalAlpha = Math.min(1, this.hintT);
      this.label(t('tap_hint'), W / 2, H * 0.26, S * 2.6, UI.dim);
      this.ctx.globalAlpha = 1;
    }
  }

  drawPaused() {
    const { W, H } = this; const S = this.S();
    this.ctx.fillStyle = 'rgba(0,0,0,0.45)'; this.ctx.fillRect(0, 0, W, H);
    this.label(t('paused'), W / 2, H * 0.32, S * 6, UI.text, 'center', 800);
    const bw = Math.min(W * 0.7, S * 36), bx = (W - bw) / 2;
    this.button('resume', bx, H * 0.46, bw, S * 8, t('resume'), { primary: true, action: () => this.resumeGame() });
    this.button('home', bx, H * 0.46 + S * 10, bw, S * 7, t('home'),
      { action: () => { this.commitRunCoins(); this.screen = 'title'; this.lbEntries = null; } });
  }

  drawGameOver() {
    const { W, H } = this; const S = this.S(); const d = store.get();
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)'; this.ctx.fillRect(0, 0, W, H);
    this.label(this.lastNewBest ? t('new_best') : t('game_over'), W / 2, H * 0.2,
      S * 6, this.lastNewBest ? GOLD : UI.text, 'center', 800);
    this.label(`${t('score')} ${this.game.score}`, W / 2, H * 0.3, S * 4, UI.text);
    this.label(`${t('best')} ${d.best}   ·   ★ +${this.doubled ? this.runCoins * 2 : this.runCoins}`,
      W / 2, H * 0.36, S * 2.4, UI.dim);

    const bw = Math.min(W * 0.7, S * 36), bx = (W - bw) / 2;
    let y = H * 0.46;
    const canRevive = !this.game.revived;
    this.button('revive', bx, y, bw, S * 8,
      `${t('revive')} ${platform.rewardedAvailable() ? '▶' : ''}`,
      {
        primary: true, disabled: !canRevive, sub: canRevive ? t('revive_sub') : '',
        action: () => this.watchRewarded(() => {
          if (this.game.revive()) { this.screen = 'playing'; platform.gameplayStart(); audio.resume(); }
        }),
      });
    y += S * 10;
    const canDouble = !this.doubled && this.runCoins > 0;
    this.button('double', bx, y, bw, S * 7,
      `${t('double_coins')} ${platform.rewardedAvailable() ? '▶' : ''}`,
      {
        disabled: !canDouble, sub: canDouble ? t('double_sub') : '',
        action: () => this.watchRewarded(() => { this.doubled = true; }), // committed on leave

      });
    y += S * 9;
    const half = (bw - S * 2) / 2;
    this.button('restart', bx, y, half, S * 7, t('restart'),
      { action: () => this.leaveGameOver(this.game.isDaily) });
    this.button('ghome', bx + half + S * 2, y, half, S * 7, t('home'),
      { action: () => this.leaveGameOver(null) });
  }

  drawThemes() {
    const { W, H } = this; const S = this.S(); const d = store.get();
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)'; this.ctx.fillRect(0, 0, W, H);
    this.label(t('themes'), W / 2, H * 0.12, S * 5, UI.text, 'center', 800);
    this.label(`★ ${d.coins}`, W / 2, H * 0.18, S * 2.6, GOLD);

    const cols = 2, gap = S * 3, cw = (Math.min(W * 0.86, S * 60) - gap) / cols;
    const ch = S * 14, x0 = (W - (cw * cols + gap)) / 2; let y0 = H * 0.24;
    THEMES.forEach((th, i) => {
      const cx = x0 + (i % cols) * (cw + gap);
      const cy = y0 + Math.floor(i / cols) * (ch + gap);
      const owned = store.isUnlocked(th.id);
      const selected = d.theme === th.id;
      // preview swatch
      this.roundRect(cx, cy, cw, ch, S * 1.6);
      const [top, bot] = th.sky(0.4);
      const g = this.ctx.createLinearGradient(0, cy, 0, cy + ch);
      g.addColorStop(0, top); g.addColorStop(1, bot);
      this.ctx.fillStyle = g; this.ctx.fill();
      for (let k = 0; k < 3; k++) {
        this.ctx.fillStyle = th.block(k * 3);
        this.roundRect(cx + cw * 0.2, cy + ch * 0.55 - k * S * 2.2, cw * 0.6, S * 2, 4);
        this.ctx.fill();
      }
      if (selected) { this.ctx.strokeStyle = GOLD; this.ctx.lineWidth = S * 0.6; this.roundRect(cx, cy, cw, ch, S * 1.6); this.ctx.stroke(); }
      this.label(th.label[t('day') === 'день' ? 'ru' : 'en'] || th.label.en, cx + cw / 2, cy + ch - S * 2, S * 2, owned ? UI.text : UI.dim);

      this.buttons.push({
        x: cx, y: cy, w: cw, h: ch, id: 'th_' + th.id,
        action: () => {
          if (owned) store.setTheme(th.id);
          else if (store.spendCoins(th.cost)) { store.unlock(th.id); store.setTheme(th.id); }
        },
      });
      if (!owned) this.label(`${t('unlock_for')} ★${th.cost}`, cx + cw / 2, cy + ch / 2, S * 2, UI.lockedText);
    });

    const bw = Math.min(W * 0.6, S * 30);
    this.button('tback', (W - bw) / 2, H * 0.9, bw, S * 7, t('close'), { action: () => (this.screen = 'title') });
  }

  drawLeaderboard() {
    const { W, H } = this; const S = this.S();
    this.ctx.fillStyle = 'rgba(0,0,0,0.55)'; this.ctx.fillRect(0, 0, W, H);
    this.label(t('leaderboard'), W / 2, H * 0.12, S * 5, UI.text, 'center', 800);
    const px = W * 0.1, pw = W * 0.8; let y = H * 0.22;
    if (this.lbEntries === null) {
      this.label(`${t('best')}: ${store.get().best}`, W / 2, H * 0.3, S * 3, UI.text);
      this.label(t('sign_in_lb'), W / 2, H * 0.38, S * 2, UI.dim);
    } else if (this.lbEntries.length === 0) {
      this.label(`${t('best')}: ${store.get().best}`, W / 2, H * 0.3, S * 3, UI.text);
    } else {
      for (const e of this.lbEntries.slice(0, 10)) {
        const me = e.player?.uniqueID && this.lbEntries.you && e.player.uniqueID === this.lbEntries.you;
        const name = e.player?.publicName || t('you');
        this.label(`${e.rank}.`, px, y, S * 2.6, UI.dim, 'left');
        this.label(name, px + S * 6, y, S * 2.6, me ? GOLD : UI.text, 'left');
        this.label(String(e.score), px + pw, y, S * 2.6, UI.text, 'right');
        y += S * 4.2;
      }
    }
    const bw = Math.min(W * 0.6, S * 30);
    this.button('lback', (W - bw) / 2, H * 0.9, bw, S * 7, t('close'), { action: () => (this.screen = 'title') });
  }

  // UI overlay (transparent canvas above the 3D scene). Also drives the CSS sky backdrop.
  render() {
    const ctx = this.ctx;
    this.buttons = [];
    ctx.clearRect(0, 0, this.W, this.H);

    // sky backdrop follows tower height + the active theme
    const frac = Math.min(1, this.game.score / 120);
    const [a, b] = themeById(store.get().theme).sky(frac);
    const css = `linear-gradient(180deg, ${a}, ${b})`;
    if (css !== this._sky) { this._sky = css; this.bg.style.background = css; }

    // perfect-stack flash, over the 3D
    if (this.game.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.game.flash * 0.22})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    if (this.screen === 'loading') { this.label(t('loading'), this.W / 2, this.H / 2, this.S() * 3); return; }
    if (this.screen === 'title') this.drawTitle();
    else if (this.screen === 'playing') this.drawHUD();
    else if (this.screen === 'paused') { this.drawHUD(); this.drawPaused(); }
    else if (this.screen === 'gameover') this.drawGameOver();
    else if (this.screen === 'themes') this.drawThemes();
    else if (this.screen === 'leaderboard') this.drawLeaderboard();
  }

  // ---------- loop ----------
  loop(now) {
    requestAnimationFrame((t1) => this.loop(t1));
    if (this._last === undefined) this._last = now;
    let frame = now - this._last; this._last = now;
    if (frame > 250) frame = 250; // tab was backgrounded; don't spiral
    this.pollGamepad();
    const STEP = 1000 / 60;
    this._acc = (this._acc || 0) + frame;
    while (this._acc >= STEP) {
      const dt = STEP / 1000;
      if (this.screen === 'playing') this.game.update(dt);
      else this.game.update(dt * 0.25); // gentle idle drift of the camera/active block on menus
      if (this.hintT > 0 && this.screen === 'playing') this.hintT -= dt;
      this._acc -= STEP;
    }
    this.scene.sync(this.game, store.get().theme);
    this.scene.render();
    this.render();
  }
}

const app = new App();
app.boot();
// Dev-only introspection hooks for the automated smoke test (?dev). Harmless in production.
if (location.search.includes('dev')) { window.__app = app; window.__store = store; window.__platform = platform; }
