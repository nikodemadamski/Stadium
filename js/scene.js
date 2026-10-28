/* 3D scene (three.js r97). Procedural geometry from the data. One renderer is shared; a StadiumScene is built per stadium. */
(function () {
  var T = THREE;
  function quadPush(arr, a, b, c, d) { arr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]); }
  function colPush(arr, col, n) { for (var i = 0; i < n; i++) arr.push(col.r, col.g, col.b); }
  function mkGeo(pos, col) {
    var g = new T.BufferGeometry();
    g.addAttribute("position", new T.Float32BufferAttribute(pos, 3));
    if (col) g.addAttribute("color", new T.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); return g;
  }
  // Frees GPU buffers and textures. Materials are deliberately NOT disposed: in three.js r97 disposing the last material
  // using a shader deletes the compiled program, and recompiling costs far more than the tiny material objects
  // (measured: ~90% of venue load time was shader compilation). Identical new materials reuse the cached programs.
  function disposeTree(o) {
    o.traverse(function (c) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(function (m) { if (m.map && !m.map.isRenderTargetTexture) m.map.dispose(); });
    });
  }

  function StadiumScene(renderer, S, model) {
    this.renderer = renderer; this.S = S; this.model = model;
    this.scene = new T.Scene(); this.scene.fog = new T.Fog(0x05060c, 260, 820);
    this.camera = new T.PerspectiveCamera(55, 1, 0.1, 2000);
    this.phoneCam = new T.PerspectiveCamera(50, 9 / 16, 0.1, 2000);
    this.scene.add(new T.HemisphereLight(0x9fb0ff, 0x1a1a24, 0.7));
    var sun = new T.DirectionalLight(0xffe2c4, 0.5); sun.position.set(-80, 160, 60); this.scene.add(sun);
    // Fixed light rig for EVERY venue and layout (unused lights just go to intensity 0). three.js bakes the number of
    // lights into each shader, so a constant count lets every venue reuse the same compiled shaders.
    this.washLight = new T.PointLight(0xffc89a, 0, 70); this.fxLight = new T.PointLight(0xffd27a, 0, 60);
    this.scene.add(this.washLight); this.scene.add(this.fxLight);
    this.stageSign = -1; // -1 = stage at end A (−z), +1 = end C (+z)
    this.buildSky(); this.buildPitch(); this.buildBowl(); this.buildSeats(); this.buildRoofs();
    this.crowd = null; this.nearGroup = new T.Group(); this.scene.add(this.nearGroup);
    this.stageGroup = new T.Group(); this.scene.add(this.stageGroup);
    this.occluders = []; this.performer = this.makePerformer(); this.scene.add(this.performer);
    this.raycaster = new T.Raycaster();
  }
  StadiumScene.prototype.dispose = function () { if (this.imagRT) this.imagRT.dispose(); disposeTree(this.scene); };
  StadiumScene.prototype.stageEndTag = function () { return this.stageSign < 0 ? "A" : "C"; };
  StadiumScene.prototype.isClosed = function (blk) { return !!this.preset && !!blk.endTag && blk.endTag === this.stageEndTag(); }; // sport: every stand open

  // Night sky: vertical gradient dome (navy overhead, violet haze at the horizon). Not fogged, not lit.
  StadiumScene.prototype.buildSky = function () {
    var m = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: "varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying float vY; void main(){ float t = clamp(vY, 0.0, 1.0); vec3 hz = vec3(0.16,0.09,0.22), mid = vec3(0.05,0.06,0.13), top = vec3(0.01,0.015,0.04);" +
        " vec3 c = mix(hz, mid, smoothstep(0.0, 0.18, t)); c = mix(c, top, smoothstep(0.18, 0.7, t)); if (vY < 0.0) c = vec3(0.02,0.02,0.035); gl_FragColor = vec4(c,1.0); }" });
    var sky = new T.Mesh(new T.SphereBufferGeometry(1500, 24, 16), m); sky.renderOrder = -1; this.scene.add(sky);
  };
  StadiumScene.prototype.buildPitch = function () {
    var S = this.S, g = new T.Group();
    var surround = new T.Mesh(new T.PlaneBufferGeometry((S.ring.halfX + 2) * 2, (S.ring.halfZ + 2) * 2), new T.MeshLambertMaterial({ color: S.kind === "stadium" ? 0x1f4a2a : 0x18191d }));
    surround.rotation.x = -Math.PI / 2; g.add(surround);
    var pitch = new T.Mesh(new T.PlaneBufferGeometry(S.field.width, S.field.length), new T.MeshLambertMaterial({ color: S.kind === "stadium" ? 0x2f7d3b : S.kind === "arena" ? 0x23262d : 0x3a2418 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.02; g.add(pitch);
    pitch.material.polygonOffset = true; pitch.material.polygonOffsetFactor = -1; pitch.material.polygonOffsetUnits = -2; // depth bias scales with slope, so it wins at every orbit distance
    var hw = S.field.width / 2, hl = S.field.length / 2, lg = new T.BufferGeometry();
    lg.addAttribute("position", new T.Float32BufferAttribute([-hw, .05, -hl, hw, .05, -hl, hw, .05, -hl, hw, .05, hl, hw, .05, hl, -hw, .05, hl, -hw, .05, hl, -hw, .05, -hl, -hw, .05, 0, hw, .05, 0], 3));
    if (S.kind === "stadium") g.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xe8f5e8 })));
    this.scene.add(g);
  };

  StadiumScene.prototype.buildBowl = function () {
    var M = this.model, ring = M.ring, pos = [], col = [], owner = [], k, i;
    var tread = new T.Color(0x6d737b), riser = new T.Color(0x4a4f56), terr = new T.Color(0x857d70), terrR = new T.Color(0x5c564c), dark = new T.Color(0x3a3d42), wall = new T.Color(0x2b2f35);
    M.strips.forEach(function (st) {
      var b = M.blocks[st.blockIdx], n = Math.max(2, Math.ceil((st.pb - st.pa) * 24));
      for (i = 0; i < n; i++) {
        var p0 = st.pa + (st.pb - st.pa) * i / n, p1 = st.pa + (st.pb - st.pa) * (i + 1) / n;
        var a0 = ring.point(p0, st.d0), a1 = ring.point(p1, st.d0), b0 = ring.point(p0, st.d1), b1 = ring.point(p1, st.d1);
        quadPush(pos, [a0.x, st.y, a0.z], [b0.x, st.y, b0.z], [b1.x, st.y, b1.z], [a1.x, st.y, a1.z]);
        colPush(col, b.standing ? terr : tread, 6); for (k = 0; k < 2; k++) owner.push(st.blockIdx * 128 + st.row);
        if (st.prevY === null) continue; // first row: the tier's front wall/fascia below already closes it. A riser from y=0 here was coplanar with that wall (z-fighting) and cut through the tier below on overhanging upper tiers
        quadPush(pos, [a0.x, st.prevY, a0.z], [a0.x, st.y, a0.z], [a1.x, st.y, a1.z], [a1.x, st.prevY, a1.z]);
        colPush(col, b.standing ? terrR : riser, 6); for (k = 0; k < 2; k++) owner.push(st.blockIdx * 128 + st.row);
      }
    });
    M.blocks.forEach(function (b) {
      var n = Math.max(2, Math.ceil((b.pb - b.pa) * 24));
      for (i = 0; i < n; i++) {
        var p0 = b.pa + (b.pb - b.pa) * i / n, p1 = b.pa + (b.pb - b.pa) * (i + 1) / n;
        var a0 = ring.point(p0, b.dBack), a1 = ring.point(p1, b.dBack);
        quadPush(pos, [a0.x, b.yBack, a0.z], [a0.x, b.yBack + 3.2, a0.z], [a1.x, b.yBack + 3.2, a1.z], [a1.x, b.yBack, a1.z]); colPush(col, wall, 6); owner.push(-1, -1);
        var f0 = ring.point(p0, b.dFront), f1 = ring.point(p1, b.dFront);
        if (b.levelIdx > 0) { quadPush(pos, [f0.x, b.yFront - 2.4, f0.z], [f0.x, b.yFront, f0.z], [f1.x, b.yFront, f1.z], [f1.x, b.yFront - 2.4, f1.z]); colPush(col, dark, 6); owner.push(-1, -1); }
        else { quadPush(pos, [f0.x, 0, f0.z], [f0.x, b.yFront + 0.1, f0.z], [f1.x, b.yFront + 0.1, f1.z], [f1.x, 0, f1.z]); colPush(col, new T.Color(0x1a1d22), 6); owner.push(-1, -1); }
      }
    });
    var bb = this.S.boxBand; // Aviva Level 4 boxes (positions placeholder, not selectable)
    if (bb) {
      var glass = new T.Color(0x3b5a78), n4 = Math.ceil((bb.p[1] - bb.p[0]) * 24);
      for (i = 0; i < n4; i++) {
        var q0 = bb.p[0] + (bb.p[1] - bb.p[0]) * i / n4, q1 = bb.p[0] + (bb.p[1] - bb.p[0]) * (i + 1) / n4, c0 = ring.point(q0, bb.d), c1 = ring.point(q1, bb.d);
        quadPush(pos, [c0.x, bb.y[0], c0.z], [c0.x, bb.y[1], c0.z], [c1.x, bb.y[1], c1.z], [c1.x, bb.y[0], c1.z]); colPush(col, glass, 6); owner.push(-1, -1);
      }
    }
    this.bowl = new T.Mesh(mkGeo(pos, col), new T.MeshLambertMaterial({ vertexColors: T.VertexColors, side: T.DoubleSide }));
    this.bowlOwner = new Int32Array(owner); this.scene.add(this.bowl);
  };

  StadiumScene.prototype.buildSeats = function () {
    var seats = this.model.seats, blocks = this.model.blocks, n = 0, i;
    for (i = 0; i < seats.length; i++) if (!seats[i].standing) n++;
    var pos = new Float32Array(n * 18), col = new Float32Array(n * 18), w = 0.22, h = 0.42, idx = [0, 1, 2, 0, 2, 3], o = 0;
    var colors = blocks.map(function (b) { return new T.Color(b.color); });
    for (i = 0; i < seats.length; i++) {
      var s = seats[i]; if (s.standing) continue;
      var tx = -s.nz, tz = s.nx, bx = s.x - s.nx * 0.28, bz = s.z - s.nz * 0.28, c = colors[s.blockIdx];
      var v = [bx - tx * w, s.y + 0.05, bz - tz * w, bx + tx * w, s.y + 0.05, bz + tz * w, bx + tx * w, s.y + h, bz + tz * w, bx - tx * w, s.y + h, bz - tz * w];
      for (var k = 0; k < 6; k++) { pos[o + k * 3] = v[idx[k] * 3]; pos[o + k * 3 + 1] = v[idx[k] * 3 + 1]; pos[o + k * 3 + 2] = v[idx[k] * 3 + 2]; col[o + k * 3] = c.r; col[o + k * 3 + 1] = c.g; col[o + k * 3 + 2] = c.b; }
      o += 18;
    }
    var g = new T.BufferGeometry(); g.addAttribute("position", new T.BufferAttribute(pos, 3)); g.addAttribute("color", new T.BufferAttribute(col, 3));
    this.seatMesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: T.VertexColors, side: T.DoubleSide })); this.scene.add(this.seatMesh);
    this.seatHighlight = new T.Mesh(new T.SphereBufferGeometry(0.45, 12, 8), new T.MeshBasicMaterial({ color: 0xffd400 }));
    this.seatHighlight.visible = false; this.scene.add(this.seatHighlight);
  };

  // Roofs: translucent canopy over every seated stand (terraces left open). Shape is a placeholder ⚠️.
  StadiumScene.prototype.buildRoofs = function () {
    var M = this.model, ring = M.ring, stands = {}, pos = [];
    M.blocks.forEach(function (b) {
      if (b.standing) return;
      var s = stands[b.stand] || (stands[b.stand] = { pa: 99, pb: -99, d: 0, y: 0 });
      s.pa = Math.min(s.pa, b.pa); s.pb = Math.max(s.pb, b.pb); s.d = Math.max(s.d, b.dBack); s.y = Math.max(s.y, b.yBack);
    });
    Object.keys(stands).forEach(function (k) {
      var s = stands[k], n = Math.max(2, Math.ceil((s.pb - s.pa) * 24)), h = s.y + 7, inner = Math.max(2, s.d - 34);
      for (var i = 0; i < n; i++) {
        var p0 = s.pa + (s.pb - s.pa) * i / n, p1 = s.pa + (s.pb - s.pa) * (i + 1) / n;
        var a0 = ring.point(p0, inner), a1 = ring.point(p1, inner), b0 = ring.point(p0, s.d + 2), b1 = ring.point(p1, s.d + 2);
        quadPush(pos, [a0.x, h - 2, a0.z], [b0.x, h, b0.z], [b1.x, h, b1.z], [a1.x, h - 2, a1.z]);
      }
    });
    this.roof = new T.Mesh(mkGeo(pos), new T.MeshLambertMaterial({ color: 0x2a3142, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
    this.scene.add(this.roof);
    if (this.S.kind !== "stadium") { // indoor venue: dark enclosure (walls + ceiling) sized to the seating bowl
      var hx = 0, hz = 0, hy = 0; M.seats.forEach(function (s) { hx = Math.max(hx, Math.abs(s.x)); hz = Math.max(hz, Math.abs(s.z)); hy = Math.max(hy, s.y); });
      var w = 2 * hx + 6, d = 2 * hz + 10, h = hy + 9, box = new T.Mesh(new T.BoxBufferGeometry(w, h, d), new T.MeshLambertMaterial({ color: 0x14151b, side: T.BackSide }));
      box.position.set(0, h / 2 - 0.05, 0); this.scene.add(box); this.roof.visible = false;
      var trussMat = new T.MeshLambertMaterial({ color: 0x24262d });
      for (var t = -2; t <= 2; t++) { var tr = new T.Mesh(new T.BoxBufferGeometry(w * 0.8, 0.6, 0.6), trussMat); tr.position.set(0, h - 2.5, t * d / 6); this.scene.add(tr); }
    }
  };

  // ---------- Crowd: GPU point sprites; occupancy decided in the shader so the slider is instant ----------
  var crowdVS = [
    "attribute float aRand; attribute float aSize; attribute vec3 aColor; attribute float aPhone;",
    "uniform float uDensity; uniform float uScale; uniform float uPhones; uniform float uSeated;",
    "uniform float uTime, uBeat, uEnergy, uJump, uCheer, uStill, uWaveOn, uWaveT0, uWaveLen, uWaveA0; uniform vec2 uCenter;", // crowd director (people.js)
    "varying vec3 vColor; varying float vPhone; varying float vUp;",
    "void main(){",
    "  vColor = aColor; vPhone = (aPhone < uPhones) ? 1.0 : 0.0;",
    "  vec3 pp = position; float beat = 6.2832 * uBeat * uTime + aRand * 0.9;",
    // one-lap Mexican wave, same timing as js/crowd.js waveUp(): stand 0-0.5 s, arms up 0.35-0.9 s, down by 2.4 s
    "  float a = mod(atan(pp.x - uCenter.x, pp.z - uCenter.y) - uWaveA0, 6.28318), lt = uTime - (uWaveT0 + a / 6.28318 * uWaveLen);",
    "  float wStand = uWaveOn * smoothstep(0.0, 0.5, lt) * (1.0 - smoothstep(1.6, 2.4, lt)), wArms = uWaveOn * smoothstep(0.35, 0.9, lt) * (1.0 - smoothstep(1.4, 2.0, lt));",
    "  float move = 1.0 - uStill, cheer = move * uCheer * step(fract(aRand * 7.13), 0.7);",
    "  vUp = max(wArms, cheer);",
    "  pp.y += uSeated * 0.45 * max(wStand, cheer) + (1.0 - uSeated) * move * (0.05 * uEnergy * (0.5 + 0.5 * sin(beat)) * step(0.3, fract(aRand * 5.1)) + 0.13 * uJump * max(0.0, sin(beat)));",
    "  vec4 mv = modelViewMatrix * vec4(pp,1.0);",
    "  gl_Position = projectionMatrix * mv;",
    "  float on = (aRand < uDensity && aSize > 0.0) ? 1.0 : 0.0;",
    "  gl_PointSize = on * min(aSize * uScale / -mv.z, 900.0);",
    "  if (on < 0.5) gl_Position = vec4(2.0,2.0,2.0,1.0);",
    "}"].join("\n");
  var crowdFS = [
    "varying vec3 vColor; varying float vPhone; varying float vUp;",
    "void main(){",
    "  vec2 c = gl_PointCoord;",
    "  bool inUp = vUp > 0.5 && c.y > 0.1 && c.y < 0.56 && abs(abs(c.x - 0.5) - 0.2) < 0.035;", // arms up
    "  float head = length((c - vec2(0.5,0.40)) * vec2(1.0,0.9));",
    "  bool inHead = head < 0.12;",
    "  bool inBody = c.y > 0.52 && abs(c.x-0.5) < 0.26 + (c.y-0.52)*0.25;",
    "  bool inPhone = vPhone > 0.5 && c.x > 0.62 && c.x < 0.74 && c.y > 0.06 && c.y < 0.24;",
    "  bool inArm = vPhone > 0.5 && c.x > 0.64 && c.x < 0.71 && c.y >= 0.24 && c.y < 0.56;",
    "  if (inPhone) { gl_FragColor = vec4(0.62,0.70,0.85,1.0); return; }",
    "  float lit = 0.42 + 0.25 * (1.0 - c.y);",
    "  if (inHead) { gl_FragColor = vec4(vec3(0.62,0.48,0.40) * lit,1.0); return; }",
    "  if (inBody || inArm || inUp) { gl_FragColor = vec4(vColor * lit,1.0); return; }",
    "  discard;",
    "}"].join("\n");

  // Pitch standing crowd size: Aviva = 65,000 concert capacity − open seats (sourced); Thomond = ~25,000 (third-party);
  // others: no published concert capacity, so the pitch area in front of the stage is filled at 2 people/m² ⚠️ illustrative.
  StadiumScene.prototype.pitchCrowdCount = function (openPlaces, stage) {
    var S = this.S, F = this.frontF();
    if (!stage || S.noFloorCrowd) return { n: 0, basis: stage ? "fully seated venue" : "sport layout: nobody on the pitch", flagged: false };
    if (S.floorDensity) { var a = (S.field.width) * (S.field.length / 2 + F); return { n: Math.round(a * S.floorDensity), basis: "standing floor in front of the stage × " + S.floorDensity + " people/m² (floor size estimated)", flagged: true }; }
    if (S.concertCapacity) return { n: Math.max(0, S.concertCapacity.value - openPlaces), basis: "concert capacity " + S.concertCapacity.value.toLocaleString() + " − open seats/terraces", flagged: S.concertCapacity.src !== "wiki_aviva" };
    var area = (S.field.width + 4) * (S.field.length / 2 + 2 + F);
    return { n: Math.round(area * 2), basis: "pitch area in front of the stage × 2 people/m² (no published concert capacity)", flagged: true };
  };
  StadiumScene.prototype.buildCrowd = function (opts) {
    if (this.crowd) { this.scene.remove(this.crowd); this.crowd.geometry.dispose(); }
    var self = this, seats = this.model.seats, blocks = this.model.blocks, i, k, c;
    var standH = opts.standing ? 1.62 : 1.18, people = [];
    for (i = 0; i < seats.length; i++) if (!this.isClosed(blocks[seats[i].blockIdx])) people.push(i);
    var pc = this.pitchCrowdCount(people.length, opts.stage); this.pitchInfo = pc;
    var pitchCount = pc.n, total = people.length + pitchCount;
    var pos = new Float32Array(total * 3), rnd = new Float32Array(total), size = new Float32Array(total), col = new Float32Array(total * 3), ph = new Float32Array(total);
    var palette = [[.12, .14, .18], [.75, .75, .78], [.15, .25, .45], [.55, .12, .12], [.1, .35, .2], [.85, .7, .3], [.35, .3, .45], [.9, .9, .92]];
    var seed = 12345; function rand() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    this.crowdSeatIndex = new Int32Array(seats.length).fill(-1);
    for (k = 0; k < people.length; k++) {
      var s = seats[people[k]], h = s.standing ? 1.62 : standH;
      pos[k * 3] = s.x - s.nx * 0.05; pos[k * 3 + 1] = s.y + h - 0.15; pos[k * 3 + 2] = s.z - s.nz * 0.05;
      rnd[k] = rand(); size[k] = 0.95; ph[k] = rand();
      c = palette[(rand() * palette.length) | 0]; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      this.crowdSeatIndex[people[k]] = k;
    }
    var F = this.frontF(), sgn = this.stageSign, zFront = sgn * (F - 1.5), zBack = -sgn * (this.S.field.length / 2 + (this.S.kind === "stadium" ? 2 : -0.5)), hw = this.S.field.width / 2 + (this.S.kind === "stadium" ? 2 : -0.5);
    for (var q = 0; q < pitchCount; q++) {
      var j = people.length + q;
      pos[j * 3] = (rand() * 2 - 1) * hw; pos[j * 3 + 1] = 1.47; pos[j * 3 + 2] = zFront + Math.pow(rand(), 0.8) * (zBack - zFront);
      rnd[j] = rand(); size[j] = 0.95; ph[j] = rand();
      c = palette[(rand() * palette.length) | 0]; col[j * 3] = c[0]; col[j * 3 + 1] = c[1]; col[j * 3 + 2] = c[2];
    }
    var g = new T.BufferGeometry();
    g.addAttribute("position", new T.BufferAttribute(pos, 3)); g.addAttribute("aRand", new T.BufferAttribute(rnd, 1));
    this.crowdSize = new T.BufferAttribute(size, 1); this.crowdSize.setDynamic(true); g.addAttribute("aSize", this.crowdSize);
    g.addAttribute("aColor", new T.BufferAttribute(col, 3)); g.addAttribute("aPhone", new T.BufferAttribute(ph, 1));
    var cu = { uDensity: { value: opts.density }, uScale: { value: 500 }, uPhones: { value: opts.phones || 0 }, uSeated: { value: standH < 1.5 ? 1 : 0 } };
    Object.keys(People.U).forEach(function (k) { cu[k] = People.U[k]; }); // shared: the director moves near and far crowd together
    this.crowdMat = new T.ShaderMaterial({ vertexShader: crowdVS, fragmentShader: crowdFS, uniforms: cu });
    this.crowd = new T.Points(g, this.crowdMat); this.crowd.frustumCulled = false; this.scene.add(this.crowd);
    this.crowdRand = rnd; this.crowdCol = col; this.crowdPhone = ph; this.crowdStandH = standH; this.crowdTotal = total; this.openPlaces = people.length;
  };
  StadiumScene.prototype.setMatch = function (ev) { // match preview on the pitch for sport events (js/match.js)
    if (this.match) { this.match.dispose(); this.match = null; }
    if (ev && window.Match) this.match = new Match(this, ev);
  };
  StadiumScene.prototype.setDensity = function (d) { if (this.crowdMat) this.crowdMat.uniforms.uDensity.value = d; this.density = d; };
  StadiumScene.prototype.setPhones = function (f) { if (this.crowdMat) this.crowdMat.uniforms.uPhones.value = f; };
  StadiumScene.prototype.visiblePeople = function () { if (!this.crowdRand) return 0; var d = this.density, n = 0; for (var i = 0; i < this.crowdRand.length; i++) if (this.crowdRand[i] < d) n++; return n; };

  // People within ~10.5 m are real meshes (merged: 2 draw calls).
  StadiumScene.prototype.updateNearPeople = function (seatIdx, density, phonesFrac) {
    var self = this; if (this.stageLook) People.stagePos = this.stageLook.clone().add(new T.Vector3(0, 6, 0));
    var g = this.nearGroup; while (g.children.length) { var ch = g.children.pop(); ch.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); } // materials are shared and kept (see disposeTree)
    if (!this.crowd) return;
    var size = this.crowdSize.array, i; for (i = 0; i < size.length; i++) size[i] = 0.95;
    var seats = this.model.seats, me = seats[seatIdx]; if (!me) { this.crowdSize.needsUpdate = true; return; }
    var meK = this.crowdSeatIndex[seatIdx]; if (meK >= 0) size[meK] = 0;
    var M = this.model;
    if (!this._blockC) this._blockC = M.blocks.map(function (bk) {
      var sx = 0, sy = 0, sz = 0, r2 = 0, n = bk.seatCount, a;
      for (a = bk.seatStart; a < bk.seatStart + n; a++) { sx += M.seats[a].x; sy += M.seats[a].y; sz += M.seats[a].z; } sx /= n; sy /= n; sz /= n;
      for (a = bk.seatStart; a < bk.seatStart + n; a++) { var e = M.seats[a], dd = (e.x - sx) * (e.x - sx) + (e.y - sy) * (e.y - sy) + (e.z - sz) * (e.z - sz); if (dd > r2) r2 = dd; }
      return { x: sx, y: sy, z: sz, r: Math.sqrt(r2), start: bk.seatStart, end: bk.seatStart + n };
    });
    var RAD = 18, RAD2 = RAD * RAD, MAXN = 500, people = [], standing = this.crowdStandH > 1.5;
    var ranges = this._blockC.filter(function (c) { return Math.hypot(c.x - me.x, c.y - me.y, c.z - me.z) < c.r + RAD + 1; });
    var look = this.stageFront || new T.Vector3();
    for (var ri = 0; ri < ranges.length; ri++) for (i = ranges[ri].start; i < ranges[ri].end; i++) {
      var s = seats[i]; if (i === seatIdx) continue;
      var dx = s.x - me.x, dz = s.z - me.z, dy = s.y - me.y, dd = dx * dx + dz * dz + dy * dy; if (dd > RAD2) continue;
      var k = this.crowdSeatIndex[i]; if (k < 0) continue;
      size[k] = 0; if (this.crowdRand[k] >= density) continue;
      var c3 = [this.crowdCol[k * 3], this.crowdCol[k * 3 + 1], this.crowdCol[k * 3 + 2]], sit = !(s.standing || standing);
      // Face along the seat (rows are built for it), turned towards the stage by at most ~14 degrees: facing the stage
      // fully from a side stand would turn whole rows 45 degrees and put hands into the neighbour's seat.
      var fx = -s.nx, fz = -s.nz; if (fx * -s.x + fz * -s.z < 0) { fx = -fx; fz = -fz; } // seat normal pointing into the bowl
      var seatRot = Math.atan2(fx, fz), dr = Math.atan2(look.x - s.x, look.z - s.z) - seatRot; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      people.push({ x: s.x - s.nx * 0.05, y: s.y, z: s.z - s.nz * 0.05, rot: seatRot + Math.max(-0.25, Math.min(0.25, dr)), k: k, sit: sit, top: c3, dd: dd });
    }
    people.sort(function (a, b) { return a.dd - b.dd; });
    // Where the generated layout squeezes seats closer than 0.42 m (block ends on a curve; real seats are >= 0.45 m)
    // two people can't fit shoulder to shoulder, so the tighter seat stays empty instead of clipping.
    var placed = []; people = people.filter(function (c) {
      for (var n = 0; n < placed.length; n++) { var o = placed[n]; if (Math.abs(o.y - c.y) < 0.2 && (o.x - c.x) * (o.x - c.x) + (o.z - c.z) * (o.z - c.z) < 0.42 * 0.42) return false; }
      if (placed.length < MAXN) placed.push(c); return true;
    });
    var keep = people.slice(0, MAXN);
    people.slice(MAXN).forEach(function (c) { size[c.k] = 0.95; }); // beyond the cap: stay as GPU sprites
    // Phones are part of the person (raised arm + hand + phone). Nobody right next to you gets a phone - it would fill the camera.
    keep.forEach(function (p, i) { p.phone = this.crowdPhone[p.k] < phonesFrac && p.dd > 1.5; p.lod = i < 60 ? 0 : i < 200 ? 1 : 2; }, this); // nearest 60 detailed, next 140 light, next 300 far (simplest); beyond: GPU sprites
    if (keep.length) g.add(People.makeCrowd(keep));
    this.modelCount = keep.length;
    this.crowdSize.needsUpdate = true;
    this.nearCount = this.modelCount;
  };

  // ---------- Stage ----------
  StadiumScene.prototype.frontF = function () { return this.S.stage.frontF != null ? this.S.stage.frontF : this.S.field.length / 2 - 13; };
  StadiumScene.prototype.stageZ = function (dz) { return this.stageSign * (this.frontF() - dz); };
  StadiumScene.prototype.setStage = function (preset) {
    var g = this.stageGroup, self = this; disposeTree(g); while (g.children.length) g.remove(g.children[0]);
    this.occluders = []; this.preset = preset; this.beams = []; this.screens = []; this.washLight.intensity = 0; this.fxLight.intensity = 0;
    if (!preset) { // sport layout: no stage; distances and view direction use the centre of the pitch
      this.performer.visible = false; this.pathCurve = null;
      this.stageFront = new T.Vector3(0, 1.0, 0); this.stageLook = new T.Vector3(0, 0.5, 0); return;
    }
    var d = { width: Math.min(preset.deck.width, this.S.field.width - (this.S.kind === "stadium" ? 12 : 2)), depth: preset.deck.depth, height: preset.deck.height }, sg = this.stageSign, zMid = this.stageZ(-d.depth / 2), zBack = this.stageZ(-d.depth), zFront = this.stageZ(0);
    var theatre = this.S.kind === "theatre";
    var deck = new T.Mesh(new T.BoxBufferGeometry(d.width, d.height, d.depth), new T.MeshLambertMaterial({ color: theatre ? 0x6b4428 : 0x15171c })); deck.position.set(0, d.height / 2, zMid); g.add(deck);
    var trussMat = new T.MeshLambertMaterial({ color: 0x2a2d33 }), H = preset.roofHeight;
    [[-d.width / 2, this.stageZ(-1)], [d.width / 2, this.stageZ(-1)], [-d.width / 2, this.stageZ(-d.depth + 1)], [d.width / 2, this.stageZ(-d.depth + 1)]].forEach(function (p) {
      var t = new T.Mesh(new T.BoxBufferGeometry(1.2, H, 1.2), trussMat); t.position.set(p[0], H / 2, p[1]); g.add(t);
    });
    var top = new T.Mesh(new T.BoxBufferGeometry(d.width + 2, 1.5, d.depth), trussMat); top.position.set(0, H, zMid); g.add(top);
    var back = new T.Mesh(new T.BoxBufferGeometry(d.width, H, 0.6), theatre ? new T.MeshBasicMaterial({ color: 0x5a0d18 }) : new T.MeshLambertMaterial({ color: 0x101216 })); back.position.set(0, H / 2, zBack); g.add(back);
    if (theatre) { // proscenium arch, side curtains, footlights
      var archMat = new T.MeshLambertMaterial({ color: 0x2b1a12 }), curtain = new T.MeshBasicMaterial({ color: 0x7a1222 });
      [-1, 1].forEach(function (sx) {
        var col = new T.Mesh(new T.BoxBufferGeometry(1.6, H + 1.5, 1.2), archMat); col.position.set(sx * (d.width / 2 + 0.8), (H + 1.5) / 2, zFront); g.add(col);
        var cur = new T.Mesh(new T.BoxBufferGeometry(2.2, H - 0.5, 0.3), curtain); cur.position.set(sx * (d.width / 2 - 1.1), d.height + (H - 0.5) / 2, self.stageZ(-0.8)); g.add(cur);
      });
      var lintel = new T.Mesh(new T.BoxBufferGeometry(d.width + 3.2, 2.2, 1.2), archMat); lintel.position.set(0, H + 0.4, zFront); g.add(lintel);
      var valance = new T.Mesh(new T.BoxBufferGeometry(d.width, 1.4, 0.3), curtain); valance.position.set(0, H - 1.2, self.stageZ(-0.8)); g.add(valance);
      var foot = new T.Mesh(new T.BoxBufferGeometry(d.width - 1, 0.08, 0.08), new T.MeshBasicMaterial({ color: 0xffe2a8 })); foot.position.set(0, d.height + 0.05, self.stageZ(-0.3)); g.add(foot);
      this.fxLight.color.setHex(0xfff0d0); this.fxLight.intensity = 1.6; this.fxLight.distance = 30; this.fxLight.position.set(0, H - 1, self.stageZ(-3));
    }
    var maxHalf = this.S.field.width / 2 - 1; // keep side screens inside the field (narrow rugby pitches)
    preset.screens.forEach(function (sc) {
      var x = sc.x === 0 ? 0 : Math.sign(sc.x) * Math.min(Math.abs(sc.x), maxHalf - sc.w / 2);
      // IMAG: like real stadium shows, the screens show a live close-up of the performer (rendered from a camera on stage).
      var m = new T.Mesh(new T.PlaneBufferGeometry(sc.w, sc.h), self.imagMaterial());
      m.position.set(x, sc.y, self.stageZ(sc.dz)); if (sg > 0) m.rotation.y = Math.PI; g.add(m);
      var frame = new T.Mesh(new T.BoxBufferGeometry(sc.w + 0.6, sc.h + 0.6, 0.3), new T.MeshLambertMaterial({ color: 0x0b0c10 }));
      frame.position.set(x, sc.y, self.stageZ(sc.dz) + sg * 0.2); g.add(frame);
    });
    // Lighting rig: coloured beams from the roof truss that sweep slowly, a lit deck edge and a warm wash on the stage.
    this.beams = []; this.screens = g.children.filter(function (c) { return c.material && c.material.map && self.imagRT && c.material.map === self.imagRT.texture; });
    var beamCols = [0xb07cff, 0xff4fa3, 0x6fd3ff, 0xffffff, 0xff4fa3, 0xb07cff];
    for (var bi = 0; bi < (theatre ? 0 : 6); bi++) {
      var len = H + 8, cone = new T.ConeBufferGeometry(3.2, len, 18, 1, true); cone.translate(0, -len / 2, 0);
      var beam = new T.Mesh(cone, new T.MeshBasicMaterial({ color: beamCols[bi], transparent: true, opacity: 0.09, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      beam.position.set(-d.width / 2 + 4 + bi * (d.width - 8) / 5, H - 0.5, zMid); beam.userData.phase = bi * 1.1; g.add(beam); this.beams.push(beam);
    }
    var edge = new T.Mesh(new T.BoxBufferGeometry(d.width, 0.12, 0.12), new T.MeshBasicMaterial({ color: 0xffd9a0 }));
    edge.position.set(0, d.height + 0.02, zFront); g.add(edge);
    this.washLight.intensity = 1.4; this.washLight.position.set(0, H - 2, this.stageZ(-4));
    if (!this.imagCam) { this.imagCam = new T.PerspectiveCamera(11, 16 / 9, 0.5, 200); /* waist-up close-up, like stadium IMAG */ }
    if (preset.statue) { var st = this.makeStatue(preset.statue, d.height); g.add(st); this.occluders.push(st);
      this.fxLight.color.setHex(0xffd27a); this.fxLight.intensity = 0.9; this.fxLight.distance = 60; this.fxLight.position.set(st.position.x, d.height + preset.statue.plinth + preset.statue.height * 0.6, st.position.z + 12 * (this.stageSign < 0 ? 1 : -1)); }
    var pts = preset.path.map(function (p) { return new T.Vector3(p[0], d.height, self.stageZ(p[1])); });
    this.pathCurve = new T.CatmullRomCurve3(pts, true, "catmullrom", 0.3);
    this.pathSeconds = preset.pathSeconds; this.performer.visible = true;
    var line = new T.Line(new T.BufferGeometry().setFromPoints(this.pathCurve.getPoints(120)), new T.LineBasicMaterial({ color: 0xff3b8d }));
    line.position.y = 0.03; line.visible = !!this.showPath; this.pathLine = line; g.add(line);
    this.stageFront = new T.Vector3(0, d.height + 1.7, this.stageZ(-1));
    this.stageLook = new T.Vector3(0, d.height + 4, this.stageZ(-5));
  };
  StadiumScene.prototype.imagMaterial = function () {
    if (!this.imagRT) { this.imagRT = new T.WebGLRenderTarget(512, 288, { minFilter: T.LinearFilter, magFilter: T.LinearFilter }); this.imagRT.texture.isRenderTargetTexture = true; }
    return new T.MeshBasicMaterial({ map: this.imagRT.texture, fog: false });
  };
  // Called once per frame: sweep the beams; every 2nd frame re-render the IMAG close-up of the performer.
  StadiumScene.prototype.updateFx = function (t, renderer, viewCam) {
    if (this.beams) this.beams.forEach(function (b) { var p = b.userData.phase; b.rotation.z = Math.sin(t * 0.35 + p) * 0.45; b.rotation.x = 0.25 + Math.sin(t * 0.27 + p * 1.7) * 0.25; });
    this._fx = (this._fx || 0) + 1;
    if (!this.imagRT || !this.performer.visible || this._fx % 3) return;
    if (viewCam && this.screens && this.screens.length) { // skip the extra render when no screen is in the shot
      viewCam.updateMatrixWorld(); var fr = this._frustum || (this._frustum = new T.Frustum()), pm = new T.Matrix4().multiplyMatrices(viewCam.projectionMatrix, viewCam.matrixWorldInverse);
      fr.setFromMatrix(pm); if (!this.screens.some(function (s) { return fr.intersectsObject(s); })) { this.imagSkipped = (this.imagSkipped || 0) + 1; return; }
    }
    this.imagRenders = (this.imagRenders || 0) + 1;
    var p = this.performer.position, sg = this.stageSign, cam = this.imagCam;
    cam.position.set(p.x + Math.sin(t * 0.2) * 1.2, p.y + 1.5, p.z - sg * 8); /* audience side, facing the performer */ cam.lookAt(p.x, p.y + 1.3, p.z);
    // hide beams and the screens themselves: a texture can't be drawn into while it is also being read (GL_INVALID_OPERATION)
    var hide = (this.beams || []).concat(this.screens || []), vis = hide.map(function (o) { var v = o.visible; o.visible = false; return v; });
    renderer.render(this.scene, cam, this.imagRT, true);
    hide.forEach(function (o, i) { o.visible = vis[i]; });
  };
  StadiumScene.prototype.makeStatue = function (s, deckH) {
    var gold = new T.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.85, roughness: 0.32, emissive: 0x3a2a00 });
    var g = new T.Group(), H = s.height, b = deckH, face = this.stageSign < 0 ? 1 : -1;
    function add(geo, x, y, z, rz) { var m = new T.Mesh(geo, gold); m.position.set(x, y, z); if (rz) m.rotation.z = rz; g.add(m); return m; }
    add(new T.BoxBufferGeometry(8, s.plinth, 8), 0, b + s.plinth / 2, 0);
    var y0 = b + s.plinth, leg = H * 0.42, torso = H * 0.32;
    add(new T.CylinderBufferGeometry(0.9, 1.1, leg, 12), -1.2, y0 + leg / 2, 0);
    add(new T.CylinderBufferGeometry(0.9, 1.1, leg, 12), 1.2, y0 + leg / 2, 0);
    add(new T.CylinderBufferGeometry(2.4, 1.8, torso, 14), 0, y0 + leg + torso / 2, 0);
    add(new T.SphereBufferGeometry(1.25, 16, 12), 0, y0 + leg + torso + 1.4, 0);
    add(new T.CylinderBufferGeometry(0.6, 0.55, H * 0.36, 10), -3.0, y0 + leg + torso * 0.55, 0, 0.5);
    add(new T.CylinderBufferGeometry(0.6, 0.55, H * 0.36, 10), 3.0, y0 + leg + torso * 0.75, 0, -2.4);
    g.position.set(s.x, 0, this.stageZ(s.dz));
    return g;
  };
  StadiumScene.prototype.makePerformer = function () {
    var g = new T.Group();
    var body = new T.Mesh(new T.CylinderBufferGeometry(0.22, 0.2, 1.45, 10), new T.MeshBasicMaterial({ color: 0xff2e88 })); body.position.y = 0.72; g.add(body);
    var head = new T.Mesh(new T.SphereBufferGeometry(0.14, 12, 10), new T.MeshBasicMaterial({ color: 0xffe0c8 })); head.position.y = 1.65; g.add(head);
    var spot = new T.Mesh(new T.CircleBufferGeometry(1.2, 24), new T.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.35 }));
    spot.rotation.x = -Math.PI / 2; spot.position.y = 0.02; g.add(spot);
    g.visible = false; return g;
  };
  StadiumScene.prototype.performerAt = function (t) {
    if (!this.pathCurve) return null; var u = ((t / this.pathSeconds) % 1 + 1) % 1;
    var p = this.pathCurve.getPointAt(u), q = this.pathCurve.getPointAt((u + 0.002) % 1);
    return { pos: p, dir: q.clone().sub(p) };
  };
  StadiumScene.prototype.placePerformer = function (t) {
    var s = this.performerAt(t); if (!s) return; this.performer.position.copy(s.pos); this.performer.rotation.y = Math.atan2(s.dir.x, s.dir.z);
    if (window.People && !this.performerModel) { // realistic-proportion performer (1.79 m)
      var pm = People.makeCrowd([{ x: 0, y: 0, z: 0, rot: 0, k: 7, h: 1.79, top: [0.85, 0.7, 0.2], clip: "perform" }]); pm.userData.noCull = true; this.performer.add(pm); this.performerModel = pm;
      this.performer.children.forEach(function (c) { if (c !== pm && c.geometry && c.geometry.type !== "CircleBufferGeometry") c.visible = false; });
    }
  };
  StadiumScene.prototype._occMeshes = function () { var objs = []; this.occluders.forEach(function (o) { o.traverse(function (c) { if (c.isMesh) objs.push(c); }); }); return objs; };
  StadiumScene.prototype.visibilityFrom = function (eye, samples) {
    if (!this.pathCurve) return null; samples = samples || 120;
    this.scene.updateMatrixWorld(true);
    var objs = this._occMeshes(); if (!objs.length) return { visible: 1, hidden: [] };
    var vis = 0, rc = this.raycaster, hidden = [];
    for (var i = 0; i < samples; i++) {
      var p = this.pathCurve.getPointAt(i / samples).clone(); p.y += 1.55;
      var dir = p.clone().sub(eye), dist = dir.length(); dir.normalize(); rc.set(eye, dir); rc.far = dist - 0.3;
      if (rc.intersectObjects(objs, false).length === 0) vis++; else hidden.push(i / samples);
    }
    rc.far = Infinity; return { visible: vis / samples, hidden: hidden };
  };
  StadiumScene.prototype.performerHiddenFrom = function (eye) {
    if (!this.performer.visible || !this.occluders.length) return false;
    var objs = this._occMeshes(), p = this.performer.position.clone(); p.y += 1.55;
    var dir = p.clone().sub(eye), dist = dir.length(); dir.normalize(); this.raycaster.set(eye, dir); this.raycaster.far = dist - 0.3;
    var hit = this.raycaster.intersectObjects(objs, false).length > 0; this.raycaster.far = Infinity; return hit;
  };
  StadiumScene.prototype.pickSeat = function (ndcX, ndcY, camera) {
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    var hits = this.raycaster.intersectObject(this.bowl, false);
    for (var h = 0; h < hits.length; h++) {
      var own = this.bowlOwner[hits[h].faceIndex]; if (own < 0) continue;
      var blk = this.model.blocks[Math.floor(own / 128)], ri = blk.rowInfo[own % 128], best = -1, bd = 1e9, pt = hits[h].point;
      for (var s = ri.start; s < ri.start + ri.count; s++) { var se = this.model.seats[s], dd = (se.x - pt.x) * (se.x - pt.x) + (se.z - pt.z) * (se.z - pt.z); if (dd < bd) { bd = dd; best = s; } }
      return best;
    }
    return -1;
  };
  window.StadiumScene = StadiumScene;
})();
