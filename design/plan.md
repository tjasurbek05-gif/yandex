# STACK — design plan

## Experience formula
The player feels a calm, addictive "one more try" rhythm because the game constantly dangles a
perfectly-alignable next block and rewards nerve and precision (perfect streaks) over haste.

## Profile
Real-time · continuous 2D · one moving block (hero) · vs system + vs self/leaderboard ·
procedural (seeded) · endless score · solo · session "a couple minutes / once a day" ·
engagement = execution (timing) + accumulation (coins, streak, themes, leaderboard).

## Delivery context
Desktop + mobile browsers + gamepad. ONE input = drop (tap anywhere / click / Space / gamepad A).
Keyboard bound to physical `event.code`. All player-visible strings external (RU + EN), language
chosen from the Yandex SDK (`environment.i18n.lang`) with a browser fallback. Performance budget
targets the weakest phone: 60 fps, a handful of rectangles, pooled slices/particles, DPR capped 1.5.

## Core loop
A block slides horizontally above the tower top, entering from alternating sides, speeding up as the
tower grows. Tap drops it. Overlap with the block below becomes the new block; the overhang slices off
and falls. Aligning within EPS = a "perfect": no width lost, a small width regrow, bonus coins, gold
flash + rising chime, perfect-combo multiplier. Width reaches 0 = game over.

## Retention (return every day)
- Daily Challenge: today's date seeds the run (start side, speed ramp, hue start) — same course for
  everyone that day; today's best is saved (cloud + local).
- Streak: first play each calendar day grows a streak; milestones grant coins.
- All-time leaderboard via the Yandex SDK (board id `score`), plus personal best.
- Cosmetic block themes unlocked by total coins (accumulation pull) — pure palette data.

## Monetization (ROI) — Yandex-compliant ad spots
- Rewarded video → Revive (continue at current height, once per run).
- Rewarded video → Double the run's coins on the game-over screen.
- Interstitial between runs only (never on first load; >=60s spacing enforced; gameplay paused +
  audio muted during any ad; resumed on close).

## Determinism
Fixed 60 Hz timestep, seeded RNG (mulberry32). Logic split from rendering. Daily seed = YYYYMMDD.

## Reference smoke route (verify end to end)
Title → PLAY → drop 3 blocks (one deliberate perfect) → miss → game-over with score → Restart →
loop runs again. Daily button → seeded run starts.
