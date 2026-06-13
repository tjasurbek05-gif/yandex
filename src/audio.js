// WebAudio-synthesized SFX — no audio files ship, so there is nothing to download. All sounds are
// generated from oscillators/noise at runtime. Audio starts on the first user gesture (autoplay-safe)
// and mutes on blur / during ads.

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;   // user toggle
    this._suspended = false; // ad / blur
  }

  // Must be called from a user gesture (first tap) to satisfy autoplay policies.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on && !this._suspended ? 0.5 : 0;
  }

  // Called around ads / focus loss.
  suspend() {
    this._suspended = true;
    if (this.master) this.master.gain.value = 0;
    try { this.ctx?.suspend?.(); } catch (_) {}
  }

  resume() {
    this._suspended = false;
    try { this.ctx?.resume?.(); } catch (_) {}
    if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
  }

  _blip(freq, dur, type = 'sine', gain = 0.6, slideTo = null) {
    if (!this.ctx || !this.enabled || this._suspended) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noise(dur, gain = 0.25) {
    if (!this.ctx || !this.enabled || this._suspended) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t);
  }

  drop()    { this._blip(180, 0.12, 'triangle', 0.5, 90); }
  slice()   { this._noise(0.09, 0.22); }
  // Pitch climbs with the perfect-combo streak for a satisfying ascending ladder.
  perfect(combo = 1) {
    const base = 520 + Math.min(combo, 8) * 70;
    this._blip(base, 0.10, 'triangle', 0.5);
    setTimeout(() => this._blip(base * 1.5, 0.12, 'triangle', 0.45), 60);
  }
  coin()    { this._blip(880, 0.08, 'sine', 0.4, 1320); }
  over()    { this._blip(330, 0.45, 'sine', 0.5, 110); }
}

export const audio = new Audio();
