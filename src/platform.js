// Platform adapter — wraps the Yandex Games SDK and degrades gracefully to a local stub so the
// SAME build runs on Yandex Games AND as a plain shareable link. Nothing else in the game knows
// whether Yandex is present.
//
// Yandex SDK docs surface used here:
//   YaGames.init(), features.LoadingAPI.ready(), features.GameplayAPI.start()/stop(),
//   adv.showFullscreenAdv(), adv.showRewardedVideo(), getPlayer(), getLeaderboards(),
//   environment.i18n.lang.

const SDK_URLS = ['/sdk.js', 'https://yandex.ru/games/sdk/v2/sdk.js'];
const INTERSTITIAL_MIN_MS = 60_000; // Yandex requires >=60s between interstitials.

function loadScript(url, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    let done = false;
    const to = setTimeout(() => {
      if (!done) { done = true; reject(new Error('timeout')); }
    }, timeoutMs);
    s.src = url;
    s.onload = () => { if (!done) { done = true; clearTimeout(to); resolve(); } };
    s.onerror = () => { if (!done) { done = true; clearTimeout(to); reject(new Error('load error')); } };
    document.head.appendChild(s);
  });
}

class Platform {
  constructor() {
    this.ysdk = null;
    this.player = null;
    this.lb = null;
    this.lang = 'en';
    this.hasYandex = false;
    this._lastInterstitial = 0;
    this._onAdOpen = () => {};
    this._onAdClose = () => {};
  }

  // Register pause/mute hooks so every ad correctly suspends gameplay + audio.
  setAdHooks(onOpen, onClose) {
    this._onAdOpen = onOpen || (() => {});
    this._onAdClose = onClose || (() => {});
  }

  async init() {
    for (const url of SDK_URLS) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await loadScript(url);
        if (window.YaGames) break;
      } catch (_) { /* try next url */ }
    }
    if (window.YaGames) {
      try {
        this.ysdk = await window.YaGames.init();
        this.hasYandex = true;
        try { this.lang = this.ysdk.environment?.i18n?.lang || this.lang; } catch (_) {}
        // Player (cloud save). scopes:false = no permission prompt; guest data still works per device.
        try { this.player = await this.ysdk.getPlayer({ scopes: false }); } catch (_) {}
        try { this.lb = await this.ysdk.getLeaderboards(); } catch (_) {}
      } catch (_) {
        this.ysdk = null;
        this.hasYandex = false;
      }
    }
    return this.lang;
  }

  // Signal the SDK the game finished loading and is interactive (hides Yandex loader).
  ready() {
    try { this.ysdk?.features?.LoadingAPI?.ready?.(); } catch (_) {}
  }

  gameplayStart() {
    try { this.ysdk?.features?.GameplayAPI?.start?.(); } catch (_) {}
  }

  gameplayStop() {
    try { this.ysdk?.features?.GameplayAPI?.stop?.(); } catch (_) {}
  }

  // Interstitial between runs. Self-throttled; never blocks gameplay if unavailable.
  async showInterstitial() {
    const now = Date.now();
    if (now - this._lastInterstitial < INTERSTITIAL_MIN_MS) return;
    if (!this.ysdk?.adv?.showFullscreenAdv) return;
    this._lastInterstitial = now;
    await new Promise((resolve) => {
      let opened = false;
      this.ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => { opened = true; this._onAdOpen(); },
          onClose: () => { if (opened) this._onAdClose(); resolve(); },
          onError: () => { if (opened) this._onAdClose(); resolve(); },
          onOffline: () => resolve(),
        },
      });
    });
  }

  // Rewarded video. Resolves true only if the reward actually fired.
  async showRewarded() {
    if (!this.ysdk?.adv?.showRewardedVideo) return false;
    return new Promise((resolve) => {
      let rewarded = false;
      let opened = false;
      this.ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => { opened = true; this._onAdOpen(); },
          onRewarded: () => { rewarded = true; },
          onClose: () => { if (opened) this._onAdClose(); resolve(rewarded); },
          onError: () => { if (opened) this._onAdClose(); resolve(false); },
        },
      });
    });
  }

  rewardedAvailable() {
    return !!this.ysdk?.adv?.showRewardedVideo;
  }

  // --- Cloud save (merged with localStorage so guests + offline still persist) ---
  async loadData() {
    let local = {};
    try { local = JSON.parse(localStorage.getItem('stack_save') || '{}'); } catch (_) {}
    if (this.player?.getData) {
      try {
        const cloud = await this.player.getData(['stack_save']);
        if (cloud && cloud.stack_save) return { ...local, ...cloud.stack_save };
      } catch (_) {}
    }
    return local;
  }

  async saveData(data) {
    try { localStorage.setItem('stack_save', JSON.stringify(data)); } catch (_) {}
    if (this.player?.setData) {
      try { await this.player.setData({ stack_save: data }, false); } catch (_) {}
    }
  }

  // --- Leaderboard (board id configured in the Yandex console; no-op if absent) ---
  async submitScore(boardName, score) {
    if (!this.lb?.setLeaderboardScore) return;
    try { await this.lb.setLeaderboardScore(boardName, Math.floor(score)); } catch (_) {}
  }

  async getTopEntries(boardName, top = 10) {
    if (!this.lb?.getLeaderboardEntries) return null;
    try {
      const res = await this.lb.getLeaderboardEntries(boardName, {
        quantityTop: top, includeUser: true, quantityAround: 5,
      });
      return res?.entries || [];
    } catch (_) { return null; }
  }
}

export const platform = new Platform();
