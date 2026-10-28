/* Realistic-proportion crowd people, built in code (no download, works offline, nothing to license).
 * Body dimensions come from published anthropometry, not guesses:
 *  - stature, Ireland: men 178.9 cm, women 165.1 cm (NCD-RisC, via historydata.com / dataqia.com)
 *  - shoulder (biacromial) breadth: men 41.1 cm, women 36.7 cm (CDC NHANES III 1988-94); bideltoid adds ~5-8 cm of soft tissue
 * Proportions below are fractions of stature. One mesh (~400 triangles) instanced per person on the GPU.
 * Replaces the Kenney "Mini Characters": those are stylised with oversized heads/bodies, and at real-person
 * height they were ~2x too wide - neighbours' heads filled the "View from seat" camera. */
(function () {
  var T = THREE, P = window.People = {};
  P.source = {
    stature: "NCD-RisC mean adult height, Ireland (cohort born 1996): men 178.9 cm, women 165.1 cm",
    shoulders: "CDC NHANES III (1988-94) mean biacromial breadth: men 41.1 cm, women 36.7 cm"
  };
  P.STATURE = { m: 1.789, f: 1.651 };
  P.SD = 0.07; // ~7 cm spread, typical adult height SD
  // part ids: 0 skin, 1 top, 2 legs, 3 hair, 4 shoes
  function addPart(out, geo, part, mtx) {
    geo = geo.toNonIndexed(); geo.applyMatrix(mtx);
    var p = geo.attributes.position.array, n = geo.attributes.normal.array;
    for (var i = 0; i < p.length; i += 3) { out.P.push(p[i], p[i + 1], p[i + 2]); out.N.push(n[i], n[i + 1], n[i + 2]); out.A.push(part); }
    geo.dispose();
  }
  function M(x, y, z, sx, sy, sz, rx) { var m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, 0, 0)), new T.Vector3(sx || 1, sy || 1, sz || 1)); return m; }
  // Smooth surface of revolution from a [radius, height] profile (unit stature), squashed front-to-back by `depth`.
  function lathe(prof, seg, depth) { seg = Math.max(6, seg * SEG | 0); var pts = prof.map(function (q) { return new T.Vector2(Math.max(q[0], 0.0005), q[1]); }); var g = new T.LatheBufferGeometry(pts, seg); g.scale(1, 1, depth); g.computeVertexNormals(); return g; }
  var SEG = 1; function limb(r0, r1, len) { return new T.CylinderBufferGeometry(r1, r0, len, Math.max(5, 8 * SEG | 0), 1, true); } // r0 at bottom
  function ball(r, sx, sy, sz) { var g = new T.SphereBufferGeometry(r, Math.max(5, 8 * SEG | 0), Math.max(4, 6 * SEG | 0)); g.scale(sx || 1, sy || 1, sz || 1); return g; }
  // Point a limb from joint A to joint B (unit coords) and add it.
  function addLimb(o, A, B, r0, r1, part) {
    var a = new T.Vector3(A[0], A[1], A[2]), b = new T.Vector3(B[0], B[1], B[2]), d = b.clone().sub(a), len = d.length();
    var g = limb(r1, r0, len), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    addPart(o, g, part, new T.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new T.Vector3(1, 1, 1)));
    if (SEG >= 1) addPart(o, ball(r0 * 1.02), part, M(A[0], A[1], A[2])); // rounded joint (near LOD only)
  }
  // Unit-height body (stature = 1). x = width, y = up, z = facing direction. phone: right arm raised holding a phone.
  // iPhone 17 Pro body: 71.9 x 150.0 x 8.75 mm (Apple tech specs) -> scaled by the person's stature at render time.
  P.PHONE_MM = [71.9, 150.0, 8.75];
  P.buildBody = function (sex, phone, lod) { lod = lod || 0; SEG = lod === 2 ? 0.4 : lod ? 0.6 : 1; var tiny = lod === 2; // lod 2: far people - no ears/nose/hands/shoes
    var o = { P: [], N: [], A: [] }, f = sex === "f";
    var sh = (f ? 0.367 / 1.651 : 0.411 / 1.789) + 0.03, hipW = f ? 0.205 : 0.19; // shoulder width incl. deltoid; hip breadth
    var legX = hipW * 0.26, legTop = 0.475;
    // legs (thigh + shin), shoes
    [-1, 1].forEach(function (s) {
      var hip = [s * legX, legTop, 0], knee = [s * legX * 0.92, 0.285, 0.006], ank = [s * legX * 0.9, 0.045, 0];
      addLimb(o, hip, knee, f ? 0.05 : 0.048, 0.034, 2); addLimb(o, knee, ank, 0.034, 0.022, 2);
      if (!tiny) addPart(o, ball(1, 0.035, 0.024, 0.075), 4, M(s * legX * 0.9, 0.022, 0.03));
    });
    // pelvis + torso: one smooth profile (waist narrower than shoulders/hips; chest fuller for women)
    var tor = f ? [[0.0, 0.46], [0.095, 0.47], [0.108, 0.52], [0.098, 0.58], [0.083, 0.62], [0.088, 0.66], [0.1, 0.71], [0.104, 0.75], [0.098, 0.79], [0.08, 0.815], [0.03, 0.83], [0.0, 0.832]]
                : [[0.0, 0.46], [0.09, 0.47], [0.1, 0.52], [0.095, 0.58], [0.09, 0.62], [0.096, 0.67], [0.106, 0.72], [0.112, 0.77], [0.108, 0.8], [0.085, 0.82], [0.03, 0.835], [0.0, 0.837]];
    var tg = lathe(tor, 16, 0.58); tg.applyMatrix(new T.Matrix4().makeScale(sh / 0.23, 1, 1)); addPart(o, tg, 1, new T.Matrix4());
    addPart(o, ball(1, sh * 0.5, 0.035, 0.065), 1, M(0, 0.81, 0)); // shoulder line
    // arms: left hangs; right hangs or holds phone up at eye level
    var shY = 0.815, shX = sh * 0.5 - 0.012;
    addLimb(o, [-shX, shY, 0], [-shX - 0.02, 0.63, -0.01], 0.03, 0.025, 1);
    addLimb(o, [-shX - 0.02, 0.63, -0.01], [-shX - 0.02, 0.48, 0.02], 0.023, 0.018, 0);
    if (!tiny) addPart(o, ball(1, 0.02, 0.03, 0.012), 0, M(-shX - 0.02, 0.455, 0.022));
    if (!phone) {
      addLimb(o, [shX, shY, 0], [shX + 0.02, 0.63, -0.01], 0.03, 0.025, 1);
      addLimb(o, [shX + 0.02, 0.63, -0.01], [shX + 0.02, 0.48, 0.02], 0.023, 0.018, 0);
      if (!tiny) addPart(o, ball(1, 0.02, 0.03, 0.012), 0, M(shX + 0.02, 0.455, 0.022));
    } else {
      var el = [shX + 0.03, 0.74, 0.13], wr = [0.06, 0.9, 0.2]; // upper arm forward, forearm up: phone ~0.2 H in front of face
      addLimb(o, [shX, shY, 0], el, 0.03, 0.025, 1); addLimb(o, el, wr, 0.023, 0.018, 0);
      addPart(o, ball(1, 0.022, 0.03, 0.014), 0, M(wr[0], wr[1] + 0.02, wr[2]));
      var mm = 1 / 1700; // phone in unit-stature space for a 1.70 m person; per-instance height scales it ~1:1
      addPart(o, new T.BoxBufferGeometry(P.PHONE_MM[0] * mm, P.PHONE_MM[1] * mm, P.PHONE_MM[2] * mm), 5, M(wr[0], wr[1] + 0.045, wr[2] + 0.01, 1, 1, 1, -0.25));
    }
    // neck + head (head height ~0.13 H) with jaw/face front, ears, hair
    addPart(o, limb(0.029, 0.027, 0.06), 0, M(0, 0.86, 0.004));
    var hd = lathe([[0, 0.873], [0.024, 0.875], [0.036, 0.89], [0.043, 0.91], [0.046, 0.935], [0.046, 0.955], [0.042, 0.977], [0.032, 0.992], [0.017, 1.0], [0, 1.001]], 20, 1.18); addPart(o, hd, 0, M(0, 0, 0.004));
    if (!tiny) { addPart(o, ball(1, 0.008, 0.016, 0.006), 0, M(-0.046, 0.935, 0.0)); addPart(o, ball(1, 0.008, 0.016, 0.006), 0, M(0.046, 0.935, 0.0));
    addPart(o, ball(1, 0.007, 0.012, 0.01), 0, M(0, 0.93, 0.056)); } // ears, nose
    var hair = new T.SphereBufferGeometry(1, Math.max(8, 14 * SEG | 0), Math.max(5, 8 * SEG | 0), 0, Math.PI * 2, 0, Math.PI * 0.52); addPart(o, hair, 3, M(0, 0.948, -0.006, 0.0505, 0.058, 0.0605));
    if (f) addPart(o, lathe([[0.046, 0.86], [0.05, 0.9], [0.05, 0.95], [0.04, 0.97]], 14, 1.15), 3, M(0, 0, -0.012)); // longer hair at the back/sides
    o.tris = o.P.length / 9;
    return o;
  };
  var VS = [
    "attribute float aPart; attribute vec3 iOffset; attribute float iRot; attribute float iH; attribute float iSit;",
    "attribute vec3 iSkin; attribute vec3 iTop; attribute vec3 iLegs; attribute vec3 iHair;",
    "varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vY; varying float vPart;",
    "void main(){ vec3 p = position; vY = p.y; vPart = aPart;",
    "  if (iSit > 0.5) { if (aPart > 1.5 && aPart < 2.5 && p.y < 0.47) { p.z += (0.47 - p.y) * 0.9; p.y = 0.47 - (0.47 - p.y) * 0.12; } if (aPart > 3.5 && aPart < 4.5) { p.y = 0.43; p.z += 0.4; } p.y -= 0.22; }", // seated: fold legs away, lower body onto seat
    "  p *= iH; float c = cos(iRot), s = sin(iRot);",
    "  p = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z) + iOffset; vN = vec3(c*normal.x + s*normal.z, normal.y, -s*normal.x + c*normal.z); vW = p;",
    "  vCol = aPart < 0.5 ? iSkin : aPart < 1.5 ? iTop : aPart < 2.5 ? iLegs : aPart < 3.5 ? iHair : aPart < 4.5 ? vec3(0.08) : (normal.z < -0.5 ? vec3(1.05, 1.12, 1.25) : vec3(0.12));",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }"].join("\n");
  // Night-concert lighting: warm key light from the stage, cool sky fill, rim light where surfaces turn away from the camera,
  // soft ground occlusion. Viewed from behind (as in a crowd) people read as backlit silhouettes, like real concert photos.
  P.LIGHT_FS = [
    "uniform vec3 uStage; uniform vec3 uKey; uniform vec3 uFill; uniform vec3 uRim;",
    "vec3 concertLight(vec3 base, vec3 N, vec3 W, float y, float emissive){",
    "  vec3 L = normalize(uStage - W); vec3 V = normalize(cameraPosition - W);",
    "  float d = max(dot(N, L), 0.0); float wrap = max((dot(N, L) + 0.35) / 1.35, 0.0);",
    "  float sky = 0.5 + 0.5 * N.y; float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);",
    "  float ao = mix(0.45, 1.0, smoothstep(0.0, 0.85, y));",
    "  vec3 col = base * (uFill * (0.45 + 0.55 * sky) * 1.15 + uKey * (0.75 * d + 0.25 * wrap)) * ao + uRim * rim * 0.55 * (0.4 + 0.6 * wrap);", // fill lifted so backs (what a crowd shows you) keep their colours
    "  float dist = length(cameraPosition - W); col = mix(col, vec3(0.03, 0.035, 0.06), smoothstep(40.0, 160.0, dist) * 0.6);",
    "  return mix(col, base, emissive); }"].join("\n");
  var FS = [P.LIGHT_FS, "varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vY; varying float vPart;",
    "void main(){ float em = (vPart > 4.5 && vCol.r > 1.0) ? 1.0 : 0.0;",
    "  gl_FragColor = vec4(concertLight(vCol, normalize(vN), vW, vY, em), 1.0); }"].join("\n");
  P.lightUniforms = function () { return { uStage: { value: (P.stagePos || new T.Vector3(0, 6, -40)).clone() }, uKey: { value: new T.Color(1.0, 0.86, 0.72) }, uFill: { value: new T.Color(0.42, 0.44, 0.56) }, uRim: { value: new T.Color(0.75, 0.55, 1.0) } }; };
  var SKIN = [[0.96, 0.80, 0.69], [0.92, 0.72, 0.58], [0.82, 0.62, 0.48], [0.68, 0.48, 0.36], [0.52, 0.36, 0.26], [0.36, 0.24, 0.18]];
  var TOPS = [[0.1, 0.1, 0.12], [0.85, 0.85, 0.85], [0.15, 0.25, 0.5], [0.55, 0.1, 0.12], [0.1, 0.4, 0.2], [0.75, 0.6, 0.2], [0.35, 0.35, 0.38], [0.9, 0.45, 0.6], [0.2, 0.55, 0.75]];
  var LEGS = [[0.12, 0.16, 0.28], [0.08, 0.08, 0.09], [0.22, 0.27, 0.4], [0.35, 0.3, 0.25], [0.18, 0.18, 0.2]];
  var HAIR = [[0.07, 0.05, 0.04], [0.2, 0.12, 0.07], [0.42, 0.27, 0.14], [0.75, 0.6, 0.35], [0.5, 0.2, 0.08], [0.55, 0.52, 0.48]];
  var bodies = {};
  function body(key) { return bodies[key] || (bodies[key] = P.buildBody(key.charAt(0), key.indexOf('p') > 0, key.indexOf('x') > 0 ? 2 : key.indexOf('l') > 0 ? 1 : 0)); }
  // Deterministic per-seat randomness so the same seat always has the same neighbours.
  function rng(k, salt) { var x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); }
  function gauss(k, salt) { return Math.sqrt(-2 * Math.log(Math.max(1e-6, rng(k, salt)))) * Math.cos(6.2832 * rng(k, salt + 7)); }
  P.describe = function (k) {
    var sex = rng(k, 1) < 0.5 ? "m" : "f", h = P.STATURE[sex] + P.SD * Math.max(-2.2, Math.min(2.2, gauss(k, 2)));
    return { sex: sex, h: h, skin: SKIN[(rng(k, 3) * SKIN.length) | 0], top: TOPS[(rng(k, 4) * TOPS.length) | 0], legs: LEGS[(rng(k, 5) * LEGS.length) | 0], hair: HAIR[(rng(k, 6) * HAIR.length) | 0] };
  };
  // Real people: MakeHuman CC0 bodies (2 looks per sex, 3 levels of detail), dressed and given hair by
  // tools/humans/build_humans.py, with weights for an 11-bone skeleton. js/data/humans.js ships them gzipped; they are
  // unpacked once in the background (until then, or without DecompressionStream, the built-in bodies above are used).
  // Each person plays in-place clips from js/crowd.js; the pose (joint angles) is uploaded per person every frame.
  var REAL = null, LOOKS = null, realLoading = null, lookMats = {};
  P.source.bodies = "MakeHuman base mesh, skeleton and shape targets (CC0 1.0, makehumancommunity/makehuman), dressed and rigged by tools/humans/build_humans.py";
  P.loadReal = function () {
    if (realLoading) return realLoading;
    if (!window.HUMANS_GZ || typeof DecompressionStream === "undefined" || typeof Response === "undefined") return (realLoading = Promise.resolve(false));
    var bin = atob(window.HUMANS_GZ), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return (realLoading = new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer().then(function (buf) {
      var hl = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), base = 4 + hl, out = {};
      if (head.v !== 2) throw new Error("old humans.js");
      head.meshes.forEach(function (m) {
        var o = base + m.off, n = m.nv, q = new Uint16Array(buf, o, n * 3), by = new Uint8Array(buf, o + n * 6, n * 4), io = o + n * 10 + (n * 10) % 2;
        var pos = new Float32Array(n * 3), bone = new Float32Array(n * 4); // bone = (bone0, bone1, weight0, part): one attribute, WebGL has 16
        for (var k = 0; k < n * 3; k++) { var a = k % 3; pos[k] = m.lo[a] + q[k] / 65535 * (m.hi[a] - m.lo[a]); }
        for (k = 0; k < n; k++) { bone[k * 4] = by[n + k]; bone[k * 4 + 1] = by[2 * n + k]; bone[k * 4 + 2] = by[3 * n + k] / 255; bone[k * 4 + 3] = by[k]; }
        var g = new T.BufferGeometry(); g.addAttribute("position", new T.BufferAttribute(pos, 3)); g.addAttribute("aBone", new T.BufferAttribute(bone, 4));
        g.setIndex(new T.BufferAttribute(new Uint16Array(buf.slice(io, io + m.nt * 6)), 1)); g.computeVertexNormals();
        out[m.key] = g;
      });
      LOOKS = head.looks; REAL = out; return true;
    }).catch(function () { return false; }));
  };
  P.realReady = function () { return !!REAL; };
  // Crowd state. Poses of the near crowd come from js/crowd.js (clips per fan, computed on the CPU each frame and
  // uploaded as 4 vec4s per person); the shader below only bends the mesh. P.U are the uniforms the far-crowd sprites
  // (scene.js) read, so near and far crowd do the same thing at the same time.
  P.U = { uTime: { value: 0 }, uBeat: { value: 2 }, uEnergy: { value: 0 }, uJump: { value: 0 }, uCheer: { value: 0 }, uStill: { value: 0 },
    uWaveOn: { value: 0 }, uWaveT0: { value: -1e9 }, uWaveLen: { value: 20 }, uWaveA0: { value: 0 }, uCenter: { value: new T.Vector2() } };
  P.G = { uTime: 0, beat: 2, still: false, waveOn: false, waveT0: -1e9, waveLen: 20, waveA0: 0, cx: 0, cz: 0, jump: 0, cheer: 0, cheerT: -1e9 };
  P.still = false; P.ctx = { sport: false };
  var SVS = [
    "attribute vec4 aBone;", // bone0, bone1, weight0, part
    "attribute vec4 iPos; attribute vec4 iMisc; attribute vec3 iSkin; attribute vec3 iTop; attribute vec3 iLegs; attribute vec3 iHair;", // iMisc = (height, nod, phone, width scale)
    "attribute vec4 iQLeg; attribute vec4 iQBody; attribute vec4 iQArmL; attribute vec4 iQArmR;", // pose from js/crowd.js; arms = (raise, side, elbow, swing in)
    "uniform vec3 jHipL, jHipR, jKneeL, jKneeR, jShL, jShR, jElL, jElR, jWaist, jNeck;",
    "varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vY; varying float vPart; varying float vScreen;",
    "mat3 rx(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }",
    "mat3 rz(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }",
    "mat3 ry(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }",
    "mat3 Rul, Rur, Rfl, Rfr, Rtl, Rtr, Rsl, Rsr, Rsp, Rh;",
    "void bone(float b, inout vec3 P, inout vec3 N){", // the bone in full, then up the chain to the root
    "  if (b > 6.5) { bool l = b < 8.5; vec3 hip = l ? jHipL : jHipR, knee = l ? jKneeL : jKneeR;",
    "    if (b > 7.5 && b < 8.5 || b > 9.5) { mat3 S = l ? Rsl : Rsr; P = S * (P - knee) + knee; N = S * N; }",
    "    mat3 Tt = l ? Rtl : Rtr; P = Tt * (P - hip) + hip; N = Tt * N; return; }",
    "  if (b > 2.5) { bool l = b < 4.5; vec3 sh = l ? jShL : jShR, el = l ? jElL : jElR;",
    "    if (b > 3.5 && b < 4.5 || b > 5.5) { mat3 F = l ? Rfl : Rfr; P = F * (P - el) + el; N = F * N; }",
    "    mat3 U = l ? Rul : Rur; P = U * (P - sh) + sh; N = U * N; }",
    "  if (b > 1.5 && b < 2.5) { P = Rh * (P - jNeck) + jNeck; N = Rh * N; }",
    "  if (b > 0.5) { P = Rsp * (P - jWaist) + jWaist; N = Rsp * N; }",
    "}",
    // Bones: 0 root, 1 spine, 2 head, 3/4 upper/fore arm L, 5/6 R, 7/8 thigh/shin L, 9/10 R. par(): parent.
    "float par(float b){ return b > 9.5 ? 9.0 : b > 8.5 ? 0.0 : b > 7.5 ? 7.0 : b > 6.5 ? 0.0 : b > 5.5 ? 5.0 : b > 4.5 ? 1.0 : b > 3.5 ? 3.0 : b > 1.5 ? 1.0 : 0.0; }",
    "void part(float b, float k, inout vec3 P, inout vec3 N){", // the bone's own rotation with its angles scaled by k
    "  mat3 R; vec3 j;",
    "  if (b < 1.5) { R = ry(iQBody.y * k) * rz(iQBody.z * 0.5 * k) * rx(iQBody.w * k); j = jWaist; }",
    "  else if (b < 2.5) { R = rx((iMisc.y + 0.15 * iMisc.z) * k); j = jNeck; }",
    "  else if (b < 6.5) { bool l = b < 4.5; vec4 q = l ? iQArmL : iQArmR; float sg = l ? -1.0 : 1.0;",
    "    if (b > 3.5 && b < 4.5 || b > 5.5) { R = rx(q.z * k); j = l ? jElL : jElR; } else { R = ry(sg * q.w * k) * rx(q.x * k) * rz(-sg * q.y * k); j = l ? jShL : jShR; } }", // side first, then raise
    "  else { bool l = b < 8.5; bool shin = b > 7.5 && b < 8.5 || b > 9.5; R = rx((l ? (shin ? iQLeg.z : iQLeg.x) : (shin ? iQLeg.w : iQLeg.y)) * k); j = shin ? (l ? jKneeL : jKneeR) : (l ? jHipL : jHipR); }",
    "  P = R * (P - j) + j; N = R * N; }",
    "void main(){",
    "  Rtl = rx(iQLeg.x); Rtr = rx(iQLeg.y); Rsl = rx(iQLeg.z); Rsr = rx(iQLeg.w);",
    "  Rsp = ry(iQBody.y) * rz(iQBody.z * 0.5) * rx(iQBody.w); Rh = rx(iMisc.y + 0.15 * iMisc.z);",
    "  Rul = ry(-iQArmL.w) * rx(iQArmL.x) * rz(iQArmL.y); Rur = ry(iQArmR.w) * rx(iQArmR.x) * rz(-iQArmR.y); Rfl = rx(iQArmL.z); Rfr = rx(iQArmR.z);", // side first, then raise: side means out/in at any height
    // Joint blending by ANGLE, not by position: a vertex weighted between a bone and its parent turns by its share of
    // the joint angle (a rigid rotation, so it keeps its distance from the bone), then rides the parent. Averaging the
    // two posed positions (linear blend skinning) pulled shoulders toward the joint and flattened raised arms.
    // Every blended vertex in js/data/humans.js is between a bone and its parent (measured: 80% rigid, 20% parent-child,
    // 0% other pairs), so one partial rotation + one parent chain covers all of them, chosen without branching.
    "  float b0 = aBone.x, b1 = aBone.y, w = aBone.z; vec3 p = position, n = normal;",
    "  float up = step(abs(par(b1) - b0), 0.5) * step(0.5, b1);", // 1: b1 is b0's child, so b1 is the turning bone
    "  float cb = mix(b0, b1, up), k = mix(step(abs(par(b0) - b1), 0.5) * step(0.5, b0) > 0.5 ? w : 1.0, 1.0 - w, up);",
    "  if (cb > 0.5) { part(cb, k, p, n); bone(par(cb), p, n); }",
    "  n = normalize(n); p.y += iQBody.x; float part = aBone.w;",
    "  if (part > 4.5 && iMisc.z < 0.5) p = jWaist;", // phone only in the hands of people filming
    "  vY = p.y; vPart = part; vScreen = (part > 4.5 && normal.z > 0.5) ? 1.0 : 0.0;",
    "  p *= iMisc.x; p.x *= iMisc.w; float c = cos(iPos.w), s = sin(iPos.w);",
    "  p = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z) + iPos.xyz; vN = vec3(c*n.x + s*n.z, n.y, -s*n.x + c*n.z); vW = p;",
    "  vCol = part < 0.5 ? iSkin : part < 1.5 ? iTop : part < 2.5 ? iLegs : part < 3.5 ? iHair : part < 4.5 ? vec3(0.08) : (vScreen > 0.5 ? vec3(1.05, 1.12, 1.25) : vec3(0.12));",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }"].join("\n");
  var SFS = [P.LIGHT_FS, "varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vY; varying float vPart; varying float vScreen;",
    "void main(){ gl_FragColor = vec4(concertLight(vCol, normalize(vN), vW, vY, vScreen), 1.0); }"].join("\n");
  // CPU copy of the shader's skinning (SVS above), for tests: tools/tests/arm_volume_check.js. Unit-stature space.
  P.skinCPU = function (geo, J, q) {
    function rx(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; } // column-major like GLSL mat3
    function ry(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; }
    function rz(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; }
    function mul(A, B) { var o = []; for (var c = 0; c < 3; c++) for (var r = 0; r < 3; r++) o[c * 3 + r] = A[r] * B[c * 3] + A[3 + r] * B[c * 3 + 1] + A[6 + r] * B[c * 3 + 2]; return o; }
    function app(M, v) { return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; }
    function about(M, v, j) { var r = app(M, [v[0] - j[0], v[1] - j[1], v[2] - j[2]]); return [r[0] + j[0], r[1] + j[1], r[2] + j[2]]; }
    var PAR = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9], PIV = [null, J.waist, J.neck, J["sh.L"], J["el.L"], J["sh.R"], J["el.R"], J["hip.L"], J["knee.L"], J["hip.R"], J["knee.R"]];
    function loc(b, k) { // the bone's own rotation, its angles scaled by k (k = 1: the full pose)
      switch (b) {
        case 1: return mul(mul(ry(q.twist * k), rz(q.sway * 0.5 * k)), rx(q.lean * k));
        case 2: return rx((q.nod + 0.15 * q.phone) * k);
        case 3: return mul(mul(ry(-q.yL * k), rx(q.fL * k)), rz(q.sL * k));
        case 4: return rx(q.ffL * k);
        case 5: return mul(mul(ry(q.yR * k), rx(q.fR * k)), rz(-q.sR * k));
        case 6: return rx(q.ffR * k);
        case 7: return rx(q.thL * k); case 8: return rx(q.shL * k); case 9: return rx(q.thR * k); case 10: return rx(q.shR * k);
      } return null;
    }
    function chain(b, k, v) { while (b > 0) { v = about(loc(b, k), v, PIV[b]); b = PAR[b]; k = 1; } return v; }
    var pos = geo.attributes.position.array, B = geo.attributes.aBone.array, n = pos.length / 3, out = new Float32Array(n * 3), lift = Crowd.rootY(J, q);
    for (var i = 0; i < n; i++) {
      var v = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], b0 = Math.round(B[i * 4]), b1 = Math.round(B[i * 4 + 1]), w = B[i * 4 + 2], r;
      if (P.SKIN_MODE === "rigid") r = chain(w >= 0.5 ? b0 : b1, 1, v); // test reference: no blending at all
      else if (P.SKIN_MODE === "angle") { var up = b1 > 0 && PAR[b1] === b0, c = up ? b1 : b0; r = chain(c, up ? 1 - w : (b0 > 0 && PAR[b0] === b1 ? w : 1), v); } // = the shader: turn by the weighted share of the child's angle
      else { var a = chain(b0, 1, v), c = chain(b1, 1, v); r = [c[0] + (a[0] - c[0]) * w, c[1] + (a[1] - c[1]) * w, c[2] + (a[2] - c[2]) * w]; }
      out[i * 3] = r[0]; out[i * 3 + 1] = r[1] + lift; out[i * 3 + 2] = r[2];
    }
    return out;
  };
  P.SKIN_MODE = "angle"; // matches the shader
  function lookMat(id) { // one material per look (its joint positions); the shader program itself is compiled once
    if (lookMats[id]) { if (P.stagePos) lookMats[id].uniforms.uStage.value.copy(P.stagePos); return lookMats[id]; }
    var J = LOOKS[id], u = P.lightUniforms(), V3 = function (a) { return { value: new T.Vector3(a[0], a[1], a[2]) }; };
    var map = { jHipL: "hip.L", jHipR: "hip.R", jKneeL: "knee.L", jKneeR: "knee.R", jShL: "sh.L", jShR: "sh.R", jElL: "el.L", jElR: "el.R", jWaist: "waist", jNeck: "neck" };
    Object.keys(map).forEach(function (k) { u[k] = V3(J[map[k]]); });
    return (lookMats[id] = new T.ShaderMaterial({ vertexShader: SVS, fragmentShader: SFS, uniforms: u }));
  }
  P.looks = function () { return LOOKS; };
  var live = []; // crowds whose poses are updated every frame (near crowd, performer, players)
  function lookOf(p) { var d = p.d || (p.d = P.describe(p.k)); return d.sex + (rng(p.k, 9) < 0.5 ? "0" : "1"); }
  function makeRealCrowd(people, group) {
    people.forEach(function (p) { if (!p.d) p.d = P.describe(p.k); }); // heights first: makeFans uses them
    var byKey = {}, fans = Crowd.makeFans(people, { sport: P.ctx.sport });
    people.forEach(function (p, i) {
      var look = lookOf(p), key = look + "-" + (p.lod || 0);
      p.fan = fans[i]; fans[i].look = look; fans[i].yk = LOOKS[look] ? Crowd.armK(LOOKS[look]) : 1; (byKey[key] = byKey[key] || []).push(p);
    });
    Object.keys(byKey).forEach(function (key) {
      var src = REAL[key], list = byKey[key], n = list.length; if (!src) return;
      var g = new T.InstancedBufferGeometry(); g.setIndex(src.index);
      ["position", "normal", "aBone"].forEach(function (a) { g.addAttribute(a, src.attributes[a]); });
      var sk = new Float32Array(n * 3), tp = new Float32Array(n * 3), lg = new Float32Array(n * 3), hr = new Float32Array(n * 3), attrs = {};
      list.forEach(function (p, i) { var d = p.d; sk.set(d.skin, i * 3); tp.set(p.top || d.top, i * 3); lg.set(p.legs || d.legs, i * 3); hr.set(d.hair, i * 3); });
      [["iSkin", sk, 3], ["iTop", tp, 3], ["iLegs", lg, 3], ["iHair", hr, 3]].forEach(function (a) { g.addAttribute(a[0], new T.InstancedBufferAttribute(a[1], a[2])); });
      ["iPos", "iMisc", "iQLeg", "iQBody", "iQArmL", "iQArmR"].forEach(function (a) { var at = attrs[a] = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4); at.setDynamic(true); g.addAttribute(a, at); });
      g.maxInstancedCount = n;
      var mesh = new T.Mesh(g, lookMat(key.split("-")[0])); mesh.frustumCulled = false; mesh.userData.people = list; mesh.userData.attrs = attrs; group.add(mesh);
    });
    group.userData.count = people.length; group.userData.real = true; live.push(group);
    writePoses(group, P.G.uTime, null, true);
    return group;
  }
  var pose = Crowd.blank(), fr = new T.Frustum(), pm = new T.Matrix4(), sph = new T.Sphere(new T.Vector3(), 1.3);
  function writePoses(group, t, frustum, all) {
    group.children.forEach(function (m) {
      var a = m.userData.attrs; if (!a || !a.iPos) return;
      m.userData.people.forEach(function (p, i) {
        if (!all && frustum && !group.userData.noCull) { sph.center.set(p.x, p.y + 0.9, p.z); if (!frustum.intersectsSphere(sph)) return; } // off screen: keep the last pose
        var q = Crowd.pose(p.fan, t, P.G, pose), J = LOOKS[p.fan.look], o = i * 4;
        a.iPos.array[o] = p.x; a.iPos.array[o + 1] = p.y; a.iPos.array[o + 2] = p.z; a.iPos.array[o + 3] = p.rot;
        a.iQLeg.array.set([q.thL, q.thR, q.shL, q.shR], o); a.iQBody.array.set([Crowd.rootY(J, q), q.twist, q.sway, q.lean], o);
        a.iQArmL.array.set([q.fL, q.sL, q.ffL, q.yL], o); a.iQArmR.array.set([q.fR, q.sR, q.ffR, q.yR], o); a.iMisc.array.set([p.h || p.d.h, q.nod, q.phone, p.fan.wscale], o);
      });
      ["iPos", "iMisc", "iQLeg", "iQBody", "iQArmL", "iQArmR"].forEach(function (k) { a[k].needsUpdate = true; });
    });
  }
  // Every frame: pose the near crowd, the performer and the players (only those on screen).
  P.update = function (camera) {
    if (camera) { camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromMatrix(pm); }
    live = live.filter(function (g) { return !!g.parent; });
    for (var i = 0; i < live.length; i++) writePoses(live[i], P.G.uTime, camera ? fr : null, false);
  };
  // Director: the shared moments. Animated concerts: energy that swells and dips, a synchronised jump every ~35 s,
  // hands up at the end of a "song". Animated sport: a Mexican wave every ~70 s, everyone up for a score (P.cheer,
  // from the match preview). Still mode: nobody moves unless you press Wave. P.wave() / P.jump() start one on demand.
  var manual = { wave: -1e9, jump: -1e9, cheer: -1e9 };
  function env(t, t0, len, edge) { var x = t - t0; return x < 0 || x > len ? 0 : Math.min(1, x / edge, (len - x) / edge); }
  P.waveLen = 20; // seconds for one lap (set per venue size by scene.js)
  P.tick = function (t, sport) {
    var U = P.U, G = P.G, still = P.still; G.uTime = t; U.uTime.value = t; P.ctx.sport = !!sport;
    G.still = still; U.uStill.value = still ? 1 : 0;
    var auto = !still && sport && t % 70 > 40 ? t - (t % 70) + 40 : -1e9, w0 = Math.max(auto, manual.wave), wl = P.waveLen;
    G.waveT0 = w0; G.waveLen = wl; G.waveA0 = 0; G.waveOn = t >= w0 && t < w0 + wl + 3; // one lap, then it stops
    U.uWaveT0.value = w0; U.uWaveLen.value = wl; U.uWaveA0.value = 0; U.uWaveOn.value = G.waveOn ? 1 : 0;
    if (still) { G.jump = G.cheer = 0; U.uJump.value = U.uCheer.value = U.uEnergy.value = 0; return; }
    if (sport) {
      U.uEnergy.value = 0; G.beat = U.uBeat.value = 1.6; G.jump = U.uJump.value = 0;
      var c = Math.max(env(t, manual.cheer, 6, 0.5), t - manual.cheer > 120 ? env(t % 50, 44, 5, 0.6) : 0);
      G.cheer = U.uCheer.value = c; G.cheerT = t - manual.cheer < 6 ? manual.cheer : t - (t % 50) + 44;
    } else {
      G.beat = U.uBeat.value = 2; U.uEnergy.value = 0.72 + 0.28 * Math.sin(t * 6.2832 / 45);
      G.jump = U.uJump.value = Math.max(env(t % 35, 26, 7, 0.8), env(t, manual.jump, 7, 0.5));
      G.cheer = U.uCheer.value = env(t % 60, 55, 4, 0.7); G.cheerT = t - (t % 60) + 55;
    }
  };
  P.wave = function () { if (P.G.uTime > P.G.waveT0 + P.G.waveLen + 3) manual.wave = P.G.uTime; };
  P.jump = function () { manual.jump = P.G.uTime; };
  P.cheer = function () { manual.cheer = P.G.uTime; };
  // people: [{x,y,z,rot,k,sit}] -> one draw call per sex
  // ONE shared material for every built-in person, created once and never disposed: disposing it made three.js
  // throw away the compiled shader, so every seat click recompiled it (measured: the slowest step of a click).
  var sharedMat = null;
  P.material = function () {
    if (!sharedMat) sharedMat = new T.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: P.lightUniforms() });
    if (P.stagePos) sharedMat.uniforms.uStage.value.copy(P.stagePos);
    return sharedMat;
  };
  P.makeCrowd = function (people) {
    var group = new T.Group(), mat = P.material();
    if (window.Models && Models.list.length) return Models.makeCrowd(people, group);
    if (REAL) return makeRealCrowd(people, group);
    var KEYS = []; ["m", "f"].forEach(function (s) { ["", "p"].forEach(function (ph) { ["", "l", "x"].forEach(function (l) { KEYS.push(s + ph + l); }); }); });
    KEYS.forEach(function (key) {
      var wantP = key.indexOf('p') > 0, lod = key.indexOf('x') > 0 ? 2 : key.indexOf('l') > 0 ? 1 : 0;
      var list = people.filter(function (p) { var d = p.d || (p.d = P.describe(p.k)); return d.sex === key.charAt(0) && !!p.phone === wantP && (p.lod || 0) === lod; }); if (!list.length) return;
      var b = body(key), g = new T.InstancedBufferGeometry(), n = list.length;
      g.addAttribute("position", new T.BufferAttribute(new Float32Array(b.P), 3)); g.addAttribute("normal", new T.BufferAttribute(new Float32Array(b.N), 3));
      g.addAttribute("aPart", new T.BufferAttribute(new Float32Array(b.A), 1));
      var off = new Float32Array(n * 3), rot = new Float32Array(n), hh = new Float32Array(n), sit = new Float32Array(n), sk = new Float32Array(n * 3), tp = new Float32Array(n * 3), lg = new Float32Array(n * 3), hr = new Float32Array(n * 3);
      list.forEach(function (p, i) { var d = p.d; off.set([p.x, p.y, p.z], i * 3); rot[i] = p.rot; hh[i] = p.h || d.h; sit[i] = p.sit ? 1 : 0; sk.set(d.skin, i * 3); tp.set(p.top || d.top, i * 3); lg.set(d.legs, i * 3); hr.set(d.hair, i * 3); });
      [["iOffset", off, 3], ["iRot", rot, 1], ["iH", hh, 1], ["iSit", sit, 1], ["iSkin", sk, 3], ["iTop", tp, 3], ["iLegs", lg, 3], ["iHair", hr, 3]].forEach(function (a) { g.addAttribute(a[0], new T.InstancedBufferAttribute(a[1], a[2])); });
      g.maxInstancedCount = n;
      var mesh = new T.Mesh(g, mat); mesh.frustumCulled = false; group.add(mesh);
    });
    group.userData.count = people.length; return group;
  };
})();
