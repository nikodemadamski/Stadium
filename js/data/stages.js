/* Stage presets. Positions are relative to the stage front: x across, dz = metres back from the stage front (negative = further back).
 * Neither preset is any real tour's design (none is published in reusable form). "Golden statue" is the set piece from the project brief. */
window.STAGE_PRESETS = {
  standard: {
    name: "Standard end stage", kinds: ["stadium"],
    note: "Generic end-stage size used to judge sight-lines — not a specific tour's design.",
    deck: { width: 56, depth: 18, height: 2.2 }, roofHeight: 22,
    screens: [ { x: -36, w: 12, h: 8, y: 9, dz: -4 }, { x: 36, w: 12, h: 8, y: 9, dz: -4 }, { x: 0, w: 24, h: 10, y: 12, dz: -17.6 } ],
    path: [ [-14, -1.5], [0, -1.2], [14, -1.5], [0, -1.2] ], pathSeconds: 30
  },
  arena: {
    name: "Arena end stage", kinds: ["arena"],
    note: "Generic arena end stage — not a specific tour's design.",
    deck: { width: 22, depth: 12, height: 1.8 }, roofHeight: 13,
    screens: [ { x: -15, w: 8, h: 5, y: 7, dz: -2 }, { x: 15, w: 8, h: 5, y: 7, dz: -2 } ],
    path: [ [-8, -1.2], [0, -1], [8, -1.2], [0, -1] ], pathSeconds: 24
  },
  theatre: {
    name: "Proscenium stage", kinds: ["theatre"],
    note: "Generic proscenium stage — not a specific production's set.",
    deck: { width: 16, depth: 12, height: 1.1 }, roofHeight: 11,
    screens: [],
    path: [ [-5, -2], [0, -2.5], [5, -2], [0, -4] ], pathSeconds: 20
  },
  goldenStatue: {
    name: "Golden statue set piece", kinds: ["stadium"],
    note: "The set piece from the brief: a giant golden statue centre-stage; the performer walks behind it, then around it. Not a real tour's design.",
    deck: { width: 56, depth: 18, height: 2.2 }, roofHeight: 22,
    screens: [ { x: -36, w: 12, h: 8, y: 9, dz: -4 }, { x: 36, w: 12, h: 8, y: 9, dz: -4 } ],
    statue: { x: 0, dz: -9, plinth: 3, height: 14 },
    path: [ [-12, -1.5], [0, -1.5], [7, -4.5], [7.5, -10], [3, -14.5], [-3, -14.5], [-7.5, -10], [-7, -4.5], [0, -1.8] ], pathSeconds: 40
  }
};
