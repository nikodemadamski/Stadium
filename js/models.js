/* Use real 3D people: import free .glb / .gltf (embedded) human models, e.g. Quaternius CC0 packs.
 * - Parses glTF 2.0 itself (three r97 has no GLTFLoader in core).
 * - Rigged models are posed in their first "idle/stand" animation frame (CPU skinning), so they don't stand in a T-pose.
 * - Each model is normalised to 1 unit tall, then instanced at real heights (NCD-RisC averages) facing the stage.
 * - Files are kept in this browser (IndexedDB) so they load next time. Nothing is uploaded anywhere. */
(function () {
  var T = THREE, M = window.Models = { list: [], status: "none", flip: false };
  var MAX_BYTES = 60 * 1024 * 1024, MAX_VERTS = 400000;
  var CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  var NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
  var GET = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" };

  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function parse(buf) {
    if (buf.byteLength > MAX_BYTES) throw new Error("file is larger than 60 MB");
    var dv = new DataView(buf), json, bins = [];
    if (buf.byteLength >= 12 && dv.getUint32(0, true) === 0x46546C67) { // binary .glb
      var len = Math.min(dv.getUint32(8, true), buf.byteLength), o = 12;
      while (o + 8 <= len) {
        var cl = dv.getUint32(o, true), ct = dv.getUint32(o + 4, true); if (o + 8 + cl > len) throw new Error("corrupt .glb");
        if (ct === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, o + 8, cl))); else if (ct === 0x004E4942) bins.push(buf.slice(o + 8, o + 8 + cl));
        o += 8 + cl;
      }
      (json.buffers || []).forEach(function (b, i) { if (!b.uri) bins[i] = bins[i] || bins[0]; else bins[i] = dataUri(b.uri); });
    } else { // .gltf JSON with embedded data: URIs
      try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf))); } catch (e) { throw new Error("not a glTF file - use .glb (or .gltf with everything embedded)"); }
      bins = (json.buffers || []).map(function (b) { return dataUri(b.uri); });
    }
    if (!json || !json.meshes) throw new Error("no meshes in file");
    return { j: json, b: bins };
  }
  function dataUri(u) {
    var m = /^data:[^;,]*;base64,(.*)$/.exec(u || "");
    if (!m) throw new Error("this .gltf refers to a separate file (" + String(u).slice(0, 40) + "). Use the .glb version instead.");
    return b64(m[1]);
  }
  function acc(g, i) {
    var a = g.j.accessors[i], bv = a && g.j.bufferViews[a.bufferView], n = a && NC[a.type], C = a && CT[a.componentType];
    if (!a || !bv || !n || !C || a.count > MAX_VERTS * 4) throw new Error("unsupported data in model");
    var bin = g.b[bv.buffer || 0], dv = new DataView(bin), stride = bv.byteStride || n * C.BYTES_PER_ELEMENT, off = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * n);
    if (a.count && off + (a.count - 1) * stride + n * C.BYTES_PER_ELEMENT > bin.byteLength) throw new Error("model data out of range");
    for (var k = 0; k < a.count; k++) for (var c = 0; c < n; c++) {
      var v = dv[GET[a.componentType]](off + k * stride + c * C.BYTES_PER_ELEMENT, true);
      out[k * n + c] = a.normalized && NORM[a.componentType] ? Math.max(v / NORM[a.componentType], -1) : v;
    }
    out.n = n; out.count = a.count; return out;
  }
  function local(n) {
    if (n.matrix) return new T.Matrix4().fromArray(n.matrix);
    var t = n._t || n.translation || [0, 0, 0], r = n._r || n.rotation || [0, 0, 0, 1], s = n._s || n.scale || [1, 1, 1];
    return new T.Matrix4().compose(new T.Vector3(t[0], t[1], t[2]), new T.Quaternion(r[0], r[1], r[2], r[3]), new T.Vector3(s[0], s[1], s[2]));
  }
  function pose(g) { // first keyframe of an idle/stand clip (else the first clip) - avoids T-poses
    var an = g.j.animations || [], clip = null;
    an.forEach(function (a) { if (!clip && /idle|stand|breath/i.test(a.name || "")) clip = a; });
    if (!clip && an.length) clip = an[0];
    if (!clip) return null;
    clip.channels.forEach(function (ch) {
      var sm = clip.samplers[ch.sampler], node = g.j.nodes[ch.target.node]; if (!node) return;
      var o = acc(g, sm.output), n = o.n, st = sm.interpolation === "CUBICSPLINE" ? n : 0, v = Array.prototype.slice.call(o, st, st + n);
      if (ch.target.path === "translation") node._t = v; else if (ch.target.path === "rotation") node._r = v; else if (ch.target.path === "scale") node._s = v;
    });
    return clip.name || "clip 1";
  }
  function worlds(g) {
    var ns = g.j.nodes || [], W = [], par = ns.map(function () { return -1; });
    ns.forEach(function (n, i) { (n.children || []).forEach(function (c) { par[c] = i; }); });
    // Iterative (no recursion: a 60,000-deep or looping hierarchy can't overflow the stack); loops are rejected.
    ns.forEach(function (_, i) {
      var chain = [], j = i, seen = Object.create(null);
      while (j >= 0 && !W[j]) { if (seen[j]) throw new Error("corrupt node hierarchy (loop)"); seen[j] = 1; chain.push(j); j = par[j]; }
      for (var k = chain.length - 1; k >= 0; k--) { var n = chain[k], L = local(ns[n]); W[n] = par[n] >= 0 ? new T.Matrix4().multiplyMatrices(W[par[n]], L) : L; }
    });
    return W;
  }
  function loadImage(g, idx) {
    var tex = g.j.textures && g.j.textures[idx], im = tex && g.j.images && g.j.images[tex.source]; if (!im) return Promise.resolve(null);
    var blob;
    if (im.bufferView != null) { var bv = g.j.bufferViews[im.bufferView]; blob = new Blob([new Uint8Array(g.b[bv.buffer || 0], bv.byteOffset || 0, bv.byteLength)], { type: im.mimeType || "image/png" }); }
    else if (/^data:image\//.test(im.uri || "")) blob = new Blob([dataUri(im.uri.replace(/^data:image\/(\w+);base64,/, "data:x;base64,"))], { type: "image/png" });
    else return Promise.resolve(null);
    return new Promise(function (res) { var u = URL.createObjectURL(blob), i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = u; });
  }
  // -> { parts: [{P,N,U,C,I, texIndex}], pose, tris }
  // Any failure inside the parser becomes one plain message (no internal JavaScript errors shown to the user).
  function friendly(e) { return e && /^(file|model|this \.gltf|no |not a|unsupported|corrupt)/.test(e.message) ? e : new Error("the file is damaged or uses glTF features this app can't read"); }
  M.build = function (buf, name) { try { return build(buf, name).catch(function (e) { throw friendly(e); }); } catch (e) { return Promise.reject(friendly(e)); } };
  function build(buf, name) {
    var g = parse(buf), J = g.j, clip = pose(g), W = worlds(g), parts = {}, tris = 0;
    (J.nodes || []).forEach(function (node, ni) {
      if (node.mesh == null) return;
      var mesh = J.meshes[node.mesh], skin = node.skin != null ? J.skins[node.skin] : null, jm = null;
      if (skin) { var ibm = skin.inverseBindMatrices != null ? acc(g, skin.inverseBindMatrices) : null; jm = skin.joints.map(function (j, k) { var m = new T.Matrix4(); if (ibm) m.fromArray(ibm, k * 16); return new T.Matrix4().multiplyMatrices(W[j], m); }); }
      mesh.primitives.forEach(function (pr) {
        if (pr.mode != null && pr.mode !== 4) return;
        var A = pr.attributes; if (A.POSITION == null) return;
        var pos = acc(g, A.POSITION), nor = A.NORMAL != null ? acc(g, A.NORMAL) : null, uv = A.TEXCOORD_0 != null ? acc(g, A.TEXCOORD_0) : null, vc = A.COLOR_0 != null ? acc(g, A.COLOR_0) : null;
        var jo = jm && A.JOINTS_0 != null ? acc(g, A.JOINTS_0) : null, we = jm && A.WEIGHTS_0 != null ? acc(g, A.WEIGHTS_0) : null;
        var mat = pr.material != null ? J.materials[pr.material] : {}, pbr = mat.pbrMetallicRoughness || {}, cf = pbr.baseColorFactor || [1, 1, 1, 1];
        var ti = pbr.baseColorTexture && uv ? pbr.baseColorTexture.index : -1, key = String(ti), P = parts[key] || (parts[key] = { P: [], N: [], U: [], C: [], I: [], tex: ti });
        var base = P.P.length / 3, v = new T.Vector3(), n = new T.Vector3(), M4 = new T.Matrix4(), nm = new T.Matrix3();
        for (var k = 0; k < pos.count; k++) {
          v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); if (nor) n.set(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]); else n.set(0, 1, 0);
          var m4 = W[ni];
          if (jo && we) { var e = M4.elements; for (var z = 0; z < 16; z++) e[z] = 0; for (var c = 0; c < 4; c++) { var wt = we[k * 4 + c]; if (!wt) continue; var je = jm[jo[k * 4 + c]].elements; for (z = 0; z < 16; z++) e[z] += wt * je[z]; } m4 = M4; }
          v.applyMatrix4(m4); nm.getNormalMatrix(m4); n.applyMatrix3(nm).normalize();
          P.P.push(v.x, v.y, v.z); P.N.push(n.x, n.y, n.z); P.U.push(uv ? uv[k * 2] : 0, uv ? uv[k * 2 + 1] : 0);
          var r = cf[0], gg = cf[1], bb = cf[2]; if (vc) { r *= vc[k * vc.n]; gg *= vc[k * vc.n + 1]; bb *= vc[k * vc.n + 2]; }
          P.C.push(r, gg, bb);
        }
        if (pr.indices != null) { var ix = acc(g, pr.indices); for (k = 0; k < ix.length; k++) P.I.push(ix[k] + base); tris += ix.length / 3; }
        else { for (k = 0; k < pos.count; k++) P.I.push(base + k); tris += pos.count / 3; }
      });
    });
    var list = Object.keys(parts).map(function (k) { return parts[k]; }); if (!list.length) throw new Error("no triangles in model");
    var y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, nv = 0;
    list.forEach(function (p) { for (var i = 0; i < p.P.length; i += 3) { x0 = Math.min(x0, p.P[i]); x1 = Math.max(x1, p.P[i]); y0 = Math.min(y0, p.P[i + 1]); y1 = Math.max(y1, p.P[i + 1]); z0 = Math.min(z0, p.P[i + 2]); z1 = Math.max(z1, p.P[i + 2]); } nv += p.P.length / 3; });
    if (nv > MAX_VERTS) throw new Error("model too detailed (" + nv + " vertices; limit " + MAX_VERTS + ")");
    var hgt = y1 - y0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (!(hgt > 0)) throw new Error("model has no height");
    if ((x1 - x0) / hgt > 1.3) throw new Error("model is wider than it is tall - probably a T-pose with no animation, or not a person");
    list.forEach(function (p) { for (var i = 0; i < p.P.length; i += 3) { p.P[i] = (p.P[i] - cx) / hgt; p.P[i + 1] = (p.P[i + 1] - y0) / hgt; p.P[i + 2] = (p.P[i + 2] - cz) / hgt; } });
    return Promise.all(list.map(function (p) { return p.tex >= 0 ? loadImage(g, p.tex) : null; })).then(function (imgs) {
      list.forEach(function (p, i) { if (imgs[i]) { var t = new T.Texture(imgs[i]); t.flipY = false; t.needsUpdate = true; t.minFilter = T.LinearFilter; t.generateMipmaps = false; p.map = t; } });
      return { name: name, parts: list, pose: clip, tris: Math.round(tris), width: (x1 - x0) / hgt };
    });
  }

  // ---------- instanced crowd from imported models ----------
  var VS = ["attribute vec3 iOffset; attribute float iRot; attribute float iH; attribute vec3 iTint; attribute vec3 color;",
    "varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vY; varying vec2 vUv;",
    "void main(){ vec3 p = position * iH; float c = cos(iRot), s = sin(iRot); vY = position.y; vUv = uv;",
    "  p = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z) + iOffset; vW = p; vN = vec3(c*normal.x + s*normal.z, normal.y, -s*normal.x + c*normal.z);",
    "  vCol = color * iTint; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }"].join("\n");
  function fs() { return [People.LIGHT_FS, "uniform sampler2D map; uniform float hasMap; varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying float vY; varying vec2 vUv;",
    "void main(){ vec3 base = vCol; if (hasMap > 0.5) base *= texture2D(map, vUv).rgb;",
    "  gl_FragColor = vec4(concertLight(base, normalize(vN), vW, vY, 0.0), 1.0); }"].join("\n"); }
  M.makeCrowd = function (people, group) {
    var n = M.list.length, by = M.list.map(function () { return []; });
    people.forEach(function (p) { var d = p.d || (p.d = People.describe(p.k)); by[(p.k * 7 + 3) % n].push(p); });
    M.list.forEach(function (m, mi) {
      var list = by[mi]; if (!list.length) return;
      var off = new Float32Array(list.length * 3), rot = new Float32Array(list.length), hh = new Float32Array(list.length), tint = new Float32Array(list.length * 3);
      list.forEach(function (p, i) { var d = p.d, t = 0.85 + 0.3 * ((p.k * 2654435761 % 997) / 997); off.set([p.x, p.y - (p.sit ? 0.45 * d.h * 0.25 : 0), p.z], i * 3); rot[i] = p.rot + (M.flip ? Math.PI : 0); hh[i] = (p.h || d.h) * (p.sit ? 0.75 : 1); tint.set([t, t, t], i * 3); });
      m.parts.forEach(function (part) {
        var g = new T.InstancedBufferGeometry();
        g.setIndex(part.I); g.addAttribute("position", new T.BufferAttribute(new Float32Array(part.P), 3)); g.addAttribute("normal", new T.BufferAttribute(new Float32Array(part.N), 3));
        g.addAttribute("uv", new T.BufferAttribute(new Float32Array(part.U), 2)); g.addAttribute("color", new T.BufferAttribute(new Float32Array(part.C), 3));
        g.addAttribute("iOffset", new T.InstancedBufferAttribute(off, 3)); g.addAttribute("iRot", new T.InstancedBufferAttribute(rot, 1));
        g.addAttribute("iH", new T.InstancedBufferAttribute(hh, 1)); g.addAttribute("iTint", new T.InstancedBufferAttribute(tint, 3)); g.maxInstancedCount = list.length;
        if (!part.mat) { var u = People.lightUniforms(); u.map = { value: part.map || null }; u.hasMap = { value: part.map ? 1 : 0 }; part.mat = new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs(), uniforms: u }); }
        if (People.stagePos) part.mat.uniforms.uStage.value.copy(People.stagePos);
        var mesh = new T.Mesh(g, part.mat); mesh.frustumCulled = false; group.add(mesh); // material kept for the model's lifetime (no recompiles)
      });
    });
    group.userData.count = people.length; return group;
  };

  // ---------- persistence (IndexedDB, this browser only) ----------
  function db() { return new Promise(function (res, rej) { var r = indexedDB.open("seatview-models", 1); r.onupgradeneeded = function () { r.result.createObjectStore("files"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function tx(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("files", mode), s = t.objectStore("files"), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }
  M.add = function (file) {
    if (!file || file.size > MAX_BYTES) return Promise.reject(new Error("file is larger than 60 MB")); // checked before reading anything
    if (file.size < 20) return Promise.reject(new Error("file is empty or not a 3D model"));
    return file.arrayBuffer().then(function (buf) { return M.build(buf, file.name).then(function (m) { M.list.push(m); return tx("readwrite", function (s) { s.put(buf, file.name); }).catch(function () {}).then(function () { return m; }); }); });
  };
  M.clear = function () { M.list = []; return tx("readwrite", function (s) { s.clear(); }).catch(function () {}); };
  M.restore = function () {
    if (!window.indexedDB) return Promise.resolve([]);
    return tx("readonly", function (s) { var keys = s.getAllKeys(), vals = s.getAll(); return { k: keys, v: vals }; }).then(function (r) {
      var names = r.k.result || [], bufs = r.v.result || [];
      return Promise.all(bufs.map(function (b, i) { return M.build(b, names[i]).then(function (m) { M.list.push(m); }, function () {}); }));
    }).catch(function () { return []; });
  };
})();
