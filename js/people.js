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
  // Real people: MakeHuman CC0 bodies (2 looks per sex, 4 poses, 3 levels of detail) posed, dressed, given hair and
  // reduced in Blender by tools/humans/build_humans.py, shipped gzipped in js/data/humans.js. Unpacked once in the
  // background; until then (or on a browser without DecompressionStream) the built-in bodies above are used.
  var REAL = null, realLoading = null;
  P.source.bodies = "MakeHuman base mesh, skeleton and shape targets (CC0 1.0, makehumancommunity/makehuman), posed and dressed by tools/humans/build_humans.py";
  P.loadReal = function () {
    if (realLoading) return realLoading;
    if (!window.HUMANS_GZ || typeof DecompressionStream === "undefined" || typeof Response === "undefined") return (realLoading = Promise.resolve(false));
    var bin = atob(window.HUMANS_GZ), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return (realLoading = new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer().then(function (buf) {
      var hl = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), base = 4 + hl, out = {};
      head.meshes.forEach(function (m) {
        var o = base + m.off, q = new Uint16Array(buf, o, m.nv * 3), pt = new Uint8Array(buf, o + m.nv * 6, m.nv), io = o + m.nv * 7 + (m.nv * 7) % 2;
        var pos = new Float32Array(m.nv * 3), part = new Float32Array(m.nv);
        for (var k = 0; k < m.nv * 3; k++) { var a = k % 3; pos[k] = m.lo[a] + q[k] / 65535 * (m.hi[a] - m.lo[a]); }
        for (k = 0; k < m.nv; k++) part[k] = pt[k];
        var g = new T.BufferGeometry(); g.addAttribute("position", new T.BufferAttribute(pos, 3)); g.addAttribute("aPart", new T.BufferAttribute(part, 1));
        g.setIndex(new T.BufferAttribute(new Uint16Array(buf.slice(io, io + m.nt * 6)), 1)); g.computeVertexNormals();
        out[m.key] = g;
      });
      REAL = out; return true;
    }).catch(function () { return false; }));
  };
  P.realReady = function () { return !!REAL; };
  function makeRealCrowd(people, group, mat) {
    var byKey = {};
    people.forEach(function (p) {
      var d = p.d || (p.d = P.describe(p.k)), key = d.sex + (rng(p.k, 9) < 0.5 ? "0" : "1") + "-" + (p.sit ? "sit" : "") + (p.phone ? "phone" : p.sit ? "" : "stand") + "-" + (p.lod || 0);
      (byKey[key] = byKey[key] || []).push(p);
    });
    Object.keys(byKey).forEach(function (key) {
      var src = REAL[key], list = byKey[key], n = list.length; if (!src) return;
      var g = new T.InstancedBufferGeometry(); g.setIndex(src.index);
      ["position", "normal", "aPart"].forEach(function (a) { g.addAttribute(a, src.attributes[a]); });
      var off = new Float32Array(n * 3), rot = new Float32Array(n), hh = new Float32Array(n), sit = new Float32Array(n), sk = new Float32Array(n * 3), tp = new Float32Array(n * 3), lg = new Float32Array(n * 3), hr = new Float32Array(n * 3);
      list.forEach(function (p, i) { var d = p.d; off.set([p.x, p.y, p.z], i * 3); rot[i] = p.rot; hh[i] = p.h || d.h; sk.set(d.skin, i * 3); tp.set(p.top || d.top, i * 3); lg.set(d.legs, i * 3); hr.set(d.hair, i * 3); });
      [["iOffset", off, 3], ["iRot", rot, 1], ["iH", hh, 1], ["iSit", sit, 1], ["iSkin", sk, 3], ["iTop", tp, 3], ["iLegs", lg, 3], ["iHair", hr, 3]].forEach(function (a) { g.addAttribute(a[0], new T.InstancedBufferAttribute(a[1], a[2])); });
      g.maxInstancedCount = n;
      var mesh = new T.Mesh(g, mat); mesh.frustumCulled = false; group.add(mesh);
    });
    group.userData.count = people.length; return group;
  }
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
    if (REAL) return makeRealCrowd(people, group, mat);
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
