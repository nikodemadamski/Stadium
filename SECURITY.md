# Seat View — security test report (24 Oct 2026)

**What there is to attack.** Seat View has no server, no accounts and no database. It is one HTML file that runs in your browser. The attack surface is:

- Outside data it reads: Ticketmaster replies, MusicBrainz replies, share links.
- Things stored in your browser: your Ticketmaster key, the cached event list and your saved seats.
- 3D model files you import.
- The optional local relay, `tools/tm_proxy.py`.

**How it was tested.** Scripted attacks were run in headless Chromium (the engine Edge and Chrome use) with all network traffic faked, then repeated after the fixes:

- `tests/pentest_browser.py` and `tests/pentest_tm_events.py`: browser attacks.
- `tests/relay_attack.py`: attacks on the relay.
- `tests/functional_csp.py`: checks that nothing broke.

Raw results are in `tests/results_before.json` and `tests/results_after.json`.

## Findings

| # | Attack | Severity | Before | After |
|---|---|---|---|---|
| 1 | Another HTML file on your PC reads your Ticketmaster key (Chrome/Edge give every local file the same storage) | High | Key stolen | Key is kept for this tab only by default. "Remember on this device" is opt-in and comes with a warning |
| 2 | A planted value in browser storage injects code into Seat View (chained with #1) | High | Script ran; `javascript:` links planted | Every cached event is rebuilt through strict checks; nothing ran |
| 3 | A crafted MusicBrainz reply (event id or date) injects code | Medium | Script ran | Ids and dates are format-checked and output is escaped; nothing ran |
| 4 | No second line of defence: any injected script would run | Medium | Inline script and handler ran | The security policy only allows the app's own 15 scripts, locked by hash. Injected scripts, handlers and `eval` are refused by the browser |
| 5 | Seat View loaded inside someone else's page (clickjacking) | Low | Key panel usable | Key panel switched off when framed. The relay also sends no-framing headers. A file can't fully forbid framing on its own |
| 6 | Policy allowed two hosts that are no longer used | Low | Allowed | Removed |
| 7 | Damaged or hostile 3D files: looping hierarchy, 2-billion-vertex claims, out-of-range data, 61 MB files, JSON bombs, external links | Low | All rejected safely; looping file showed a raw stack-overflow error; size checked after reading | All rejected. Size checked before reading; loops rejected explicitly; friendly messages |
| 8 | Relay script missing from the project, though the app told you to run it | Bug | Missing | Rebuilt and hardened; 23/23 attacks refused |

## What was attacked and found already safe
- **Hostile Ticketmaster replies:** HTML in names, `javascript:` links, bad dates, hostile venue ids. Nothing ran.
- **Hostile share links:** script in the link, `__proto__` tricks, a 2 MB link. Nothing ran and the app still loaded.
- **Script typed into every input box:** nothing ran.
- **Relay attacks:**
  - reaching it from another machine on the network;
  - fake Host headers (DNS rebinding);
  - cross-site requests spending your quota;
  - other Ticketmaster endpoints and `../` path tricks;
  - reading project or system files;
  - POST, PUT, DELETE and OPTIONS requests;
  - a 70 KB oversized request.

  All refused.

## Known limits (not fixed, stated plainly)
- **three.js r97** has CVE-2020-28496, a denial of service from a slow text pattern in `Color.setStyle`. Seat View never passes text into that function, only numbers from its built-in data, so the flaw can't be reached. Upgrading three.js is a large change and was not done.
- **Inline styles are still allowed** (`style-src 'unsafe-inline'`). Injected styling could change how the page looks, but cannot run code.
- **A key kept in the browser is readable by anyone using that browser profile.** Ticketmaster's own tutorial calls the API from the browser the same way. Running `tools/tm_proxy.py` keeps the key out of the browser entirely.
- **Not tested:** Safari, Firefox, real Ticketmaster and MusicBrainz servers (replies were simulated), or a professional penetration test.
## Public hosting (27 Oct 2026)
- **Key exposure:** on the public site the key lives only in Vercel's `TM_API_KEY` setting and is used by `api/events.js`. The page has no key box, and the key never appears in the page, browser storage or replies (tested, including a Ticketmaster error that echoes the key).
- **Quota abuse:** 50 parallel requests and 20 more cost 12 Ticketmaster calls in total; query strings (cache-busting) get 400; POST/PUT/DELETE/OPTIONS get 405. During a Ticketmaster outage, 30 requests caused only one refresh (5-minute back-off, also cached by the CDN).
- **Hostile Ticketmaster data through the relay:** cleaned on the server and again in the browser; no script, handler or `javascript:` link reached the page.
- **Clickjacking:** now fully blocked by real headers (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), plus HSTS, `nosniff`, `no-referrer`, COOP and a Permissions-Policy.
- **What is published:** only the built `index.html` and the `/api/events` function.
