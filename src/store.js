// Persistent player state, backed by the platform's cloud/local save. Holds best, coins, the daily
// streak, unlocked themes and settings. All mutations go through here so saving stays in one place.
import { platform } from './platform.js';
import { dayKey, daysBetween } from './rng.js';

const DEFAULTS = {
  best: 0,
  coins: 0,
  streak: 0,
  lastPlayed: null,      // YYYY-MM-DD of last calendar day played
  unlocked: ['spectrum'],
  theme: 'spectrum',
  sound: true,
  daily: { date: null, best: 0 }, // best score on today's daily course
};

class Store {
  constructor() {
    this.data = { ...DEFAULTS };
    this._saveTimer = 0;
  }

  async init() {
    const loaded = await platform.loadData();
    this.data = { ...DEFAULTS, ...loaded };
    // Defensive: arrays/objects from old saves.
    if (!Array.isArray(this.data.unlocked)) this.data.unlocked = ['spectrum'];
    if (!this.data.unlocked.includes('spectrum')) this.data.unlocked.unshift('spectrum');
    if (!this.data.daily || typeof this.data.daily !== 'object') this.data.daily = { date: null, best: 0 };
  }

  // Debounced persist so rapid updates collapse into one write.
  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => platform.saveData(this.data), 250);
  }

  // Immediate persist (localStorage write is synchronous) — used on page hide so a refresh right
  // after an action never loses progress (§1.9).
  flush() {
    clearTimeout(this._saveTimer);
    platform.saveData(this.data);
  }

  get() { return this.data; }

  addCoins(n) { this.data.coins += n; this.save(); }

  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n; this.save(); return true;
  }

  // Call once when a run starts. Grows the streak on a new calendar day, resets if a day was skipped.
  // Returns { milestone: coinsAwarded } when a 5-day milestone is hit.
  touchStreak() {
    const today = dayKey();
    let award = 0;
    if (this.data.lastPlayed !== today) {
      const gap = daysBetween(this.data.lastPlayed, today);
      this.data.streak = gap === 1 ? this.data.streak + 1 : 1;
      this.data.lastPlayed = today;
      if (this.data.streak > 0 && this.data.streak % 5 === 0) {
        award = 20;
        this.data.coins += award;
      }
      this.save();
    }
    return { milestone: award };
  }

  // Record a finished run's score. Returns true if it is a new all-time best.
  recordScore(score, isDaily) {
    let newBest = false;
    if (score > this.data.best) { this.data.best = score; newBest = true; }
    if (isDaily) {
      const today = dayKey();
      if (this.data.daily.date !== today) this.data.daily = { date: today, best: 0 };
      if (score > this.data.daily.best) this.data.daily.best = score;
    }
    this.save();
    return newBest;
  }

  dailyBest() {
    return this.data.daily.date === dayKey() ? this.data.daily.best : 0;
  }

  isUnlocked(id) { return this.data.unlocked.includes(id); }

  unlock(id) {
    if (!this.data.unlocked.includes(id)) { this.data.unlocked.push(id); this.save(); }
  }

  setTheme(id) { this.data.theme = id; this.save(); }
  setSound(on) { this.data.sound = on; this.save(); }
}

export const store = new Store();
