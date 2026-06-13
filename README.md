# STACK — a one-tap arcade tower-stacker

**▶ Play the live preview:** https://ancient-snow-367.higgsfield.gg/
(the same build, intended home is **Yandex Games** — upload `dist/stack.zip`, see below)

A tiny, instant-loading HTML5 browser game built for **Yandex Games**. Tap (anywhere) / click /
`Space` / gamepad to drop each sliding block onto the tower; the overhang is sliced off, a flush drop
is a **PERFECT** (gold flash + ascending chime + bonus). Miss and the run ends.

Designed for the Yandex audience: it loads in well under a second because **everything is procedural**
— the art is drawn on a `<canvas>` and the sound is synthesized with the Web Audio API, so there are
**no image or audio files to download**.

## Why players come back every day
- **Daily Challenge** — today's date seeds one identical course for everyone; today's best is saved.
- **Streak** — first play each calendar day grows a streak; milestones grant coins.
- **All-time leaderboard** (Yandex SDK) + personal best.
- **Cosmetic block themes** unlocked with coins (Spectrum, Sunset, Ocean, Candy, Mono, Aurora).

## Built-in monetization (Yandex-compliant ad spots)
- **Rewarded video → Revive** (continue at current height, once per run).
- **Rewarded video → Double coins** on the game-over screen.
- **Interstitial** between runs only — never on first load, with the SDK's ≥60s spacing; gameplay is
  paused and audio muted during any ad, then resumed on close.

## Controls
One input — **drop**: tap / click / `Space` / `Enter` / gamepad A (button 0/9). `Esc` pauses.
Keyboard uses physical `event.code`, so it works on any keyboard layout. Touch, mouse, keyboard and
gamepad are all first-class; the layout is responsive (portrait phones and desktop).

## Languages
Russian (primary) + English, chosen automatically from `ysdk.environment.i18n.lang` with a browser
fallback. All strings live in `strings.js` — adding a language is a data change.

## Project layout
```
index.html        game page (loads the Yandex SDK at runtime with a graceful fallback)
logic.js          no-op rules module (only needed by the Higgsfield apps-engine deploy)
strings.js        all player-visible text (ru/en)
src/              game code (game.js sim+render, platform.js SDK adapter, audio, store, themes, …)
assets/           favicon.svg (the only static asset)
design/           plan, frozen numbers, asset manifest, approved STYLE FORMULA
tools/            headless tests + card-image renderer (NOT shipped in the game zip)
```

---

## How to publish on Yandex Games

1. **Package** the game (these files at the ZIP root): `index.html`, `logic.js`, `strings.js`,
   `src/`, `assets/`. A ready zip is produced by:
   ```bash
   bash tools/package.sh      # -> dist/stack.zip
   ```
   `index.html` must sit at the **root** of the archive (it already does).

2. **Create a draft** in the Yandex Games Developer Console (https://games.yandex.ru/console) and
   **upload `dist/stack.zip`**.

3. **Leaderboard** — create one leaderboard with technical name **`score`**, "higher is better"
   (descending), 0 decimals. (The game calls `setLeaderboardScore('score', …)`; if the board is
   absent the call is a safe no-op.) To use a different name, change `LB_BOARD` in `src/main.js`.

4. **Ads** — rewarded video + fullscreen (interstitial) are already wired through the SDK; enable
   monetization for the game in the console. No extra code needed.

5. The Yandex SDK is loaded at runtime from `/sdk.js` (served by Yandex) with a fallback to the
   public SDK URL, so the same build also runs as a normal link. `LoadingAPI.ready()` and the
   `GameplayAPI` start/stop calls are already integrated.

6. Fill in the catalog card and submit for moderation (assets ready in `dist/`):
   - **Icon (1:1):** `dist/card-icon.png` — square, no rounded corners/frame (§8.3.3).
   - **Cover (16:9):** `dist/card-thumb.png`.
   - **Screenshots:** `dist/screenshots/*.png` — real gameplay (§5.1.1.2).
   - **Age rating:** `0+` (abstract arcade, no restricted content — §3.4).
   - **Orientation:** Portrait (the tower grows vertically; it also adapts to landscape/desktop).
   - **Categories/tags:** Arcade / Casual / Hypercasual.

## ⚠️ Before you submit — what only you can do
- **Unique name (§5.12):** "STACK" is generic and likely taken in the catalog. Pick a **unique**
  name, set it in **`strings.js`** (`title`, both `en` and `ru`), and use the *same* name in the
  draft for each language (§5.1.3). Then re-run `tools/package.sh` and re-upload. Ideas: *Stack
  Rush, Stacktastic, Tower Tap, Blockwise, Stackline.*
- **Enable RSYA monetization (§1.12)** for the game in the console (the rewarded + interstitial
  code is already there).
- **Create the `score` leaderboard** (step 3) so the in-game leaderboard fills.
- **Tick "cloud saves" (§1.11)** in the draft — the game uses `player.setData`.
- **Fill "How to play" (§2.2):** "Tap the screen (or click / press Space) to drop each block onto
  the tower. Line it up flush for a PERFECT and a combo. Miss and the run ends." (translate per
  language).
- **Do NOT declare Android TV** unless you add D-pad menu navigation — TV (§1.6.3) needs full
  arrow-key control of every menu, which this build does not implement. Desktop + Mobile only.

## Yandex requirements — how this build complies
| Requirement | Status in this build |
|---|---|
| §1.1 SDK embedded; §1.19.1 init per docs | `src/platform.js` loads the SDK and calls `YaGames.init()` |
| §1.19.2 `LoadingAPI.ready()` when playable | called in `boot()` right before the title screen |
| §1.19.3 `GameplayAPI.start/stop` | start on run/resume, stop on game-over/pause/ad/hide |
| §1.19.4 `game_api_pause/resume` | subscribed; routes to the same pause/mute as blur/visibility |
| §1.2 / §1.2.2 no forced 3rd-party auth; guest progress | no auth required; guests persist via localStorage |
| §1.3 sound stops on minimize | `blur` + `visibilitychange` suspend audio |
| §1.5 / §4 ads only via SDK; §4.7 pause+mute on ad | all ads go through the SDK; ad hooks pause game + mute |
| §4.5 rewarded is opt-in, clearly labelled, bonus-only | Revive / Double-coins buttons say "Watch ad → …"; Restart is always free |
| §4.4 ads only at logical pauses | interstitial only **between** runs, self-throttled ≥60s, never on first load |
| §1.6.1.5 gesture control; §1.6.2.4 mouse/keyboard | one action: tap / click / Space / gamepad |
| §1.6.1.8 / §1.6.2.7 no selection / context menu | `contextmenu` + `selectstart` prevented; `user-select:none` |
| §1.10.2 no browser scroll / pull-to-refresh | `overscroll-behavior:none`, `position:fixed`, `touch-action:none` |
| §1.10.1/§1.10.3 responsive, no overlap/clipping | canvas resizes to viewport (DPR≤1.5); transient overlays gated to the live scene |
| §1.7 / §1.18 no absolute Yandex-S3 URLs; no URL gating | all paths relative; SDK has a graceful fallback |
| §1.9 progress saved immediately; survives refresh | saved on each change + flushed on `pagehide` |
| §1.21 <100 MB; §1.22 index.html at root, ASCII names | ~48 KB; `index.html`/`logic.js` at the zip root |
| §1.23 no interactive AI | none |
| §2.6 record saved | best / coins / streak persisted |
| §2.10 / §2.14 localization + auto language | `ru` + `en`, chosen from `environment.i18n.lang` |
| §6.2 sound toggle; §6.3 pause | both present |

## Local development / testing
```bash
python3 -m http.server 8099          # then open http://localhost:8099/  (?dev=1 shows FPS)
node tools/sim-test.mjs              # headless core-simulation tests
PW_PATH="$(npm root -g)/playwright/index.js" node tools/smoke.mjs   # real-browser smoke test
```
