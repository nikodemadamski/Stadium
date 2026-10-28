# Seat View

Open `index.html` (or `SeatView.html`, identical): one self-contained file, no install.
Edit `src.html`, `css/` or `js/`, then run `python tools/build_single.py`.
Back-up for chat: `python tools/pack_txt.py` -> one .txt; restore with `python tools/unpack_txt.py BUNDLE.txt FOLDER`.
Tests (need Python + Playwright): `tests/*.py`; `node tests/check_syntax.js` before every build.

## Security (24 Oct 2026)
See `SECURITY.md`. In short: a key-theft route via shared local-file storage, two code-injection routes (MusicBrainz replies, planted storage) and a missing second line of defence were found and fixed. Scripts are now hash-locked by the security policy (`tools/build_single.py` computes the hashes on every build). The live-data key is kept for the current tab only unless you tick "Remember on this device". The relay `tools/tm_proxy.py` was rebuilt and refuses all 23 relay attacks.
Tests: `python tests/relay_attack.py`, `python tests/pentest_browser.py OUT.json`, `python tests/pentest_tm_events.py`, `python tests/functional_csp.py`, `node tests/check_syntax.js`.
Note: the strict policy blocks `eval`, so browser tests must poll with `page.evaluate` instead of Playwright's `wait_for_function`.

## Phase 6: functionality and performance
Measured in headless Chromium with software rendering (no GPU), so absolute times are much slower than a real PC; the before/after ratios are what matter.
| | Before | After |
|---|---|---|
| Open a venue (first time) | 3.9-16.5 s | ~1.5 s |
| Re-open a venue | 7.4 s | 0.7 s |
| Click a seat | 2.4-2.8 s | 25-318 ms |
| Seat-view frame (Aviva, full crowd) | 1,995 ms, 1.10 M triangles | 1,500 ms, 0.57 M triangles |

- Shaders are compiled once and reused: materials are no longer disposed on venue/seat change, the people share one material, and every venue uses the same fixed light rig (three.js bakes the light count into shaders).
- Nearby people in 3 detail levels (60 detailed, 140 light, 300 simplest), then GPU dots.
- Draws only when something changes or the show is playing (idle: a redraw every 500 ms as a safety net).
- Big-screen close-ups render every 3rd frame and only when a screen is in shot.
- New: Compare up to 3 seats (rendered view of each, best values highlighted, saved per venue), Best view ranking with Top picks, native Share on phones for photos (download elsewhere).
## Publishing (Cloudflare Workers)
Live at https://stadium.nikoaireland.workers.dev. `wrangler.jsonc` publishes **only** `public/` (the built page; `python tools/build_single.py` writes it, commit it) and runs `worker/index.js`, which adds security headers (no framing, HTTPS only, no sniffing, no referrer, locked-down permissions) and serves `/api/events`.
- Live Ticketmaster data: add the secret `TM_API_KEY` (dashboard > Workers > stadium > Settings > Variables and Secrets, type "Secret"; or `npx wrangler secret put TM_API_KEY`). The key stays on Cloudflare; the public page has no key box. Without it the site works with the listed events.
- Abuse protection on `/api/events`: one fixed URL (any `?...` is refused), GET/HEAD only, each worker instance reuses its result for 6 h and shares one refresh between parallel requests, 5-minute back-off after a failure, Ticketmaster's error text never passed on. ~12 Ticketmaster calls per refresh (free limit: 5,000/day).
- Never put the key in a file in this repo; `.env`/`.dev.vars` are git-ignored.

## Crowd people (27 Oct 2026)
The people near your seat are real human meshes: MakeHuman's base body, skeleton, skin weights and shape targets (CC0 1.0, github.com/makehumancommunity/makehuman, `LICENSE.ASSETS.md`), posed, dressed and given hair by `tools/humans/build_humans.py` (Blender 5.2 as a Python module + numpy + scikit-image).
- 4 looks (2 men, 2 women: T-shirt/long sleeves, short/crop/long/bob hair) x 3 levels of detail (~3,500 / ~1,330 / ~530 triangles; the arms are decimated in their own pass so they stay round: 8-10 / 6-7 sides at the lower levels instead of 3-5), rigged with an 11-bone skeleton. Joints blend by angle (a vertex between a bone and its parent turns by its share of the joint angle), so raised arms keep their thickness. Check: `node tools/tests/arm_volume_check.js`.
- Animation: every near fan (the ~500 rigged people around your seat) owns its seat and plays **in-place clips** from `js/crowd.js` (idle, clap, bounce, fist pump, cheer, jump, sway, phone; seated versions). Each fan: weighted clip pool, seeded start offset, timeScale 0.85-1.15, crossfade to another clip every 8-20 s, beat moves in a phase bin no neighbour shares. Poses are computed on the CPU (off-screen fans skipped) and uploaded as 4 vec4s per fan; the shader only bends the mesh. Far-crowd sprites follow the same director (`People.tick`).
- Crowd controls: **Moving / Still** (Still: everyone holds one pose; **Sit / Stand** picks which), **Wave** (one lap around the whole venue, then it stops), **Jump** (concerts).
- No clipping between neighbours: every clip is tagged narrow/wide by its *measured* arm span; wide clips only go to fans with free seats on both sides; arms raise elbow-first; fans face along their seat (turned at most ~14 degrees to the stage); tall neighbours that don't fit a 0.50 m seat are drawn up to 12% narrower; seats the generated layout squeezes under 0.42 m stay empty. Check: `node tools/tests/crowd_check.js [venue ...]` (clipping, adjacent sync, wave lap, a fan's own hands never passing through each other).

## UI and checks
Design system, journey and per-control decisions: `docs/ui-system.md`. Seat map: Stadium → Section → Row → Seat.
All tests run the built page in headless Chromium (`python3 tools/build_single.py` first):
- `node tools/tests/drag_check.js`: My view and Camera drag direction (mouse + touch, 4 directions).
- `node tools/tests/ui_check.js`: Crowd panel, bottom sheet, menu drawer, focus and Escape handling.
- `node tools/tests/regression_check.js [venue ...]`: every feature per venue and event type, on desktop and phone.
- `node tools/tests/crowd_check.js [venue ...]`: crowd clipping, sync, wave lap and self-intersection.
- Shipped in `js/data/humans.js` (gzip + base64, ~180 KB) and unpacked once in the background; skin, clothes and hair colours and heights are chosen per person in the app. Browsers without `DecompressionStream` fall back to the old built-in bodies.
- Same seat, full crowd: 568k -> 609k triangles, 20 -> 32 draw calls, no measurable change in crowd rebuild time.
- Rebuild: see the header of `tools/humans/build_humans.py` (about 1.5 minutes). `tools/humans/preview.py` renders check images.

## Match preview (sport events)
`js/match.js` plays a simulated match on the pitch at football, rugby and GAA events: two teams in approximate home kits, a referee and a ball, pitch markings and goals/posts. The ball carrier runs at the line and passes when tackled (backwards in rugby); a score sets the whole crowd off. It is a preview of how play looks from your seat, not a replay.

## Seat map
Level tabs, search and filters sit in a toolbar above the map (nothing covers the sections); labels are drawn only where they fit. Tapping a section zooms in and opens a section bar with Row and Seat pickers; the seat card has ‹ › to step along the row, and the chosen seat is kept in view above the card.
