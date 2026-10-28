/* Arm volume check: skins each body look (LOD 0) into arms-up poses on the CPU with the SAME formula as the
 * shader (js/people.js People.skinCPU), slices the upper arm and forearm perpendicular to the posed bone and compares
 * the cross-section (width x depth, cm) with the same pose skinned rigidly (each vertex follows only its main bone:
 * the arm's own thickness). Linear blend skinning is measured too, as the "before".
 * Also counts the sides of the posed arm at every level of detail (3-4 sides read as a flat strip).
 *   node tools/tests/arm_volume_check.js     exits 1 if a section keeps < 85% of its rigid size or has < 5 sides */
const { chromium } = require("playwright"), path = require("path");
const PAGE = "file://" + path.resolve(__dirname, "../../index.html") + "#stadium=3arena";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] }), p = await b.newPage();
  await p.route(/^https?:\/\/(?!127)/, (r) => r.fulfill({ status: 404, body: "" }));
  const glErrs = []; p.on("console", (m) => { if (/Shader couldn't compile|getShaderInfoLog|getProgramInfoLog/.test(m.text())) glErrs.push(m.text().split("\n")[0].slice(0, 160)); });
  await p.goto(PAGE); await p.waitForFunction(() => window.__app && __app.ready && Object.keys(People.looks()).length, { timeout: 90000 });
  // the GPU shader must compile and draw people (the CPU copy below can't catch a shader that fails to compile)
  const drawn = await p.evaluate(async () => { const m = __app.model, b = m.blocks.find((x) => x.standing) || m.blocks[0], r = b.rowInfo[Math.min(5, b.rows - 1)]; SeatMap.selectSeat(r.start + Math.floor(r.count / 2)); __app.setMode("seat");
    await new Promise((res) => setTimeout(res, 2500)); const A = __app, R = A.renderer, gl = R.getContext(); A.paused = true; A.sc.scene.children.forEach((c) => { if (!c.isLight) c.visible = c === A.sc.nearGroup; }); R.render(A.sc.scene, A.sc.camera);
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); let lit = 0; for (let i = 0; i < W * H; i++) if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 30) lit++;
    A.sc.scene.children.forEach((c) => { c.visible = true; }); A.paused = false; return lit / (W * H); });
  console.log("GPU: shader errors " + glErrs.length + (glErrs.length ? " (" + glErrs[0] + ")" : "") + ", people cover " + (drawn * 100).toFixed(1) + "% of the view");
  const res = await p.evaluate(() => {
    const L = People.looks(), C = Crowd, out = [], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
    const poses = { cheer: (q) => C.CLIPS.cheer.fn(q, 0, 0, 0.3), sway: (q) => C.CLIPS.sway.fn(q, 0, 0, 0.3), phone: (q) => C.CLIPS.phone.fn(q, 0, 0, 0.3) };
    for (const look of Object.keys(L)) {
      let g = null; for (let k = 0; k < 400 && !g; k++) { const t = People.makeCrowd([{ x: 0, y: 0, z: 0, rot: 0, k, h: 1.75, lod: 0, clip: "still_stand" }]); if (t.children[0] && t.children[0].userData.people[0].fan.look === look) g = t; }
      if (!g) continue; const m = g.children[0];
      const geo = m.geometry, idx = geo.index.array, J = L[look], res = {};
      for (const [pn, fn] of Object.entries(poses)) for (const mode of ["rigid", "linear", "angle"]) {
        const q = C.blank(); fn(q); People.SKIN_MODE = mode; const V = People.skinCPU(geo, J, q), Jp = C.joints(J, q); People.SKIN_MODE = "angle";
        const sec = (a, c, t) => { const ax = sub(c, a), u = nrm(ax), ctr = a.map((v, i) => v + ax[i] * t), pts = [];
          for (let f = 0; f < idx.length; f += 3) for (let e = 0; e < 3; e++) { const i0 = idx[f + e], i1 = idx[f + (e + 1) % 3], p0 = V.slice(i0 * 3, i0 * 3 + 3), p1 = V.slice(i1 * 3, i1 * 3 + 3), d0 = dot(sub(p0, ctr), u), d1 = dot(sub(p1, ctr), u);
            if ((d0 > 0) !== (d1 > 0)) { const s = d0 / (d0 - d1), x = p0.map((v, i) => v + (p1[i] - v) * s), r = sub(x, ctr), perp = r.map((v, i) => v - u[i] * dot(r, u)); if (Math.hypot(...perp) < 0.075) pts.push(perp); } }
          if (pts.length < 3) return null; const e1 = nrm(cross(u, [0, 0, 1])), e2 = cross(u, e1); const xs = pts.map((r) => dot(r, e1)), ys = pts.map((r) => dot(r, e2));
          return [(Math.max(...xs) - Math.min(...xs)) * 175, (Math.max(...ys) - Math.min(...ys)) * 175]; };
        res[pn + ":" + mode] = [["upper", Jp.shL, Jp.elL, 0.35], ["upper", Jp.shL, Jp.elL, 0.6], ["fore", Jp.elL, Jp.wrL, 0.5]].map(([n, a, c, t]) => sec(a, c, t));
      }
      out.push({ look, ...res });
    }
    // every level of detail: how many sides the posed arm's cross-section has (3-4 sides = a flat-looking strip)
    const sides = [];
    for (const look of Object.keys(L)) for (const lod of [0, 1, 2]) {
      let g = null; for (let k = 0; k < 400 && !g; k++) { const t = People.makeCrowd([{ x: 0, y: 0, z: 0, rot: 0, k, h: 1.75, lod, clip: "still_stand" }]); if (t.children[0] && t.children[0].userData.people[0].fan.look === look) g = t; }
      if (!g) continue; const geo = g.children[0].geometry, idx = geo.index.array, J = L[look], q = C.blank(); C.CLIPS.cheer.fn(q, 0, 0, 0.3);
      const V = People.skinCPU(geo, J, q), Jp = C.joints(J, q), row = { look, lod, tris: idx.length / 3 };
      for (const [nm, a, c, t] of [["upper60", Jp.shL, Jp.elL, 0.6], ["fore50", Jp.elL, Jp.wrL, 0.5]]) {
        const ax = sub(c, a), u = nrm(ax), ctr = a.map((v, i) => v + ax[i] * t), seen = new Set();
        for (let f = 0; f < idx.length; f += 3) for (let e = 0; e < 3; e++) { const i0 = idx[f + e], i1 = idx[f + (e + 1) % 3], d0 = dot(sub(V.slice(i0 * 3, i0 * 3 + 3), ctr), u), d1 = dot(sub(V.slice(i1 * 3, i1 * 3 + 3), ctr), u);
          if ((d0 > 0) !== (d1 > 0)) { const s = d0 / (d0 - d1), x = [0, 1, 2].map((j) => V[i0 * 3 + j] + (V[i1 * 3 + j] - V[i0 * 3 + j]) * s), r = sub(x, ctr); if (Math.hypot(...r.map((v, j) => v - u[j] * dot(r, u))) < 0.06) seen.add(Math.min(i0, i1) + "-" + Math.max(i0, i1)); } }
        row[nm + "_sides"] = seen.size; }
      sides.push(row);
    }
    return { looks: out, sides };
  });
  let bad = 0; const rows = [];
  for (const r of res.looks) for (const pose of ["cheer", "sway", "phone"]) [0, 1, 2].forEach((i) => {
    const rig = r[pose + ":rigid"][i], keep = (x) => x && rig ? Math.min(x[0] / rig[0], x[1] / rig[1]) : 0, lin = keep(r[pose + ":linear"][i]), ang = keep(r[pose + ":angle"][i]);
    if (ang < 0.85) bad++; const f = (x) => x ? x.map((v) => v.toFixed(1)).join(" x ") : "-";
    rows.push({ look: r.look, pose, section: ["upper 35%", "upper 60%", "forearm 50%"][i], rigid_cm: f(rig), linear_cm: f(r[pose + ":linear"][i]), linearKept: (lin * 100).toFixed(0) + "%", angle_cm: f(r[pose + ":angle"][i]), angleKept: (ang * 100).toFixed(0) + "%" });
  });
  if (glErrs.length || drawn < 0.05) bad++;
  console.table(rows); console.table(res.sides); res.sides.forEach((r) => { if (r.upper60_sides < 5 || r.fore50_sides < 5) bad++; }); console.log(bad ? "SQUASHED: " + bad + " sections" : "ALL ARMS KEEP THEIR VOLUME"); await b.close(); process.exit(bad ? 1 : 0);
})();
