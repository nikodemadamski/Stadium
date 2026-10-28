/* Crowd clips and per-fan players for the near crowd (the ~500 rigged people around your seat).
 * Every fan owns a SLOT (seat or terrace spot) and only plays IN-PLACE clips, so nobody drifts into a neighbour.
 * A clip is a small function that sets joint angles for the 11-bone rig in js/people.js; people.js uploads the pose
 * to the GPU each frame. The same pose code drives tools/tests (clipping check), so what is tested is what is drawn.
 *
 * Arm span: every clip is tagged "narrow" (hands stay inside the fan's own seat width: arms move forward/up, never
 * out to the side) or "wide" (side-to-side sway). Wide clips only go to fans with room on both sides.
 * Randomness is deterministic: seeded by the fan's seat, so the same seat behaves the same on every reload.
 * Each fan: weighted clip pool, own start offset, timeScale 0.85-1.15 (clip timing and crossfades), crossfade to another
 * clip every 8-20 s, never starts the same clip within 2 s of the neighbour next to them, and moves on the beat in a
 * phase bin no neighbour shares (so adjacent fans are never in lock-step). */
(function () {
  var C = window.Crowd = {};
  function h(a, b) { var x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); }
  function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  C.hash = h; C.smooth = sm;
  var KEYS = ["thL", "thR", "shL", "shR", "twist", "sway", "lean", "nod", "fL", "sL", "ffL", "yL", "fR", "sR", "ffR", "yR", "jump", "phone"];
  function blank() { var o = {}; for (var i = 0; i < KEYS.length; i++) o[KEYS[i]] = 0; return o; }
  // Blend two poses. Arms raise/lower ELBOW FIRST: mid-transition the elbow bends in proportion to how far the upper
  // arm travels, so hands pass close to the body instead of sweeping straight out into the person in front.
  function mixInto(a, b, w) {
    var tuckL = Math.sin(Math.PI * w) * Math.min(1, Math.abs(b.fL - a.fL) / 1.2), tuckR = Math.sin(Math.PI * w) * Math.min(1, Math.abs(b.fR - a.fR) / 1.2);
    for (var i = 0; i < KEYS.length; i++) { var k = KEYS[i]; a[k] += (b[k] - a[k]) * w; }
    // elbow bent (never folded past ~120 degrees: a folded forearm points back OUT) and swung in while travelling
    a.ffL = Math.max(-2.1, a.ffL - 1.0 * tuckL); a.ffR = Math.max(-2.1, a.ffR - 1.0 * tuckR);
    a.yL = Math.max(a.yL, Math.min(0.3, 0.6 * tuckL)); a.yR = Math.max(a.yR, Math.min(0.3, 0.6 * tuckR)); return a; // capped: more swing-in crosses the hands (see C.armK)
  }
  C.blank = blank; C.mix = mixInto;
  // Angle conventions (rest pose = standing, arms down): f < 0 raises the upper arm forward (-2.8 = overhead), s > 0
  // moves it out to the side (applied before the raise, so it means "out" at any height), ff < 0 bends the elbow forward, y > 0 swings a raised arm in across the body (so forearms
  // held in front - clapping, dancing - stay inside the fan's own width); th < 0 raises the thigh, sh > 0 bends the knee.
  function sit(p, u) { p.thL = p.thR = -1.45 * u; p.shL = p.shR = 1.45 * u; p.lean = 0.12 * u; }
  // The modelled rest pose hangs the arms ~7 degrees outward (elbows 2 cm wider than the shoulders); s = -0.2 brings
  // the elbows under the shoulders so a fan's arms stay inside their own seat width (measured: tools/tests/crowd_check.js).
  function lap(p, u) { p.fL = p.fR = -0.35 * u; p.ffL = p.ffR = -1.1 * u; p.sL = p.sR = -0.2 * u; p.yL = p.yR = 0.2 * u; } // hands on their own thighs, ~10 cm apart (0.4 laid one hand through the other)
  function restArms(p) { p.sL = p.sR = -0.2; p.fL = p.fR = -0.12; p.ffL = p.ffR = -0.45; p.yL = p.yR = 0.25; } // hands in front of the thighs, apart
  // Arms raised overhead, hands a little in over the head.
  function upArms(p, S, f, u) { p["f" + S] = f; p["s" + S] = -0.32; p["ff" + S] = -0.2; p["y" + S] = 0; }
  var TAU = 6.2832;
  // Hands meet at y = 0.40 (measured, 1.75 m male look: fingertips 1.5 cm off the midline) and must never pass it.
  // The old 0.55 ± 0.12 swung each hand up to 20 cm through the other. Now: open ~26 cm apart, palms touch once per beat.
  function clapArms(p, b) { p.fL = p.fR = -0.85; p.ffL = p.ffR = -1.2; p.sL = p.sR = -0.2; p.yL = p.yR = 0.40 - 0.26 * (0.5 + 0.5 * Math.sin(b)); }
  function phoneArm(p) { p.fR = -1.25; p.sR = 0; p.ffR = -1.4; p.yR = 0.35; p.phone = 1; p.nod = 0.15; } // phone held up in front of the face
  function chestArms(p, S, u) { p["f" + S] = -0.5; p["ff" + S] = -1.5 + 0.2 * u; p["s" + S] = -0.2; p["y" + S] = 0.3; } // forearms up in front, elbows in, hands apart (0.45 crossed them)
  // clip(p, t, beat, seed): t = clip-local seconds, beat = beat phase in radians (already offset and time-scaled per fan)
  var CLIPS = C.CLIPS = {
    still_stand: { span: "narrow", seated: false, fn: function (p) { restArms(p); } },
    still_sit: { span: "narrow", seated: true, fn: function (p) { sit(p, 1); lap(p, 1); } },
    idle: { span: "narrow", seated: false, fn: function (p, t, b, s) { restArms(p); p.sway = 0.04 * Math.sin(t * 0.7 + s * TAU); p.nod = 0.05 * Math.sin(t * 0.45 + s * 9); } },
    sit_idle: { span: "narrow", seated: true, fn: function (p, t, b, s) { sit(p, 1); lap(p, 1); p.nod = 0.06 * Math.sin(t * 0.4 + s * 9); p.twist = 0.06 * Math.sin(t * 0.23 + s * 5); } },
    clap: { span: "narrow", seated: false, fn: function (p, t, b) { clapArms(p, b); } },
    sit_clap: { span: "narrow", seated: true, fn: function (p, t, b) { sit(p, 1); clapArms(p, b); } },
    bounce: { span: "narrow", seated: false, fn: function (p, t, b) { var u = 0.5 + 0.5 * Math.sin(b); p.thL = p.thR = -0.3 * u; p.shL = p.shR = 0.6 * u; chestArms(p, "L", u); chestArms(p, "R", u); p.twist = 0.1 * Math.sin(b * 0.5); } },
    fist_pump: { span: "narrow", seated: false, fn: function (p, t, b) { var u = Math.max(0, Math.sin(b)); upArms(p, "R", -2.6 + 0.3 * u); p.ffR = -0.35 * (1 - u); chestArms(p, "L", 0); p.thL = p.thR = -0.15 * u; p.shL = p.shR = 0.3 * u; } },
    cheer: { span: "narrow", seated: false, fn: function (p, t, b) { var u = Math.sin(b); upArms(p, "L", -2.8 + 0.12 * u); upArms(p, "R", -2.8 + 0.12 * u); p.thL = p.thR = -0.12 * (0.5 + 0.5 * u); p.shL = p.shR = 0.24 * (0.5 + 0.5 * u); } },
    sit_cheer: { span: "narrow", seated: true, fn: function (p, t, b) { sit(p, 1); var u = Math.sin(b); upArms(p, "L", -2.75 + 0.12 * u); upArms(p, "R", -2.75 + 0.12 * u); } },
    jump: { span: "narrow", seated: false, fn: function (p, t, b) { var u = Math.max(0, Math.sin(b)), land = Math.max(0, -Math.sin(b)); p.jump = 0.06 * u; p.thL = p.thR = -0.3 * land; p.shL = p.shR = 0.6 * land; chestArms(p, "L", u); chestArms(p, "R", u); } },
    sway: { span: "wide", seated: false, fn: function (p, t, b) { var a = 0.45 * Math.sin(b * 0.5); p.fL = p.fR = -2.8; p.sL = a; p.sR = -a; p.ffL = p.ffR = -0.15; p.sway = 0.08 * Math.sin(b * 0.5); } },
    phone: { span: "narrow", seated: false, fn: function (p, t, b, s) { restArms(p); phoneArm(p); p.sway = 0.03 * Math.sin(t * 0.6 + s * 7); } },
    sit_phone: { span: "narrow", seated: true, fn: function (p) { sit(p, 1); lap(p, 1); phoneArm(p); } },
    run: { span: "wide", seated: false, fn: function (p, t) { var r = t * 9, w = 0.65 * Math.sin(r); p.thL = w; p.thR = -w; p.shL = 0.4 + 0.5 * Math.max(0, -Math.sin(r)); p.shR = 0.4 + 0.5 * Math.max(0, Math.sin(r)); p.fL = 0.55 * Math.sin(r); p.fR = -0.55 * Math.sin(r); p.ffL = p.ffR = -1.2; p.lean = 0.12; } },
    perform: { span: "wide", seated: false, fn: function (p, t, b) { var u = 0.5 + 0.5 * Math.sin(b); p.thL = p.thR = -0.3 * u; p.shL = p.shR = 0.6 * u; p.twist = 0.3 * Math.sin(b * 0.5); p.fR = -2.4 + 0.4 * Math.sin(b * 0.5); p.sR = 0.4; p.ffR = -0.4; p.fL = -1.2; p.sL = 0.5 + 0.3 * Math.sin(b * 0.25); p.ffL = -0.8; } }
  };
  // Weighted pools (clip, weight). Wide clips are skipped for fans without room.
  var POOLS = C.POOLS = {
    concert_stand: [["bounce", 30], ["fist_pump", 18], ["idle", 12], ["clap", 10], ["jump", 10], ["cheer", 8], ["sway", 12]],
    concert_sit: [["sit_idle", 50], ["sit_clap", 35], ["sit_cheer", 15]],
    sport_sit: [["sit_idle", 60], ["sit_clap", 40]],
    sport_stand: [["idle", 60], ["clap", 40]]
  };
  function pickFrom(pool, room, r) {
    var tot = 0, i; for (i = 0; i < pool.length; i++) if (room || CLIPS[pool[i][0]].span !== "wide") tot += pool[i][1];
    var x = r * tot; for (i = 0; i < pool.length; i++) { if (!room && CLIPS[pool[i][0]].span === "wide") continue; x -= pool[i][1]; if (x <= 0) return pool[i][0]; }
    return pool[pool.length - 1][0];
  }
  // Fans: one per near person. people: [{x,z,k,sit,phone,rot,...}] in the order they are drawn.
  var BINS = 12; // up to ~8 neighbours within 0.9 m in a theatre; 12 bins always leave a free one
  C.HALF_SPAN = 0.142; // widest narrow clip 0.238 m for a 1.75 m fan (0.136 x height), plus room for arms in transit
  C.makeFans = function (people, ctx) {
    var fans = people.map(function (p) {
      var s = h(p.k, 21);
      return { p: p, k: p.k, seed: s, ts: 0.85 + 0.3 * h(p.k, 22), off: h(p.k, 23) * 97, P: 8 + 12 * h(p.k, 24), beatOff: 0, wscale: 1,
        seated: !!p.sit, phone: !!p.phone, fixed: p.clip || null, room: true, left: null, near: [], side: [], cache: {} };
    });
    // neighbours within 0.9 m: "side" ones share the row (perpendicular to the way the fan faces)
    fans.forEach(function (f, i) {
      var best = null, bd = 0.81, rL = 0, rR = 0, fx = Math.cos(f.p.rot), fz = -Math.sin(f.p.rot); // fan's right-hand side
      fans.forEach(function (g, j) {
        if (i === j) return; var dx = g.p.x - f.p.x, dz = g.p.z - f.p.z, d2 = dx * dx + dz * dz; if (d2 > 0.81) return;
        f.near.push(g); var side = dx * fx + dz * fz; if (Math.abs(side) < 0.25) return; // in front / behind, not beside
        f.side.push([g, Math.sqrt(d2)]); if (side > 0) rR = 1; else rL = 1;
        if (side < 0 && d2 < bd && j < i) { bd = d2; best = g; }
      });
      f.room = !rL && !rR; f.left = best; // wide clips swing both arms both ways: free on both sides
    });
    // beat phase: every fan gets one of 12 phase bins (30 degrees apart), never the same bin as a neighbour, so nobody
    // moves in lock-step with the person next to, in front of or behind them (greedy colouring).
    fans.forEach(function (f) { // the bin furthest (in phase) from every neighbour's bin; ties broken by the fan's seed
      var start = (h(f.k, 25) * BINS) | 0, best = start, bestD = -1;
      for (var n = 0; n < BINS; n++) {
        var b = (start + n) % BINS, dmin = BINS;
        f.near.forEach(function (g) { if (g.bin != null) { var d = Math.abs(g.bin - b); dmin = Math.min(dmin, Math.min(d, BINS - d)); } });
        if (dmin > bestD) { bestD = dmin; best = b; }
      }
      f.bin = best; f.beatOff = best / BINS * TAU + (h(f.k, 26) - 0.5) * 0.08; // jitter well under half a bin
    });
    // Shoulder room: every narrow clip keeps the arms within HALF_SPAN x height of the fan's centre (measured per clip
    // by tools/tests/crowd_check.js). Where two tall neighbours still don't fit their seat spacing, both are drawn a few
    // per cent narrower (at most 12%) - invisible at crowd scale, and better than shoulders passing through each other.
    fans.forEach(function (f) {
      var hf = f.p.h || f.p.d.h;
      f.side.forEach(function (e) {
        var g = e[0], hg = g.p.h || g.p.d.h, need = C.HALF_SPAN * (hf + hg), room = e[1] - 0.005;
        if (need > room) { var k = Math.max(0.88, room / need); f.wscale = Math.min(f.wscale, k); g.wscale = Math.min(g.wscale, k); }
      });
    });

    fans.forEach(function (f) { f.pool = f.seated ? (ctx.sport ? POOLS.sport_sit : POOLS.concert_sit) : (ctx.sport ? POOLS.sport_stand : POOLS.concert_stand); });
    return fans;
  };
  function segStart(f, seg) { return (seg * f.P - f.off) / f.ts; } // in global seconds
  function clipAt(f, seg) {
    if (f.cache[seg]) return f.cache[seg];
    var c = pickFrom(f.pool, f.room, h(f.k * 1.37 + seg, 31)), L = f.left;
    if (L) { // never start the same clip as the neighbour on the left within 2 s
      var t0 = segStart(f, seg), ls = Math.floor((t0 * L.ts + L.off) / L.P), lc = clipAt(L, ls);
      if (lc === c && Math.abs(segStart(L, ls) - t0) < 2) { var alt = f.pool.filter(function (e) { return e[0] !== c && (f.room || CLIPS[e[0]].span !== "wide"); }); if (alt.length) c = alt[(h(f.k, seg + 7) * alt.length) | 0][0]; }
    }
    var keys = Object.keys(f.cache); if (keys.length > 6) delete f.cache[keys[0]];
    return (f.cache[seg] = c);
  }
  C.clipAt = function (f, t) { var tt = t * f.ts + f.off; return clipAt(f, Math.floor(tt / f.P)); };
  // Mexican wave: one lap. Each fan's turn comes when the wave front reaches their angle around the venue centre:
  // sit -> stand (0-0.5 s) -> arms up (0.35-0.9 s) -> arms down (1.4-2.0 s) -> sit (1.6-2.4 s).
  C.waveUp = function (lt) { return { stand: sm(0, 0.5, lt) * (1 - sm(1.6, 2.4, lt)), arms: sm(0.35, 0.9, lt) * (1 - sm(1.4, 2.0, lt)) }; };
  C.waveLocal = function (G, x, z) {
    var a = Math.atan2(x - G.cx, z - G.cz) - G.waveA0; a = ((a % TAU) + TAU) % TAU;
    return G.uTime - (G.waveT0 + a / TAU * G.waveLen);
  };
  // Pose of one fan at time t under the shared state G (people.js P.G): still/animated, beat, wave, cheer, jump.
  var A = blank(), B = blank();
  C.pose = function (f, t, G, out) {
    var p = out || blank(), i; for (i = 0; i < KEYS.length; i++) p[KEYS[i]] = 0;
    var s = f.seed, tl = t * f.ts + f.off, beat = TAU * G.beat * t + f.beatOff; // beat moves follow the music, each fan in its own phase bin; timeScale drives everything else
    if (f.fixed) CLIPS[f.fixed].fn(p, tl, beat, s);
    else if (G.still) CLIPS[f.seated ? "still_sit" : "still_stand"].fn(p, 0, 0, s);
    else if (f.phone) CLIPS[f.seated ? "sit_phone" : "phone"].fn(p, tl, beat, s);
    else {
      var seg = Math.floor(tl / f.P), fr = tl / f.P - seg, ca = clipAt(f, seg), w = sm(1 - 1.2 / f.P, 1, fr);
      for (i = 0; i < KEYS.length; i++) A[KEYS[i]] = 0; CLIPS[ca].fn(A, tl - seg * f.P, beat, s);
      if (w > 0) { var cb = clipAt(f, seg + 1); for (i = 0; i < KEYS.length; i++) B[KEYS[i]] = 0; CLIPS[cb].fn(B, tl - (seg + 1) * f.P, beat, s); mixInto(A, B, w); }
      for (i = 0; i < KEYS.length; i++) p[KEYS[i]] = A[KEYS[i]];
    }
    if (f.fixed) return p;
    if (f.yk) { p.yL *= f.yk; p.yR *= f.yk; } // swing-in calibrated to this body's shoulder width (C.armK)
    var seatedNow = f.seated;
    // group moments (animated only): synchronised jump at concerts, everyone up for a score
    if (!G.still && G.jump > 0 && !seatedNow) { var j = G.jump * Math.max(0, Math.sin(beat)); p.jump = Math.max(p.jump, 0.06 * j); }
    if (!G.still && G.cheer > 0) { var cw = G.cheer * sm(0, 0.6, G.uTime - G.cheerT - s * 0.3); if (cw > 0) { for (i = 0; i < KEYS.length; i++) B[KEYS[i]] = 0; CLIPS.cheer.fn(B, tl, beat, s); B.phone = p.phone; mixInto(p, B, cw); } }
    if (G.waveOn) {
      var w2 = C.waveUp(C.waveLocal(G, f.p.x, f.p.z));
      if (w2.stand > 0 || w2.arms > 0) {
        if (seatedNow) { var u = 1 - w2.stand; p.thL = p.thR = -1.45 * u; p.shL = p.shR = 1.45 * u; p.lean *= u; }
        var a = w2.arms; for (i = 0; i < KEYS.length; i++) B[KEYS[i]] = p[KEYS[i]]; upArms(B, "L", -2.8); upArms(B, "R", -2.8); B.phone = 0;
        for (i = 0; i < KEYS.length; i++) if (!/^(f|s|ff|y)[LR]$|^phone$/.test(KEYS[i])) B[KEYS[i]] = p[KEYS[i]]; // arms only
        mixInto(p, B, a);
      }
    }
    return p;
  };
  // Forward kinematics of the same rig (for tests and the clipping check): joint positions in unit-stature space.
  function rx(a, v) { var c = Math.cos(a), s = Math.sin(a); return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]; }
  function ry(a, v) { var c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]; }
  function rz(a, v) { var c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; } function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function about(p, piv, fns) { var v = sub(p, piv); fns.forEach(function (f) { v = f(v); }); return add(v, piv); }
  C.rootY = function (J, p) { // feet stay on the floor whatever the legs do; jumps lift off it
    var L1 = Math.hypot(J["knee.L"][0] - J["hip.L"][0], J["knee.L"][1] - J["hip.L"][1], J["knee.L"][2] - J["hip.L"][2]);
    var L2 = Math.hypot(J["ankle.L"][0] - J["knee.L"][0], J["ankle.L"][1] - J["knee.L"][1], J["ankle.L"][2] - J["knee.L"][2]);
    var ext = Math.max(L1 * Math.cos(p.thL) + L2 * Math.cos(p.thL + p.shL), L1 * Math.cos(p.thR) + L2 * Math.cos(p.thR + p.shR)) + J["ankle.L"][1];
    return ext - J["hip.L"][1] + p.jump;
  };
  C.joints = function (J, p) {
    var y = C.rootY(J, p), W = J.waist, spine = function (v) { return about(v, W, [function (q) { return rx(p.lean, q); }, function (q) { return rz(p.sway * 0.5, q); }, function (q) { return ry(p.twist, q); }]); };
    var out = {}, lift = function (v) { return [v[0], v[1] + y, v[2]]; };
    ["L", "R"].forEach(function (S) {
      var f = p["f" + S], s = S === "L" ? p.sL : -p.sR, y = S === "L" ? -p.yL : p.yR, ff = p["ff" + S], sh = J["sh." + S], el = J["el." + S], wr = J["wr." + S];
      var tip = add(wr, [(wr[0] - el[0]) * 0.45, (wr[1] - el[1]) * 0.45, (wr[2] - el[2]) * 0.45]);
      var up = function (v) { return about(v, sh, [function (q) { return rz(s, q); }, function (q) { return rx(f, q); }, function (q) { return ry(y, q); }]); };
      var fore = function (v) { return about(v, el, [function (q) { return rx(ff, q); }]); };
      out["sh" + S] = lift(spine(sh)); out["el" + S] = lift(spine(up(el))); out["wr" + S] = lift(spine(up(fore(wr)))); out["tip" + S] = lift(spine(up(fore(tip))));
    });
    out.waist = lift(W); out.neck = lift(spine(J.neck)); out.head = lift(spine(add(J.neck, [0, 0.07, 0.015])));
    out.hip = lift([(J["hip.L"][0] + J["hip.R"][0]) / 2, J["hip.L"][1], J["hip.L"][2]]);
    return out;
  };
  C.KEYS = KEYS;
  // Arm swing-in calibration per body look: clip angles are written for the 1.75 m male look, whose hands meet at
  // y = 0.40 in the clap pose; narrower shoulders meet sooner (female looks ~0.33). Scaling y by meet/0.40 keeps every
  // clip's hands apart on every body. Bisection on the real rig, once per look.
  C.armK = function (J) {
    if (J._armK) return J._armK;
    var q = blank(), lo = 0, hi = 1, i; q.fL = q.fR = -0.85; q.ffL = q.ffR = -1.2; q.sL = q.sR = -0.2;
    for (i = 0; i < 24; i++) { var m = (lo + hi) / 2; q.yL = q.yR = m; var j = C.joints(J, q); if (Math.min(j.tipL[0], j.wrL[0]) * 1.75 > 0.015) lo = m; else hi = m; }
    return (J._armK = lo / 0.40);
  };
})();
