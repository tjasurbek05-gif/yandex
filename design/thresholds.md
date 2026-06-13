# STACK — frozen numbers (agency metrics + budgets)

## Agency metrics (frozen before content)
- BLOCK_H            = 26 px (block height / vertical step)
- BASE_W_FRAC        = 0.62 (base block width as fraction of canvas width, max 240 px)
- MIN_W_GAMEOVER     = 1 px (overlap <= this ends the run)
- SPEED_START        = 150 px/s (horizontal slide speed at block 0)
- SPEED_STEP         = 6 px/s added per stacked block
- SPEED_MAX          = 560 px/s
- PERFECT_EPS        = 4 px (|dx| within this = perfect stack)
- PERFECT_REGROW     = 6 px (width given back on a perfect, never above base width)
- CAMERA_ANCHOR      = 0.58 (active block sits at this fraction down the screen)
- CAMERA_LERP        = 0.12 (per-frame smoothing toward target view)

## Scoring / economy
- score            +1 per stacked block
- coins            +1 per block, +2 extra per perfect (x perfect-combo, capped x5)
- streak milestone +20 coins at every 5-day streak
- revive width     restore to max(current, BASE_W * 0.5) once per run (rewarded ad)

## Performance budget (weakest phone)
- 60 fps; frame time < 16.6 ms
- entities on screen: <= ceil(viewH / BLOCK_H) + 2 visible blocks (rest culled, never drawn)
- falling slices + particles are pooled; zero allocations in the steady-state frame loop
- devicePixelRatio capped at 1.5

## Input tolerance
- one drop per spawned block (re-press ignored until next block)
- PERFECT_EPS above is the forgiveness window
