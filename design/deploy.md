# Deployment record

## Live preview (apps-engine / Higgsfield)
- **Play URL:** https://ancient-snow-367.higgsfield.gg/
- **game_id:** `2d31e2c2-4a95-4ddf-a2ed-69b52980b87a`  (mode: `rules`, via the `logic.js` stub)
- Deployed from `dist/stack.zip` (index.html + logic.js + src/ + strings.js + assets/ at the root).

This is a convenience preview of the exact same build. The intended home is **Yandex Games** —
upload `dist/stack.zip` in the Yandex console (see README "How to publish on Yandex Games").

## Updating the live preview in place
Keep the **same game_id** so the URL is preserved:
1. `bash tools/package.sh` → rebuild `dist/stack.zip`.
2. Commit + push so the raw URLs update.
3. Re-deploy with `deploy_game` passing `game_id: 2d31e2c2-4a95-4ddf-a2ed-69b52980b87a` and the new
   commit-pinned raw URL for `source_game` (and card images).

Note: in this environment the game was deployed by giving `deploy_game` commit-pinned
`raw.githubusercontent.com` URLs (the normal `media_upload` host was outside the network
allowlist). Any https URL the deploy service can fetch works for `source_game`/`thumbnail`/`favicon`.
