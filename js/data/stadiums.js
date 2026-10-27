/* All stadium data. Every number has a `src` key pointing at window.SOURCES, or is marked "placeholder" (⚠️).
 * Geometry convention: metres, origin = pitch centre, y up. Ring parameter p in [0,8):
 *   0–1 end A (−z), 1–2 corner, 2–3 side B (+x), 3–4 corner, 4–5 end C (+z), 5–6 corner, 6–7 side D (−x), 7–8 corner.
 * group.endTag "A"/"C" marks an end stand/terrace (used to close the stand behind the stage at concerts).
 * Groups either list real block ids (`blocks`) or are split into `zones` — zones are an app division,
 *   NOT official section numbers, and are labelled as such everywhere in the UI.
 * Scraped: 23 Oct 2026. */
window.STADIUMS = [
  // ---------------------------------------------------------------- AVIVA
  {
    id: "aviva", kind: "stadium", name: "Aviva Stadium", city: "Dublin",
    capacity: { value: 51711, src: "aviva_official_home" },
    seatedTarget: { value: 50425, src: "calc", note: "51,711 official minus ~1,300 Level 4 box seats (secondary source) — box seats not modelled" },
    concertCapacity: { value: 65000, src: "wiki_aviva" },
    field: { length: 106, width: 68, src: "wiki_aviva" },
    ring: { halfX: 41, halfZ: 63, radius: 16 },
    rowLetters: { skip: ["I", "O"], src: "mapaplan_blocks" },
    seatWidth: 0.5, aisleWidth: 1.1, maxSeatsPerRow: { value: 35, src: "mapaplan_blocks" },
    numbering: "real-thirdparty",
    numberingNote: "Block numbers and order from third-party seating maps (no official readable map is published) ⚠️",
    stage: { defaultEnd: "A", endName: { A: "North Stand end", C: "South Stand end" }, src: "seatingplan_net",
      note: "Inferred: the third-party concert plan omits North-end blocks 129–141. One aggregator says 'south end' ⚠️" },
    levels: [
      { id: "L1", name: "Level 1 · Lower", rows: 30, d0: 0, y0: 1.3, tread: 0.8, rise0: 0.30, riseGrow: 0.0045, color: 0x2f6b4f,
        groups: [
          { stand: "North Stand", endTag: "A", blocks: [132,133,134,135,136,137], p: [0.0, 1.0] },
          { stand: "North-East corner", endTag: "A", blocks: [138,139,140,141], p: [1.0, 2.0] },
          { stand: "East Stand", blocks: [101,102,103,104,105,106,107,108,109], p: [2.0, 3.0] },
          { stand: "South-East corner", blocks: [110], p: [3.0, 3.55] },
          { stand: "South Stand", endTag: "C", blocks: [112,113,114,115], p: [4.0, 5.0] },
          { stand: "South-West corner", blocks: [116,117], p: [5.0, 5.7] },
          { stand: "West Stand", blocks: [119,120,121,122,123,124,125,126,127,128], p: [6.0, 7.0] },
          { stand: "North-West corner", endTag: "A", blocks: [129,130,131], p: [7.0, 8.0] }
        ] },
      { id: "L3", name: "Level 3 · Premium", rows: 14, d0: 20.5, y0: 13.5, tread: 0.85, rise0: 0.42, riseGrow: 0.004, color: 0x24543f,
        groups: [
          { stand: "East Stand", blocks: [301,302,303,304,305,306,307,308,309,310,311], p: [2.15, 3.85] },
          { stand: "South Stand", endTag: "C", blocks: [312,313,314,315,316,317,318,319,320], p: [3.85, 5.15] },
          { stand: "West Stand", blocks: [321,322,323,324,325,326,327,328,329,330,331], p: [5.15, 6.80] }
        ] },
      { id: "L5", name: "Level 5 · Upper", rows: 38, d0: 31.0, y0: 26.5, tread: 0.8, rise0: 0.5, riseGrow: 0.003, color: 0x2f6b4f, fill: 0.5775,
        groups: [
          { stand: "East Stand", blocks: [501,502,503,504,505,506,507,508,509,510,511], p: [1.55, 3.75] },
          { stand: "South Stand", endTag: "C", blocks: [512,513,514,515,516,517,518,519], p: [3.75, 5.25] },
          { stand: "West Stand", blocks: [520,521,522,523,524,525,526,527,528,529], p: [5.25, 7.45] }
        ] }
    ],
    boxBand: { d: 33.0, y: [21.5, 25.5], p: [2.15, 6.80] }
  },
  // ---------------------------------------------------------------- CROKE PARK
  {
    id: "croke", kind: "stadium", name: "Croke Park", city: "Dublin",
    fillSeated: 0.775, fillStanding: 0.8775, // CALIBRATED ⚠️ so modelled seats/spots = official 69,100 seated + 13,200 terraced
    capacity: { value: 82300, src: "wiki_croke" },
    seatedTarget: { value: 69100, src: "wiki_croke" },
    standingTarget: { value: 13200, src: "wiki_croke" },
    field: { length: 145, width: 88, src: "wiki_croke" },
    ring: { halfX: 50, halfZ: 78.5, radius: 20 },
    rowLetters: { skip: ["I", "O"], src: "dublinjournal_croke" },
    seatWidth: 0.5, aisleWidth: 1.1,
    numbering: "zones",
    numberingNote: "The GAA publishes no readable section list (official map is an image-only canvas). Stands and tiers are real; the zones inside each stand are an app division, not your ticket's section number ⚠️",
    stage: { defaultEnd: "A", endName: { A: "Hill 16 / Railway end", C: "Davin Stand / Canal end" }, src: "placeholder",
      note: "Which end the stage uses at Croke Park concerts is not published in a readable source. Check your ticket's seat map; use 'Switch stage end' if needed ⚠️" },
    levels: [
      { id: "LO", name: "Lower tier", rows: 45, d0: 0, y0: 1.2, tread: 0.8, rise0: 0.3, riseGrow: 0.004, color: 0x1d4f8c,
        rowsSrc: "dublinjournal_croke", rowsNote: "Rows A–Z then AA–WW in lower sections (third-party fan guide) ⚠️",
        groups: [
          { stand: "Cusack Stand", zones: 8, p: [1.45, 3.4] },
          { stand: "Davin Stand", endTag: "C", zones: 7, p: [3.4, 5.6] },
          { stand: "Hogan Stand", zones: 8, p: [5.6, 7.55] },
          { stand: "Hill 16 / Nally Terrace", endTag: "A", zones: 6, p: [7.55, 9.45], standing: true, rows: 78, tread: 0.5, rise0: 0.2, riseGrow: 0.002, color: 0x6b5a3a }
        ] },
      { id: "PR", name: "Premium · Level 5", rows: 12, d0: 37.5, y0: 20.5, tread: 0.85, rise0: 0.45, riseGrow: 0.004, color: 0x173f70,
        groups: [
          { stand: "Cusack Stand", zones: 6, p: [1.6, 3.4] },
          { stand: "Davin Stand", endTag: "C", zones: 5, p: [3.4, 5.6] },
          { stand: "Hogan Stand", zones: 6, p: [5.6, 7.4] }
        ] },
      { id: "UP", name: "Upper tier · Level 7", rows: 30, d0: 49, y0: 29, tread: 0.8, rise0: 0.5, riseGrow: 0.003, color: 0x1d4f8c,
        groups: [
          { stand: "Cusack Stand", zones: 8, p: [1.6, 3.4] },
          { stand: "Davin Stand", endTag: "C", zones: 7, p: [3.4, 5.6] },
          { stand: "Hogan Stand", zones: 8, p: [5.6, 7.4] }
        ] }
    ]
  },
  // ---------------------------------------------------------------- PÁIRC UÍ CHAOIMH
  {
    id: "puc", kind: "stadium", name: "Páirc Uí Chaoimh", city: "Cork",
    fillSeated: 0.8901, fillStanding: 0.8623, // CALIBRATED ⚠️ to official 21,000 seated + 24,000 terraces
    capacity: { value: 45000, src: "cork_gaa_seating" },
    seatedTarget: { value: 21000, src: "cork_gaa_seating" },
    standingTarget: { value: 24000, src: "cork_gaa_seating" },
    field: { length: 144, width: 88, src: "wiki_puc" },
    ring: { halfX: 50, halfZ: 78, radius: 22 },
    rowLetters: { skip: ["I", "O"], src: "cork_gaa_seating" },
    seatWidth: 0.5, aisleWidth: 1.1,
    numbering: "zones",
    numberingNote: "Cork GAA confirms the stands, tiers and that Row A is closest to the pitch, but publishes no readable section list. Zones are an app division ⚠️",
    stage: { defaultEnd: "A", endName: { A: "City End", C: "Blackrock End" }, src: "ticketmaster_zach_puc",
      note: "Inferred: the official Ticketmaster note for Zach Bryan (June 2026) put the family standing area on the Blackrock End terrace, so the stage is assumed at the City End ⚠️" },
    levels: [
      { id: "LO", name: "Lower / single tier", rows: 30, d0: 0, y0: 1.2, tread: 0.8, rise0: 0.3, riseGrow: 0.004, color: 0x9b1c24,
        groups: [
          { stand: "North Stand", zones: 7, p: [1.6, 3.4] },
          { stand: "Blackrock End terrace", endTag: "C", zones: 5, p: [3.4, 5.6], standing: true, rows: 64, tread: 0.5, rise0: 0.2, riseGrow: 0.002, color: 0x6b5a3a },
          { stand: "South Stand · Lower", zones: 7, p: [5.6, 7.4] },
          { stand: "City End terrace", endTag: "A", zones: 5, p: [7.4, 9.6], standing: true, rows: 64, tread: 0.5, rise0: 0.2, riseGrow: 0.002, color: 0x6b5a3a }
        ] },
      { id: "UP", name: "South Stand · Upper", rows: 20, d0: 27, y0: 15, tread: 0.8, rise0: 0.45, riseGrow: 0.003, color: 0x7d1219,
        groups: [ { stand: "South Stand · Upper", zones: 7, p: [5.7, 7.3] } ] }
    ]
  },
  // ---------------------------------------------------------------- THOMOND PARK
  {
    id: "thomond", kind: "stadium", name: "Thomond Park", city: "Limerick",
    fillSeated: 0.9026, fillStanding: 0.9314, // CALIBRATED ⚠️ to 15,100 seated + 10,000 terraces
    capacity: { value: 25100, src: "wiki_thomond", note: "Reduced from 25,600 to 25,100 in Oct 2025 (Wikipedia)" },
    seatedTarget: { value: 15100, src: "wiki_thomond" },
    standingTarget: { value: 10000, src: "calc", note: "25,100 total − 15,100 seated" },
    concertCapacity: { value: 25000, src: "irelandview_thomond", note: "'just over 25,000 for concerts' (third-party) ⚠️" },
    field: { length: 120, width: 70, src: "placeholder", note: "Thomond's exact field size is not published; World Rugby maximum (100 m + 2 × 10 m in-goal, 70 m wide) used ⚠️" },
    ring: { halfX: 40, halfZ: 65, radius: 12 },
    rowLetters: { skip: ["I", "O"], src: "irelandreport_thomond" },
    seatWidth: 0.5, aisleWidth: 1.1,
    numbering: "zones",
    numberingNote: "Stands are real (East, West, North & South terraces). Rows run A at the pitch up to QQ in the West Stand (third-party). Zones are an app division ⚠️",
    stage: { defaultEnd: "A", endName: { A: "North Terrace (Ballynanty End)", C: "South Terrace (City End)" }, src: "placeholder",
      note: "Published concert maps show the stage at one end with East & West Stands either side, but not which end in readable form ⚠️" },
    levels: [
      { id: "LO", name: "Stands & terraces", rows: 39, d0: 0, y0: 1.2, tread: 0.8, rise0: 0.32, riseGrow: 0.004, color: 0xa3151b,
        rowsSrc: "irelandreport_thomond", rowsNote: "West Stand rows A–QQ (third-party) ⚠️",
        groups: [
          { stand: "East Stand", zones: 6, p: [1.7, 3.3], rows: 30 },
          { stand: "South Terrace (City End)", endTag: "C", zones: 5, p: [3.3, 5.7], standing: true, rows: 32, tread: 0.5, rise0: 0.2, riseGrow: 0.002, color: 0x6b5a3a },
          { stand: "West Stand", zones: 7, p: [5.7, 7.3] },
          { stand: "North Terrace (Ballynanty End)", endTag: "A", zones: 5, p: [7.3, 9.7], standing: true, rows: 32, tread: 0.5, rise0: 0.2, riseGrow: 0.002, color: 0x6b5a3a }
        ] }
    ]
  },
  // ---------------------------------------------------------------- 3ARENA (indoor amphitheatre)
  {
    id: "3arena", name: "3Arena", city: "Dublin", kind: "arena", blockPrefix: "Block ",
    capacity: { value: 13000, src: "wiki_3arena", note: "9,300 seated / 13,000 with standing (Wikipedia; venue says 'over 13,000')" },
    seatedTarget: { value: 8460, src: "calc", note: "Tier seats ≈ 9,300 seated (Wikipedia) − ~840 flat-floor seats (rows A–P × seats 10–69, MapaPlan). Standing floor = 13,000 − tiers ⚠️" },
    concertCapacity: { value: 13000, src: "wiki_3arena" },
    field: { length: 30, width: 36, src: "placeholder", note: "Floor size is not published; sized so the furthest seat is ~61 m from the stage (Wikipedia: 60 m) ⚠️" },
    ring: { halfX: 18, halfZ: 15, radius: 10 },
    rowLetters: { skip: ["I", "O"], src: "arena_findseat" },
    seatWidth: 0.5, aisleWidth: 1.0, fillSeated: 0.6272, // CALIBRATED ⚠️ to 8,460 tier seats
    numbering: "real-official",
    numberingNote: "Block letters (A–G lower tier, H–P upper tier) and row numbers (1–32 lower, 33–53 upper) are from 3Arena's official Find a Seat page. Seats per row are estimates ⚠️",
    stage: { defaultEnd: "A", frontF: 4, endName: { A: "Stage end", C: "Back of arena" }, src: "arena_findseat", fixedEnd: true,
      note: "3Arena is a fan-shaped bowl around an end stage (official map); the stage cannot move." },
    levels: [
      { id: "LT", name: "Lower tier", rows: 32, rowStart: 1, d0: 0, y0: 0.9, tread: 0.72, rise0: 0.3, riseGrow: 0.003, color: 0x5b2a86,
        groups: [ { stand: "Lower tier", blocks: ["A","B","C","D","E","F","G"], p: [1.45, 6.55] } ] },
      { id: "UT", name: "Upper tier", rows: 21, rowStart: 33, d0: 20, y0: 13.5, tread: 0.75, rise0: 0.48, riseGrow: 0.004, color: 0x46206a,
        groups: [ { stand: "Upper tier", blocks: ["H","J","K","L","M","N","P"], p: [1.55, 6.45] } ] }
    ]
  },
  // ---------------------------------------------------------------- BORD GÁIS ENERGY THEATRE
  {
    id: "bget", name: "Bord Gáis Energy Theatre", city: "Dublin", kind: "theatre",
    capacity: { value: 2111, src: "bget_capacity", note: "2,111 seats (third-party listings; the theatre's own site does not state it) ⚠️" },
    seatedTarget: { value: 2111, src: "bget_capacity" },
    noFloorCrowd: true,
    field: { length: 8, width: 16, src: "placeholder", note: "Orchestra pit / front-of-stage size not published ⚠️" },
    ring: { halfX: 8, halfZ: 4, radius: 3.5 },
    rowLetters: { skip: ["I", "O"], src: "bget_plan" },
    seatWidth: 0.52, aisleWidth: 1.0, fillSeated: 0.4887, // CALIBRATED ⚠️ to 2,111 seats
    numbering: "zones",
    numberingNote: "The theatre's official plan shows three levels: Stalls, Circle, Upper Circle. Seat-level numbering is not published in readable form, so zones are an app division ⚠️",
    stage: { defaultEnd: "A", frontF: 4, endName: { A: "Stage", C: "Back of auditorium" }, src: "bget_plan", fixedEnd: true, note: "Proscenium stage at the front of the auditorium." },
    levels: [
      { id: "ST", name: "Stalls", rows: 26, d0: 0, y0: 0.4, tread: 0.9, rise0: 0.12, riseGrow: 0.002, color: 0x8a1c2b,
        groups: [ { stand: "Stalls", zones: 5, p: [2.55, 5.45] } ] },
      { id: "CI", name: "Circle", rows: 10, d0: 15, y0: 6.5, tread: 0.9, rise0: 0.42, riseGrow: 0.004, color: 0x751726,
        groups: [ { stand: "Circle", zones: 5, p: [2.4, 5.6] } ] },
      { id: "UC", name: "Upper Circle", rows: 12, d0: 21, y0: 12.5, tread: 0.85, rise0: 0.5, riseGrow: 0.004, color: 0x5f1220,
        groups: [ { stand: "Upper Circle", zones: 5, p: [2.35, 5.65] } ] }
    ]
  }
];