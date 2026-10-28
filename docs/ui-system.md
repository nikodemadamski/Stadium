# Seat View: UI plan, design system and control decisions

## Who it is for
Irish fans checking a seat before they buy: "what will I actually see from Block 114, Row K?" They use phones in a hurry and laptops at home.
The interface is like stadium wayfinding: it gets you from the gate to your seat, then gets out of the way.

## Journey (progressive disclosure)
1. **Stadium**: sections only. You can filter by level, search "514 K 12", or open the sorted section list.
2. **Section**: the section is isolated and others fade. Stacked tiers that overlap it in plan are hidden and named.
   Rows show as bars, with a label every 5th row (more where there is room).
3. **Row**: that row's seat dots appear, with seat numbers every 5th (more where there is room).
4. **Seat**: a card for the selected seat, with My view, Camera and Share.
5. **My view / Camera**: 3D. Crowd settings sit behind one "Crowd" button. Person in front is a My view-only simulation.

Back and Escape always go up one level.

## Design system (tokens in `css/app.css` `:root`)
| Token group | Values | Why |
|---|---|---|
| Colour | `--c-bg #0E1522` stand navy · `--c-s1..s4` raised surfaces · `--c-ink #EEF2F6` floodlight white · `--c-acc #FFCF3F` signal yellow · `--c-map #4266D4` section blue · `--c-pitch #2E7D4A` | Night match under floodlights. Yellow, like steward bibs and wayfinding signs, means "you / your seat / do this". It is the only accent. Blue is a data colour for sections only. |
| Status | `--c-ok #5FD08A` · `--c-warn #FF9F43` · `--c-bad #FF6B6B` | Always paired with text or an icon, never colour alone |
| Type | `--f-display` Barlow Semi Condensed 600 (OFL, one weight, 23 KB) · `--f-body` system UI | Barlow's lettering comes from road signs: condensed and legible at small sizes. It is used for headings, buttons, section and row IDs. Body text uses the system font (no download). |
| Type scale | `--t-1 12` · `--t-2 13` · `--t-3 14` · `--t-4 16` · `--t-5 20` · `--t-6 24` px | ~1.2 ratio |
| Space | `--sp-1 4` · `--sp-2 8` · `--sp-3 12` · `--sp-4 16` · `--sp-5 24` · `--sp-6 32` px | 4-px grid |
| Radius | `--r-1 6` chips · `--r-2 8` buttons/inputs · `--r-3 12` cards/panels · `--r-4 18` floating bars/sheets | Radius follows hierarchy. Square-ish like sign plates, not pills everywhere. |
| Border | `--bw 1px` + `--c-line`, `--c-line2` | |
| Elevation | `--e-1` floating controls · `--e-2` popovers/sheets | Two levels only |
| Hit size | `--hit 44px` | Apple HIG / WCAG 2.5.5 |
| Focus | `--c-focus #8FB4FF` 2 px outline, 2 px offset | Distinct from the yellow accent, so focus never reads as "selected" |
| Motion | `--dur 160ms`; `prefers-reduced-motion` → 0 | Motion only answers an action (sheet opens, map zooms) |

### States for every control
Rest, hover (`--c-s4`), pressed (`aria-pressed=true` / `.on`: filled ink, bold weight, so not colour alone), focus-visible (blue ring), disabled (45% opacity + `not-allowed`), selected seat (yellow + ✓ mark).

### Logo
A yellow square sign plate with a navy stepped stand profile and one seat dot. It is drawn in SVG with no gradient, and it reads at 16 px.

## Layouts
| Size | Layout |
|---|---|
| Large desktop ≥ 1440 | Events rail · view · details panel |
| Laptop / tablet landscape 1024–1439 | View · details panel. Events are in the ☰ menu drawer. |
| Tablet portrait / phone ≤ 1023 | Full-height view. Details live in a **bottom sheet** opened from a tab strip. Venue and event pickers and the events list are in the ☰ drawer. |
| Phone landscape (height ≤ 520) | Compact header. The sheet becomes a right-side drawer, so the view keeps its height. |

## Control inventory and decisions
| Control | Decision | Why |
|---|---|---|
| Mode bar (Seats / Stadium / My view / Camera) | **Keep** | Primary navigation, always visible |
| Venue and Event selects | **Keep** on desktop; **move to menu** on phones | Rarely changed once chosen |
| Events rail (list, calendar, search, type chips, Go live) | **Keep** ≥ 1440; **move to menu** drawer below | Takes 270 px from the map on laptops |
| Map level tabs, seat search, Filters | **Contextual**: stadium level only | Inside a section the breadcrumb bar replaces them |
| Filters (distance, behind stage, Surprise me) | **Keep**, collapsed behind Filters | Secondary |
| Section bar (back, name, Row / Seat selects) | **Keep**, now a breadcrumb that steps back one level; adds the tier note | Keyboard and screen-reader path to rows and seats |
| Zoom + / − / whole venue | **Keep** | Alternative to pinch for mouse, keyboard and motor-impaired users |
| Seat card (prev/next, See view, Camera, Copy link, ×) | **Keep**; buttons renamed "My view", "Camera view", "Share link" | Same names as the mode bar |
| "Pick by section / row / seat number" panel | **Merge** into search + section bar | Three pickers did the same job |
| Crowd bar (Empty/Half/Full, Moving/Still, Sit/Stand, Wave, Jump) | **Move to panel** behind one **Crowd** button; Wave/Jump stay as quick actions | Eight buttons were floating over the view |
| "Crowd standing" checkbox (Show tab) + Still → Sit/Stand | **Merge** into one Sitting/Standing control | Both set the same `state.standing` |
| Phones-up slider (Show tab) | **Move** into the Crowd panel | It is a crowd setting |
| fps / people HUD | **Remove** from the default view (people count moves into the Crowd panel; fps only with `#debug`) | Developer information |
| Hint pill | **Keep**, contextual per mode | Tells you what the gesture does |
| Person in front Short / Average / Tall | **Contextual**: My view only | Simulation, labelled "simulated" |
| Details tabs (Seats / Show / Photos / Info) | **Keep**: side panel on desktop, bottom sheet on phones | |
| "Realistic 3D people" (.glb upload) | **Move** into a collapsed "Advanced" section | Power-user feature |
| iPhone camera UI (lenses, shutter, zoom, rotate, close) | **Keep** | Simulates the real Camera app |
