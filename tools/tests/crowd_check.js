/* Crowd checks: limb clipping between neighbours, adjacent fans in sync, Mexican wave lap.
 * Runs the built page in headless Chromium and uses the SAME pose code the GPU draws (js/crowd.js).
 *   node tools/tests/crowd_check.js [venue ...]        (needs Playwright; default: all six venues)
 * Bodies are capsules (metres, scaled by each fan's height / 1.75): torso hips->neck r 0.14, head r 0.10,
 * upper arm r 0.05, forearm r 0.04, hand r 0.04. A clip is a limb of one fan entering a neighbour's capsule. */
const { chromium } = require("playwright"), path = require("path");
const PAGE = "file://" + path.resolve(__dirname, "../../index.html");
const VENUES = process.argv.slice(2).length ? process.argv.slice(2) : ["aviva", "croke", "puc", "thomond", "3arena", "bget"];

function inPage(opts) { // runs inside the page
  const Cw = window.Crowd, P = window.People, L = P.looks();
  const fans = __app.sc.nearGroup.children[0].children.flatMap((m) => m.userData.people || []).map((p) => p.fan).filter(Boolean);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function segDist(p1, q1, p2, q2) { // closest distance between segments (Ericson, Real-Time Collision Detection 5.1.9)
    const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r); let s, t;
    if (a < 1e-12 && e < 1e-12) { s = t = 0; } else if (a < 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); } else {
      const c = dot(d1, r); if (e < 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else {
        const b = dot(d1, d2), den = a * e - b * b; s = den ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0; t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); } } }
    const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
    return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
  }
  function world(f, q) { // joints in metres, in the venue
    const p = f.p, J = Cw.joints(L[f.look], q), h = p.h || p.d.h, c = Math.cos(p.rot), s = Math.sin(p.rot), o = {};
    for (const k in J) { const v = J[k], x = v[0] * (f.wscale || 1); o[k] = [(c * x + s * v[2]) * h + p.x, v[1] * h + p.y, (-s * x + c * v[2]) * h + p.z]; }
    o.k = h / 1.75 * (f.wscale || 1); return o;
  }
  const pairs = []; // neighbours: centres within 1.0 m
  for (let i = 0; i < fans.length; i++) for (let j = i + 1; j < fans.length; j++) { const a = fans[i].p, b = fans[j].p; if (Math.hypot(a.x - b.x, a.z - b.z) < 1.0) pairs.push([i, j]); }
  const TOL = opts.tol || 0; // metres of overlap allowed (skin/cloth contact, not visible clipping)
  function limbHits(A, B) { // A's arms against B's torso, head and arms -> [part, depth]
    const out = []; ["L", "R"].forEach((S) => {
      const segs = [["upper", A["sh" + S], A["el" + S], 0.05], ["fore", A["el" + S], A["wr" + S], 0.04], ["hand", A["wr" + S], A["tip" + S], 0.04]];
      segs.forEach(([nm, p, q, r]) => {
        const rr = r * A.k, chk = (part, d, R) => { const dep = rr + R - d; if (dep > TOL) out.push([nm + ">" + part, dep]); };
        chk("torso", segDist(p, q, B.hip, B.neck), 0.14 * B.k); chk("head", segDist(p, q, B.head, B.head), 0.10 * B.k);
        ["L", "R"].forEach((T) => { chk("fore", segDist(p, q, B["el" + T], B["wr" + T]), 0.04 * B.k); chk("upper", segDist(p, q, B["sh" + T], B["el" + T]), 0.05 * B.k); });
      });
    }); return out;
  }
  const G = Object.assign({}, P.G), res = { fans: fans.length, pairs: pairs.length, scenarios: {} };
  const q = fans.map(() => Cw.blank());
  for (const sc of opts.scenarios) {
    const hits = {}, byClip = {}, parts = {}, geo = { side: 0, frontBack: 0 }, depths = []; let samples = 0, restTight = 0, maxSync = 0;
    const syncRun = new Map(), dt = sc.dt || 0.25;
    for (let t = sc.t0; t < sc.t0 + sc.len; t += dt) {
      Object.assign(G, sc.G, { uTime: t }); samples++;
      const W = fans.map((f, i) => world(f, Cw.pose(f, t, G, q[i])));
      for (const [i, j] of pairs) {
        const h = limbHits(W[i], W[j]).concat(limbHits(W[j], W[i]));
        if (h.length) { const key = i + "-" + j; hits[key] = (hits[key] || 0) + 1; const c = G.still ? "still" : (fans[i].fixed || Cw.clipAt(fans[i], t)) + "/" + (fans[j].fixed || Cw.clipAt(fans[j], t)); byClip[c] = (byClip[c] || 0) + 1;
          h.forEach(([pt, d]) => { parts[pt] = (parts[pt] || 0) + 1; depths.push(d); });
          const a = fans[i].p, b = fans[j].p, side = Math.abs((b.x - a.x) * Math.cos(a.rot) - (b.z - a.z) * Math.sin(a.rot)); geo[side > 0.3 ? "side" : "frontBack"]++; }
        if (Math.hypot(W[i].shL[0] - W[j].shL[0], W[i].shL[2] - W[j].shL[2]) < 0.42) restTight++;

      }
    }
    const top = Object.entries(byClip).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sc.sync) { // in sync = side neighbours playing the same moving clip with motion correlated > 0.95 over a 2 s window
      const side = pairs.filter(([i, j]) => fans[i].side.some((e) => e[0] === fans[j])), run = new Map(), qq = Cw.blank();
      for (let w = sc.t0; w < sc.t0 + sc.len - 2; w += 2) {
        const ser = fans.map((f) => { const out = []; for (let t = w; t < w + 2; t += 0.1) { Object.assign(G, sc.G, { uTime: t }); const p = Cw.pose(f, t, G, qq); Cw.KEYS.forEach((k) => out.push(p[k])); } return out; });
        for (const [i, j] of side) {
          const ci = Cw.clipAt(fans[i], w), key = i + "-" + j;
          const same = !fans[i].phone && !fans[j].phone && !/idle|still/.test(ci) && ci === Cw.clipAt(fans[j], w) && ci === Cw.clipAt(fans[i], w + 2) && ci === Cw.clipAt(fans[j], w + 2);
          let r = 0; if (same) { const a = ser[i], b = ser[j], ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length; let sab = 0, saa = 0, sbb = 0;
            for (let k = 0; k < a.length; k++) { const x = a[k] - ma, y = b[k] - mb; sab += x * y; saa += x * x; sbb += y * y; } r = sab / Math.sqrt(saa * sbb + 1e-12); }
          // correlation of the raw series is dominated by the clip's constant offsets; compare motion (deltas) instead
          if (same) { const a = ser[i], b = ser[j], K = Cw.KEYS.length; let sab = 0, saa = 0, sbb = 0;
            for (let k = K; k < a.length; k++) { const x = a[k] - a[k - K], y = b[k] - b[k - K]; sab += x * y; saa += x * x; sbb += y * y; } r = saa > 1e-9 && sbb > 1e-9 ? sab / Math.sqrt(saa * sbb) : 0; }
          const n = same && r > 0.95 ? (run.get(key) || 0) + 2 : 0; run.set(key, n); if (n > maxSync) maxSync = n;
        }
      }
    }
    depths.sort((a, b) => a - b);
    res.scenarios[sc.name] = { parts: Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 6), geo, depthMedian_cm: depths.length ? +(depths[depths.length >> 1] * 100).toFixed(1) : 0, depthP95_cm: depths.length ? +(depths[Math.floor(depths.length * 0.95)] * 100).toFixed(1) : 0, samples, pairsClipping: Object.keys(hits).length, clipEvents: Object.values(hits).reduce((a, b) => a + b, 0), topClipPairs: top, tightSeatPairs: Math.round(restTight / samples), maxInSyncSeconds: sc.sync ? +maxSync.toFixed(2) : undefined };
  }
  // measured arm span per clip: furthest any arm capsule reaches sideways from the fan's centre (m, 1.75 m person)
  const span = {}; { const J = L.m0, f0 = Object.assign({}, fans[0], { fixed: null, phone: false }), Gs = Object.assign({}, P.G, { still: false, waveOn: false, cheer: 0, jump: 0 });
    for (const name in Cw.CLIPS) { let mx = 0; for (let t = 0; t < 4; t += 0.05) { const q = Cw.blank(); Cw.CLIPS[name].fn(q, t, 6.2832 * 2 * t, 0.37); const j = Cw.joints(J, q);
      ["L", "R"].forEach((S) => { mx = Math.max(mx, Math.abs(j["el" + S][0]) * 1.75 + 0.05, Math.abs(j["wr" + S][0]) * 1.75 + 0.04, Math.abs(j["tip" + S][0]) * 1.75 + 0.04, Math.abs(j["sh" + S][0]) * 1.75 + 0.05); }); }
      span[name] = { tag: Cw.CLIPS[name].span, halfSpan_m: +mx.toFixed(3) }; } }
  res.clipSpan = span;
  // wave: every seat in the venue (every 7th) must rise exactly once, in angle order, and the wave must stop
  const seats = __app.model.seats.filter((_, i) => i % 7 === 0), Gw = Object.assign({}, P.G, { waveOn: true, waveT0: 100, waveLen: P.waveLen, waveA0: 0, cx: 0, cz: 0 });
  let once = 0, never = 0, twice = 0, after = 0; const starts = [];
  seats.forEach((s) => { let n = 0, up = false, first = null;
    for (let t = 99; t < 100 + Gw.waveLen + 6; t += 0.1) { Gw.uTime = t; const st = Cw.waveUp(Cw.waveLocal(Gw, s.x, s.z)).stand > 0.5; if (st && !up) { n++; if (first === null) first = t; } up = st; if (st && t > 100 + Gw.waveLen + 3) after++; }
    if (n === 1) once++; else if (n === 0) never++; else twice++; starts.push([Math.atan2(s.x, s.z), first]); });
  starts.sort((a, b) => ((a[0] % 6.2832) + 6.2832) % 6.2832 - (((b[0] % 6.2832) + 6.2832) % 6.2832));
  let backwards = 0; for (let i = 1; i < starts.length; i++) if (starts[i][1] < starts[i - 1][1] - 0.15) backwards++;
  res.wave = { seatsSampled: seats.length, roseOnce: once, never, twice, risingAfterLapEnd: after, outOfOrder: backwards, lapSeconds: Gw.waveLen };
  return res;
}

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] }); const all = {};
  for (const v of VENUES) {
    const p = await b.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.route(/^https?:\/\/(?!127)/, (r) => r.fulfill({ status: 404, body: "" }));
    await p.goto(PAGE + "#stadium=" + v); await p.waitForTimeout(6000);
    const out = {};
    for (const [label, sport, standing] of [["concert-standing", false, true], ["seated", false, false]]) {
      await p.evaluate(([sport, standing]) => { const cb = document.getElementById("standing"); if (cb.checked !== standing) { cb.checked = standing; cb.dispatchEvent(new Event("change")); }
        People.ctx.sport = sport; const m = __app.model, bl = m.blocks.filter((b) => !b.standing)[Math.floor(m.blocks.length / 3)] || m.blocks[0], r = bl.rowInfo[Math.floor(bl.rows / 2)];
        SeatMap.zoomToBlock(m.blocks.indexOf(bl)); SeatMap.selectSeat(r.start + Math.floor(r.count / 2)); __app.setMode("seat"); }, [sport, standing]);
      await p.waitForTimeout(3000);
      const base = { beat: 2, still: false, waveOn: false, waveT0: -1e9, waveLen: 20, jump: 0, cheer: 0, cheerT: -1e9, cx: 0, cz: 0 };
      out[label] = await p.evaluate(inPage, { scenarios: [
        { name: "animated", t0: 1000, len: 60, sync: true, G: Object.assign({}, base) },
        { name: "group-jump+cheer", t0: 2000, len: 8, G: Object.assign({}, base, { jump: 1, cheer: 1, cheerT: 2000 }) },
        { name: "wave", t0: 3000, len: 26, dt: 0.1, G: Object.assign({}, base, { waveOn: true, waveT0: 3000, waveLen: 24 }) },
        { name: "still", t0: 4000, len: 2, G: Object.assign({}, base, { still: true }) } ] });
    }
    out.errors = errs; all[v] = out; console.log(v, JSON.stringify(out)); await p.close();
  }
  require("fs").writeFileSync(process.env.OUT || "crowd_check.json", JSON.stringify(all, null, 1)); await b.close();
})();
