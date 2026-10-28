# Credits and licences

Everything the public site ships, where it came from, and under what licence. Checked 27 Oct 2026.
Raw third-party files are never served: Cloudflare publishes only `public/index.html` (see `wrangler.jsonc`).

## Crowd animation clips

All crowd clips are **original work written for this project** (in-place, procedural joint angles in `js/crowd.js`).
No motion-capture or downloaded animation is used. Arm span is measured per clip by `tools/tests/crowd_check.js`
(half-width for a 1.75 m fan, arm capsule included; a seat is 0.50 m wide, so "narrow" must stay under 0.25 m).

| Clip | Use | Span tag | Measured half-width | Source | Licence | Date |
|---|---|---|---|---|---|---|
| still_stand | Still mode, standing | narrow | 0.238 m | original (`js/crowd.js`) | this project | 2026-10-27 |
| still_sit | Still mode, seated | narrow | 0.238 m | original | this project | 2026-10-27 |
| idle | standing idle, weight shift | narrow | 0.244 m | original | this project | 2026-10-27 |
| sit_idle | seated idle | narrow | 0.242 m | original | this project | 2026-10-27 |
| clap / sit_clap | clapping on the beat | narrow | 0.238 m | original | this project | 2026-10-27 |
| bounce | knee bounce on the beat | narrow | 0.241 m | original | this project | 2026-10-27 |
| fist_pump | one arm pumping | narrow | 0.238 m | original | this project | 2026-10-27 |
| cheer / sit_cheer | both arms up | narrow | 0.238 m | original | this project | 2026-10-27 |
| jump | jumping on the beat | narrow | 0.238 m | original | this project | 2026-10-27 |
| sway | arms overhead, swaying | **wide** (only with free seats both sides) | 0.515 m | original | this project | 2026-10-27 |
| phone / sit_phone | filming on a phone | narrow | 0.242 m | original | this project | 2026-10-27 |
| run | match-preview players | n/a (pitch) | - | original | this project | 2026-10-27 |
| perform | performer on stage | n/a (stage) | - | original | this project | 2026-10-27 |
| Mexican wave | sit → stand → arms up → sit, one lap | narrow | - | original | this project | 2026-10-27 |

Considered and **not used**: Quaternius Universal Animation Library (CC0) and MoCap Online could not be checked
(their hosts are blocked from the build environment); Mixamo (licence forbids redistributing raw files);
CMU Motion Capture via https://github.com/una-dinosauria/cmu-mocap ("free for use in research and commercial
projects") has idle, sit-to-stand and jump clips but no clap, cheer or in-place concert dance.

## 3D people

| Asset | Source | Licence | Date |
|---|---|---|---|
| Base body mesh, default skeleton + skin weights, macro shape targets | MakeHuman, https://github.com/makehumancommunity/makehuman (`makehuman/data`, `LICENSE.ASSETS.md`) | CC0 1.0 | 2026-10-27 |
| Clothes, hair, poses, levels of detail (generated from the above) | `tools/humans/build_humans.py` (original) → `js/data/humans.js` | this project | 2026-10-27 |

## Code and fonts

| Library | Source | Licence | Date |
|---|---|---|---|
| three.js r97 | https://threejs.org (`js/vendor/three.r97.min.js`) | MIT | bundled before 2026-10-23 |
| Barlow Semi Condensed 600 (latin) | https://github.com/jpt/barlow via npm `@fontsource/barlow-semi-condensed@5.3.0` (`assets/fonts/`, inlined at build) | SIL OFL 1.1 (`assets/fonts/OFL-Barlow.txt`) | 2026-10-28 |

## Photos and data

- Venue photos: Wikimedia Commons, shown unmodified with author and licence (CC BY / CC BY-SA, per photo) - the full
  list with author, licence and link is `PHOTOS` / `SOURCES` in `js/data/sources.js` and the app's Sources tab.
- Live events: Ticketmaster Discovery API (shown, not stored beyond the browser / worker cache) and MusicBrainz (CC0).
- No OpenStreetMap data is used.
