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
## Publishing (Vercel)
1. Import this repo in Vercel. `vercel.json` does the rest: it builds only `public/index.html` (tools, sources and docs are not published), adds security headers, and deploys `api/events.js`.
2. In Vercel → Project → Settings → Environment Variables add `TM_API_KEY` = your Ticketmaster Consumer Key (Production). Redeploy.
3. The public site then shows live Ticketmaster events with no key box. The key stays on the server; visitors never see it.

Abuse protection on `/api/events`: one fixed URL (any `?…` is refused, so the cache can't be bypassed), Vercel's CDN serves one cached copy for 6 h, parallel requests share one refresh, and after a failure Ticketmaster is left alone for 5 min. Ticketmaster gets ~12 calls per refresh however many people visit (free limit: 5,000/day). Without `TM_API_KEY` the site still works with the listed events.
Never put the key in a file in this repo; `.env` files are git-ignored.
