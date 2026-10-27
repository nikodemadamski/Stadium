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
- 4 looks (2 men, 2 women: T-shirt/long sleeves, short/crop/long/bob hair) x 3 levels of detail (~3,300 / ~1,000 / ~340 triangles), rigged with an 11-bone skeleton.
- Animated on the GPU: sitting/standing, clapping, dancing on the beat, fists up, filming on a phone, running. A "crowd director" (`People.tick`) drives group moments shared by the near people and the 50k far-crowd sprites: Mexican waves (auto at sport, or the Wave button), synchronised jumps at concerts (Jump button), everyone up for a score.
- Shipped in `js/data/humans.js` (gzip + base64, ~180 KB) and unpacked once in the background; skin, clothes and hair colours and heights are chosen per person in the app. Browsers without `DecompressionStream` fall back to the old built-in bodies.
- Same seat, full crowd: 568k -> 609k triangles, 20 -> 32 draw calls, no measurable change in crowd rebuild time.
- Rebuild: see the header of `tools/humans/build_humans.py` (about 1.5 minutes). `tools/humans/preview.py` renders check images.

## Match preview (sport events)
`js/match.js` plays a simulated match on the pitch at football, rugby and GAA events: two teams in approximate home kits, a referee and a ball, pitch markings and goals/posts. The ball carrier runs at the line and passes when tackled (backwards in rugby); a score sets the whole crowd off. It is a preview of how play looks from your seat, not a replay.

## Seat map
Level tabs, search and filters sit in a toolbar above the map (nothing covers the sections); labels are drawn only where they fit. Tapping a section zooms in and opens a section bar with Row and Seat pickers; the seat card has ‹ › to step along the row, and the chosen seat is kept in view above the card.
