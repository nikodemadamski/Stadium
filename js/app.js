/* Seat View — app controller. */
(function () {
  var T = THREE, $ = function (id) { return document.getElementById(id); };
  var canvas = $("c"), view = $("view");
  var renderer;
  try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" }); renderer.setClearColor(0x05060c); }
  catch (e) { $("loading").textContent = "3D is not available in this browser (WebGL failed: " + e.message + ")."; throw e; }
  var A = window.__app = { renderer: renderer };
  var state = A.state = {
    stadium: null, mode: "map", yaw: 0.6, pitch: 0.55, dist: 260, target: new T.Vector3(0, 8, 0),
    seatIdx: -1, eye: new T.Vector3(), lookYaw: 0, lookPitch: 0, fov: 55,
    density: 1, phones: 0.3, standing: true, playing: true, t: 0, zoom: 1, optical: 3, raise: 0.35, landscape: false,
    event: null, events: [], level: null, block: null
  };
  var S, model, sc; // current stadium data, geometry, scene

  // ---------- storage (works even if blocked) ----------
  var mem = {};
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { if (v === undefined) return mem[k] || null; mem[k] = v; } }
  A.storeGet = function (k) { return store(k); };

  // ---------- rendering ----------
  var rt = null, blitScene = new T.Scene(), blitCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var blitQuad = new T.Mesh(new T.PlaneBufferGeometry(2, 2), new T.MeshBasicMaterial({ map: null, depthTest: false })); blitScene.add(blitQuad);
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var lastHdr = -1;
  function setHdr() { var h = $("top").offsetHeight + $("infoBar").offsetHeight; if (h !== lastHdr) { lastHdr = h; document.documentElement.style.setProperty("--hdr", h + "px"); } }
  window.addEventListener("resize", setHdr); setHdr();
  if (window.ResizeObserver) { var roPending = false, ro = new ResizeObserver(function () { if (roPending) return; roPending = true; requestAnimationFrame(function () { roPending = false; setHdr(); }); }); ro.observe($("top")); ro.observe($("infoBar")); }
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    if (sc) { sc.camera.aspect = w / h; sc.camera.updateProjectionMatrix(); }
    layoutPhone();
  }
  window.addEventListener("resize", resize);
  function setCrowdScale(cam, hpx) { if (sc && sc.crowdMat) sc.crowdMat.uniforms.uScale.value = hpx / (2 * Math.tan(cam.fov * Math.PI / 360)); }
  function lookDir() { var cp = Math.cos(state.lookPitch); return new T.Vector3(Math.sin(state.lookYaw) * cp, Math.sin(state.lookPitch), Math.cos(state.lookYaw) * cp); }
  function updateCamera() {
    var c = sc.camera;
    if (state.mode === "overview") {
      var cp = Math.cos(state.pitch);
      c.position.set(state.target.x + state.dist * cp * Math.sin(state.yaw), state.target.y + state.dist * Math.sin(state.pitch), state.target.z + state.dist * cp * Math.cos(state.yaw));
      c.lookAt(state.target); c.fov = 55;
    } else { c.position.copy(state.eye); c.lookAt(state.eye.clone().add(lookDir())); c.fov = state.fov; }
    c.updateProjectionMatrix();
  }

  // ---------- phone camera ----------
  var phoneRect = null, BASE_LONG_FOV = 69; // typical 1× main camera (~26 mm equiv.) ⚠️ varies by phone
  function layoutPhone() {
    var f = $("phoneFrame");
    if (state.mode !== "phone") { f.hidden = true; phoneRect = null; return; }
    f.hidden = false;
    var W = canvas.clientWidth, H = canvas.clientHeight, ar = 3 / 4, ph, pw, bottom = $("bottom").offsetHeight + 6, top = $("camTop").offsetHeight + 6;
    var avail = H - top - bottom;
    if (!state.landscape) { ph = avail; pw = ph * ar; if (pw > W) { pw = W; ph = pw / ar; } }
    else { pw = W; ph = pw * ar; if (ph > avail) { ph = avail; pw = ph / ar; } }
    var x = (W - pw) / 2, y = top + Math.max(0, (avail - ph) / 2);
    f.style.left = x + "px"; f.style.top = y + "px"; f.style.width = pw + "px"; f.style.height = ph + "px";
    f.classList.toggle("landscape", state.landscape);
    phoneRect = { x: x, y: y, w: pw, h: ph };
  }
  // iPhone 17 Pro (Apple tech specs): Ultra Wide 13 mm (0.5×), Main 24 mm (1×; 2× = 48 mm crop of the 48MP sensor), Telephoto 100 mm (4×; 8× = 200 mm crop), digital to 40×.
  // 35mm-equivalent focal lengths use the 43.27 mm full-frame diagonal; a 4:3 photo's long side is 34.6 mm of that.
  var IPHONE = { main: 24, lenses: [13, 24, 100], maxZoom: 40 };
  function zoomName() { var f = focal(), named = { 13: "0.5×", 24: "1×", 48: "2×", 100: "4×", 200: "8×" }; for (var k in named) if (Math.abs(f - k) < 1) return named[k]; return (f / 24 < 10 ? (f / 24).toFixed(1) : Math.round(f / 24)) + "×"; }
  function focal() { return Math.max(13, IPHONE.main * state.zoom); }
  function phoneFovV() { var half = (state.landscape ? 25.96 : 34.61) / 2; return 2 * Math.atan(half / focal()) * 180 / Math.PI; }
  function lensFor(f) { var L = IPHONE.lenses[0]; IPHONE.lenses.forEach(function (x) { if (x <= f + 1e-6) L = x; }); return L; }
  // 12MP photo from a 48MP lens: a 2× crop keeps full detail (Apple's "optical-quality" 2× and 8×). Beyond that = digital upscale.
  function phoneQuality() { var f = focal(); return Math.min(1, 2 * lensFor(f) / f); }
  A.phoneInfo = function () { var f = focal(); return { zoom: state.zoom, name: zoomName(), focal: f, lens: lensFor(f), quality: phoneQuality(), fov: phoneFovV() }; };
  function renderPhone() {
    if (!phoneRect || state.seatIdx < 0) return;
    var pc = sc.phoneCam, d = lookDir();
    pc.position.copy(state.eye).add(new T.Vector3(0, state.raise, 0)).add(d.clone().multiplyScalar(0.3)); pc.lookAt(pc.position.clone().add(d));
    pc.aspect = phoneRect.w / phoneRect.h; pc.fov = phoneFovV(); pc.updateProjectionMatrix();
    var q = phoneQuality(), w = Math.max(16, Math.round(phoneRect.w * dpr * q)), h = Math.max(16, Math.round(phoneRect.h * dpr * q));
    if (!rt || rt.width !== w || rt.height !== h) { if (rt) rt.dispose(); rt = new T.WebGLRenderTarget(w, h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter }); }
    setCrowdScale(pc, h);
    renderer.render(sc.scene, pc, rt, true);
    if (blitQuad.material.map !== rt.texture) { blitQuad.material.map = rt.texture; blitQuad.material.needsUpdate = true; }
    var H = canvas.clientHeight;
    renderer.setScissorTest(true);
    renderer.setViewport(phoneRect.x, phoneRect.y, phoneRect.w, phoneRect.h); // three.js flips y itself
    renderer.setScissor(phoneRect.x, phoneRect.y, phoneRect.w, phoneRect.h);
    renderer.render(blitScene, blitCam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
    var f = focal(), lname = { 13: "Ultra Wide", 24: "Main", 100: "Telephoto" }[lensFor(f)];
    var hud = Math.round(f) + " mm <span>· " + lname + (q >= 0.999 ? "" : " · digital " + Math.round(q * 100) + "%") + "</span>";
    if (sc.performer.visible) {
      var top = sc.performer.position.clone().add(new T.Vector3(0, 1.8, 0)).project(pc), bot = sc.performer.position.clone().project(pc);
      var frac = Math.abs(top.y - bot.y) / 2, inFrame = Math.abs(top.x) < 1 && Math.abs(bot.y) < 1.2 && top.z < 1, lines = state.landscape ? 1200 : 1600;
      hud += "<br><span>Performer " + (!inFrame ? "out of frame" : sc.performerHiddenFrom(pc.position) ? "hidden behind set" : "≈ " + Math.round(frac * lines) + " px tall in the photo") + "</span>";
    }
    if (hud !== A._hud) { $("phoneHud").innerHTML = hud; A._hud = hud; }
  }

  // ---------- loop ----------
  var last = performance.now(), frames = 0, fpsT = last, lowFpsFor = 0;
  // Render on demand: draw only when something changed (any input, mode/seat/venue change) or something animates
  // (show playing on a stage). Otherwise redraw at most every 500 ms as a safety net. Saves battery and GPU on idle views.
  var dirtyFrames = 2, lastDraw = 0;
  function invalidate() { dirtyFrames = 2; } A.invalidate = invalidate;
  ["pointerdown", "pointermove", "pointerup", "wheel", "keydown", "input", "change", "click", "resize"].forEach(function (ev) { (ev === "resize" ? window : document).addEventListener(ev, invalidate, true); });
  function loop(now) {
    requestAnimationFrame(loop);
    A.frames = (A.frames || 0) + 1;
    if (A.paused || !sc) { last = now; return; }
    var animating = state.mode !== "map" && state.playing; // the crowd moves at every event now, not only shows
    if (!animating && dirtyFrames <= 0 && now - lastDraw < 500) { last = now; return; }
    if (dirtyFrames > 0) dirtyFrames--; lastDraw = now; A.renderCount = (A.renderCount || 0) + 1;
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state.playing && sc.pathCurve) { state.t += dt; $("time").value = ((state.t / sc.pathSeconds) % 1).toFixed(3); }
    People.tick(now / 1000, A.isSport()); $("crowdJump").hidden = A.isSport() || People.still;
    People.update(state.mode === "phone" ? sc.phoneCam : sc.camera);
    if (sc.match && state.playing && state.mode !== "map") sc.match.update(dt, now / 1000);
    sc.placePerformer(state.t); if (state.mode !== "map") sc.updateFx(now / 1000, renderer, state.mode === "phone" ? sc.phoneCam : sc.camera); updateCamera(); setCrowdScale(sc.camera, canvas.clientHeight * dpr);
    if (state.mode === "phone") renderer.clear(); else if (state.mode !== "map") renderer.render(sc.scene, sc.camera);
    if (state.mode === "phone") renderPhone();
    frames++;
    if (now - fpsT > 500) {
      setHdr(); var fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; $("fps").textContent = fps.toFixed(0) + " fps"; A.fps = fps;
      if (fps < 24 && dpr > 1) { lowFpsFor += 0.5; if (lowFpsFor >= 2) { dpr = 1; resize(); lowFpsFor = 0; } } else lowFpsFor = 0;
    }
  }

  // ---------- input ----------
  var ptrs = {}, downAt = null, pinch0 = null;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  canvas.addEventListener("pointerdown", function (e) { canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; downAt = { x: e.clientX, y: e.clientY, t: performance.now(), n: Object.keys(ptrs).length }; });
  canvas.addEventListener("pointermove", function (e) {
    var p = ptrs[e.pointerId]; if (!p || !sc) return; var ids = Object.keys(ptrs);
    if (ids.length === 2) { p.x = e.clientX; p.y = e.clientY; var a = ptrs[ids[0]], b = ptrs[ids[1]], dd = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) zoomBy(pinch0 / dd); pinch0 = dd; return; }
    var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (state.mode === "overview") { state.yaw += dx * 0.006; /* drag right = fly right, same feel as turning your head in "My view" */ state.pitch = clamp(state.pitch + dy * 0.004, 0.08, 1.45); }
    else { var k = state.mode === "phone" ? 0.0025 / state.zoom : 0.004 * state.fov / 55; state.lookYaw -= dx * k; state.lookPitch = clamp(state.lookPitch + dy * k, -1.2, 1.2); }
  });
  canvas.addEventListener("pointerup", function (e) {
    if (sc && downAt && downAt.n === 1 && Object.keys(ptrs).length === 1 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && performance.now() - downAt.t < 600 && state.mode !== "phone") {
      var r = canvas.getBoundingClientRect(), idx = sc.pickSeat(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, sc.camera);
      if (idx >= 0) goToSeat(idx);
    }
    delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch0 = null;
  });
  canvas.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; pinch0 = null; });
  canvas.addEventListener("wheel", function (e) { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  function zoomBy(f) {
    if (state.mode === "overview") state.dist = clamp(state.dist * f, 40, 520);
    else if (state.mode === "seat") state.fov = clamp(state.fov * f, 8, 80);
    else if (state.mode === "phone") { state.zoom = clamp(state.zoom / f, 0.5, IPHONE.maxZoom); syncZoomUI(); }
  }

  // ---------- modes ----------
  var HINTS = { map: "", overview: "Drag to turn · pinch/scroll to zoom · tap a seat to sit there", seat: "Your view · drag to look around · pinch/scroll = binoculars", phone: "Drag to aim · pinch/scroll or slider = phone zoom" };
  function setMode(m) {
    invalidate();
    if ((m === "seat" || m === "phone") && state.seatIdx < 0) { showTab("seat"); setMode("map"); flash("Pick a seat first: click a section, then a seat"); return; }
    state.mode = m; document.body.classList.toggle("mapmode", m === "map"); SeatMap.show(m === "map");
    document.querySelectorAll("#modeBar button").forEach(function (b) { b.classList.toggle("on", b.dataset.mode === m); });
    $("phoneCtl").hidden = m !== "phone"; $("hint").textContent = HINTS[m]; $("hint").classList.remove("flash");
    var was = document.body.classList.contains("phonemode"); document.body.classList.toggle("phonemode", m === "phone");
    if (was !== (m === "phone")) resize();
    layoutPhone(); requestAnimationFrame(function () { resize(); layoutPhone(); });
  }
  document.querySelectorAll("#modeBar button").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });
  var flashT = 0;
  function flash(msg) { var h = $("hint"); h.textContent = msg; h.classList.add("flash"); clearTimeout(flashT); flashT = setTimeout(function () { h.classList.remove("flash"); h.textContent = HINTS[state.mode]; }, 3000); }

  // ---------- crowd / performer controls ----------
  function setDensity(d) {
    state.density = d; document.querySelectorAll("#crowdBar button[data-d]").forEach(function (b) { b.classList.toggle("on", +b.dataset.d === d); });
    sc.setDensity(d); if (state.seatIdx >= 0) sc.updateNearPeople(state.seatIdx, d, state.phones);
    $("people").textContent = sc.visiblePeople().toLocaleString();
  }
  document.querySelectorAll("#crowdBar button[data-d]").forEach(function (b) { b.addEventListener("click", function () { setDensity(+b.dataset.d); }); });
  function play() { if (!state.playing) { state.playing = true; $("play").textContent = "Pause"; } }
  $("crowdWave").addEventListener("click", function () { People.wave(); play(); });
  // Moving / Still. Still: everyone holds one pose; Sit / Stand chooses which (the same "Crowd standing" setting).
  function setStanding(on) { state.standing = on; $("standing").checked = on; rebuildCrowd(); if (state.seatIdx >= 0) goToSeat(state.seatIdx); syncCrowdUI(); }
  function syncCrowdUI() {
    var still = People.still; $("crowdMove").classList.toggle("on", !still); $("crowdStill").classList.toggle("on", still);
    $("crowdMove").setAttribute("aria-pressed", !still); $("crowdStill").setAttribute("aria-pressed", still); $("stillPose").hidden = !still;
    $("stillSit").classList.toggle("on", !state.standing); $("stillStand").classList.toggle("on", state.standing);
  }
  A.syncCrowdUI = syncCrowdUI;
  $("crowdMove").addEventListener("click", function () { People.still = false; syncCrowdUI(); invalidate(); });
  $("crowdStill").addEventListener("click", function () { People.still = true; syncCrowdUI(); invalidate(); });
  $("stillSit").addEventListener("click", function () { setStanding(false); });
  $("stillStand").addEventListener("click", function () { setStanding(true); });
  $("crowdJump").addEventListener("click", function () { People.jump(); play(); });
  $("phones").addEventListener("input", function () { state.phones = +this.value; $("phonesLbl").textContent = Math.round(state.phones * 100) + "%"; sc.setPhones(state.phones); if (state.seatIdx >= 0) sc.updateNearPeople(state.seatIdx, state.density, state.phones); });
  $("standing").addEventListener("change", function () { state.standing = this.checked; rebuildCrowd(); if (state.seatIdx >= 0) goToSeat(state.seatIdx); if (A.syncCrowdUI) A.syncCrowdUI(); });
  $("play").addEventListener("click", function () { state.playing = !state.playing; this.textContent = state.playing ? "Pause" : "Play"; });
  $("time").addEventListener("input", function () { state.playing = false; $("play").textContent = "Play"; state.t = +this.value * (sc.pathSeconds || 30); });
  $("showPath").addEventListener("change", function () { sc.showPath = this.checked; if (sc.pathLine) sc.pathLine.visible = this.checked; });
  function syncZoomUI() {
    $("zoom").value = Math.log(state.zoom / 0.5) / Math.log(IPHONE.maxZoom / 0.5); $("zoomLbl").textContent = zoomName();
    var pills = Array.prototype.slice.call(document.querySelectorAll(".lenses button")), act = pills[0];
    pills.forEach(function (b) { if (+b.dataset.z <= state.zoom + 0.01) act = b; });
    pills.forEach(function (b) { var on = b === act; b.classList.toggle("on", on); b.textContent = on ? zoomName() : b.dataset.l; });
  }
  $("zoom").addEventListener("input", function () { state.zoom = 0.5 * Math.pow(IPHONE.maxZoom / 0.5, +this.value); syncZoomUI(); });
  document.querySelectorAll(".lenses button").forEach(function (b) { b.addEventListener("click", function () { state.zoom = +b.dataset.z; syncZoomUI(); }); });
  A.setZoom = function (z) { z = +z; if (!isFinite(z)) return; state.zoom = clamp(z, 0.5, IPHONE.maxZoom); syncZoomUI(); };
  $("shutter").addEventListener("click", function () {
    var fo = $("flashOv"); fo.classList.remove("go"); void fo.offsetWidth; fo.classList.add("go");
    var p = A.takePhoto(!canShareFiles()); if (p) { $("camThumbImg").src = p.url; if (canShareFiles()) sharePhoto(p); }
  });
  function canShareFiles() { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] })); } catch (e) { return false; } }
  function sharePhoto(p) { // phones: native share sheet (Save Image, AirDrop, WhatsApp…); falls back to a download
    fetch(p.url).then(function (r) { return r.blob(); }).then(function (b) {
      var f = new File([b], p.name, { type: "image/jpeg" });
      return navigator.share({ files: [f], title: "View from my seat" });
    }).catch(function (e) { if (e && e.name !== "AbortError") downloadPhoto(p); });
  }
  function downloadPhoto(p) { var a = document.createElement("a"); a.href = p.url; a.download = p.name; document.body.appendChild(a); a.click(); a.remove(); flash("Photo saved to your downloads"); }
  $("camThumb").addEventListener("click", function () { if (A.lastPhoto) { var w = window.open(); if (w) w.document.write('<title>Seat View photo</title><body style="margin:0;background:#000"><img style="max-width:100%;max-height:100vh;display:block;margin:auto" src="' + A.lastPhoto.url + '">'); } });
  $("camClose").addEventListener("click", function () { setMode("seat"); });
  // Saves a 1200×1600 (3:4) JPEG from your seat; beyond the lens' optical-quality range it is rendered smaller and upscaled, like digital zoom.
  A.takePhoto = function (download) {
    if (state.seatIdx < 0) return null;
    var W = state.landscape ? 1600 : 1200, H = state.landscape ? 1200 : 1600, q = phoneQuality();
    var w = Math.max(16, Math.round(W * q)), h = Math.max(16, Math.round(H * q)), pc = sc.phoneCam, d = lookDir();
    pc.position.copy(state.eye).add(new T.Vector3(0, state.raise, 0)).add(d.clone().multiplyScalar(0.3)); pc.lookAt(pc.position.clone().add(d));
    pc.aspect = W / H; pc.fov = phoneFovV(); pc.updateProjectionMatrix();
    var t = new T.WebGLRenderTarget(w, h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter }); setCrowdScale(pc, h);
    renderer.render(sc.scene, pc, t, true);
    var px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(t, 0, 0, w, h, px); t.dispose(); renderer.setRenderTarget(null);
    var small = document.createElement("canvas"); small.width = w; small.height = h; var sx = small.getContext("2d"), img = sx.createImageData(w, h);
    for (var y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    sx.putImageData(img, 0, 0);
    var out = document.createElement("canvas"); out.width = W; out.height = H; var o = out.getContext("2d"); o.imageSmoothingEnabled = true; o.drawImage(small, 0, 0, W, H);
    var s = model.seats[state.seatIdx], f = focal();
    o.fillStyle = "rgba(0,0,0,.55)"; o.fillRect(0, H - 64, W, 64); o.fillStyle = "#fff"; o.font = "22px Segoe UI, Arial, sans-serif";
    o.fillText(S.name + " · " + SeatMap.seatLabel(state.seatIdx) + (state.event ? " · " + state.event.name : ""), 18, H - 36);
    o.font = "17px Segoe UI, Arial, sans-serif"; o.fillText("Simulated iPhone 17 Pro photo · " + zoomName() + " (" + Math.round(f) + " mm) · " + (q >= 0.999 ? "optical quality" : Math.round(q * 100) + "% detail (digital)") + " · 3D model, not a real photo", 18, H - 12);
    var url = out.toDataURL("image/jpeg", 0.9), name = "seatview-" + S.id + "-" + SeatMap.seatLabel(state.seatIdx).replace(/[^A-Za-z0-9]+/g, "-") + "-" + Math.round(f) + "mm.jpg";
    A.lastPhoto = { w: W, h: H, q: q, url: url, name: name };
    if (download) downloadPhoto(A.lastPhoto);
    return A.lastPhoto;
  };
  $("orient").addEventListener("click", function () { state.landscape = !state.landscape; layoutPhone(); });
  function rebuildCrowd() {
    sc.buildCrowd({ density: state.density, phones: state.phones, standing: state.standing, stage: currentPreset() });
    setDensity(state.density); renderPitchNote();
  }
  function renderPitchNote() {
    var p = sc.pitchInfo; if (!p) return;
    $("pitchNote").innerHTML = "Pitch standing crowd: " + p.n.toLocaleString() + " (" + esc(p.basis) + ")" + (p.flagged ? " ⚠️" : "") + ". Seats/terraces open: " + sc.openPlaces.toLocaleString() + ".";
  }

  // ---------- stage presets & stage end ----------
  function presetKey() { return "preset:" + (state.event ? state.event.id : S.id); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isSport(e) { return !!e && (e.type === "rugby" || e.type === "football" || e.type === "sport"); }
  A.isSport = function () { return isSport(state.event); };
  function presetsForVenue() { return Object.keys(STAGE_PRESETS).filter(function (k) { return (STAGE_PRESETS[k].kinds || ["stadium"]).indexOf(S.kind || "stadium") >= 0; }); }
  function currentPresetKey() { if (isSport(state.event)) return null; var ok = presetsForVenue(), k = store(presetKey()); return ok.indexOf(k) >= 0 ? k : ok[0]; }
  function currentPreset() { var k = currentPresetKey(); return k ? STAGE_PRESETS[k] : null; }
  function endKey() { return "stageEnd:" + S.id; }
  function stageEndTag() { var v = store(endKey()); return v === "A" || v === "C" ? v : S.stage.defaultEnd; }
  function applyStage() {
    sc.stageSign = stageEndTag() === "A" ? -1 : 1; People.ctx.sport = isSport(state.event); People.waveLen = S.kind === "stadium" ? 24 : 16;
    sc.setStage(currentPreset()); sc.setMatch(isSport(state.event) ? state.event : null); rebuildCrowd(); renderPresetBtns(); renderStageEnd(); renderMap();
    if (state.seatIdx >= 0) goToSeat(state.seatIdx);
    SeatMap.computeStats(); SeatMap.refresh(); thumbCache = {}; renderCompare();
  }
  A.applyPreset = function (k) { if (!own(STAGE_PRESETS, k)) return; store(presetKey(), k); applyStage(); };
  A.switchEnd = function () { store(endKey(), stageEndTag() === "A" ? "C" : "A"); applyStage(); };
  function renderPresetBtns() {
    var cur = currentPresetKey(), sport = isSport(state.event);
    document.querySelectorAll(".stageOnly").forEach(function (el) { el.hidden = sport; });
    $("sportNote").hidden = !sport;
    if (sport) { $("sportNote").innerHTML = "<b>" + esc(EVENT_TYPES[state.event.type]) + " layout</b>: no stage, every stand open. A simulated match plays on the pitch so you can judge the view (kits are approximate). Distances are measured to the centre of the pitch."; return; }
    $("presetBtns").innerHTML = presetsForVenue().map(function (k) { return '<button type="button" data-k="' + k + '"' + (k === cur ? ' class="on"' : "") + ">" + esc(STAGE_PRESETS[k].name) + "</button>"; }).join("");
    $("presetBtns").querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { A.applyPreset(b.dataset.k); }); });
    $("presetNote").textContent = STAGE_PRESETS[cur].note + " Saved for this concert.";
  }
  function renderStageEnd() {
    if (isSport(state.event)) { $("stageEnd").innerHTML = ""; return; }
    if (S.stage.fixedEnd) { $("stageEnd").innerHTML = '<p class="small muted">' + esc(S.stage.note) + "</p>"; return; }
    var tag = stageEndTag(), src = S.stage.src !== "placeholder" ? SOURCES[S.stage.src] : null;
    $("stageEnd").innerHTML = '<div class="warnbox"><b>Stage at: ' + esc(S.stage.endName[tag]) + "</b><br>" + esc(S.stage.note) +
      (src ? ' <a href="' + esc(safeUrl(src.url)) + '" target="_blank" rel="noopener">source ↗</a>' : "") +
      '<div class="pickrow"><button type="button" id="switchEnd">Switch stage to ' + esc(S.stage.endName[tag === "A" ? "C" : "A"]) + "</button></div></div>";
    $("switchEnd").addEventListener("click", A.switchEnd);
  }

  // ---------- events (scraped + live MusicBrainz check) ----------
  function today() { return new Date().toISOString().slice(0, 10); }
  function fetchJSON(url, ms) {
    return new Promise(function (res, rej) {
      var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); rej(new Error("timeout")); }, ms || 9000);
      fetch(url, { headers: { Accept: "application/json" }, signal: ctl ? ctl.signal : undefined })
        .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(res, function (e) { clearTimeout(to); rej(e); });
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var MB = "https://musicbrainz.org/ws/2/", MB_GAP = 1100;
  function mbGet(url) { return fetchJSON(url).catch(function (e) { if (/HTTP 503/.test(e.message)) return sleep(2500).then(function () { return fetchJSON(url); }); throw e; }); }
  var MB_NAMES = { aviva: "Aviva Stadium", croke: "Croke Park", puc: "Páirc Uí Chaoimh", thomond: "Thomond Park", "3arena": "3Arena", bget: "Bord Gáis Energy Theatre" };
  function liveCheck(stadiumId) {
    var place;
    return mbGet(MB + "place?query=" + encodeURIComponent('place:"' + MB_NAMES[stadiumId] + '"') + "&fmt=json&limit=10").then(function (j) {
      var nm = MB_NAMES[stadiumId].toLowerCase();
      var ps = (j.places || []).filter(function (p) { return (p.name || "").toLowerCase() === nm; });
      place = ps.filter(function (p) { return /ireland|dublin|cork|limerick/i.test(JSON.stringify(p.area || {}) + (p.address || "")); })[0] || ps[0];
      if (!place) throw new Error("venue not found on MusicBrainz");
      return sleep(MB_GAP);
    }).then(function () {
      var all = [];
      function page(off) {
        return mbGet(MB + "event?place=" + place.id + "&limit=100&offset=" + off + "&fmt=json").then(function (j) {
          var total = j["event-count"] != null ? j["event-count"] : (j.count || 0); all = all.concat(j.events || []);
          if ((j.events || []).length === 100 && off + 100 < total && off + 100 < 500) return sleep(MB_GAP).then(function () { return page(off + 100); });
          return all;
        });
      }
      return page(0);
    }).then(function (evs) {
      var t = today();
      return evs.filter(function (e) { var d = (e["life-span"] || {}).begin || ""; return d >= t && /concert|festival/i.test(e.type || ""); })
        .map(function (e) { return cleanEvent({ id: "mb-" + e.id, name: e.name, date: (e["life-span"] || {}).begin, src: "MusicBrainz (CC0)", url: "https://musicbrainz.org/event/" + encodeURIComponent(e.id), live: true }); })
        .filter(Boolean);
    });
  }
  function markPast(list) { var t = today(); list.forEach(function (e) { e.past = (e.until || e.date) < t; }); return list; }
  A.markPast = markPast;
  function loadEvents() {
    var id = S.id, base = markPast((EVENTS[id] || []).concat(TM.eventsFor(id)).filter(function (e, i, arr) {
      return arr.findIndex(function (x) { return x.date === e.date && x.name.toLowerCase().slice(0, 8) === e.name.toLowerCase().slice(0, 8); }) === i; // de-duplicate live vs listed
    })).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    state.events = base; A.eventSource = "scraped"; A.live = "checking";
    renderEventSel();
    liveCheck(id).then(function (extra) {
      if (!S || S.id !== id) return;
      var have = {}; state.events.forEach(function (e) { have[e.date + "|" + e.name.toLowerCase().slice(0, 8)] = 1; });
      var added = markPast(extra.filter(function (e) { return !have[e.date + "|" + e.name.toLowerCase().slice(0, 8)]; }));
      state.events = state.events.concat(added).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      A.live = "ok"; A.liveAdded = added.length; renderEventSel(true); renderEventCard();
    }).catch(function (e) { if (S && S.id === id) { A.live = "failed"; A.liveError = e.message; renderEventCard(); } });
  }
  function renderEventSel(keep) {
    var sel = $("eventSel"), upcoming = state.events.filter(function (e) { return !e.past; }), past = state.events.filter(function (e) { return e.past; });
    var html = upcoming.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(fmtDate(e.date, true) + " — " + e.name + (e.type && e.type !== "concert" ? " (" + EVENT_TYPES[e.type] + ")" : "")) + "</option>"; }).join("");
    if (!upcoming.length) html += '<option value="" disabled>No upcoming events announced</option>';
    if (past.length) html += '<optgroup label="Past events">' + past.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(fmtDate(e.date, true) + " — " + e.name + " (past)") + "</option>"; }).join("") + "</optgroup>";
    sel.innerHTML = html;
    var want = A.wantEvent, cur = want && state.events.some(function (e) { return e.id === want; }) ? want : keep && state.event ? state.event.id : (upcoming[0] || past[0] || {}).id; A.wantEvent = null;
    if (cur) { sel.value = cur; selectEvent(cur, keep); }
  }
  $("eventSel").addEventListener("change", function () { selectEvent(this.value); });
  function selectEvent(id, keep) {
    var ev = state.events.filter(function (e) { return e.id === id; })[0]; if (!ev) return;
    var changed = !state.event || state.event.id !== ev.id, prevType = state.event ? state.event.type || "concert" : null; state.event = ev; A.event = ev;
    if (changed && prevType !== (ev.type || "concert")) { state.standing = (ev.type || "concert") === "concert" && S.kind !== "theatre"; $("standing").checked = state.standing; if (A.syncCrowdUI) A.syncCrowdUI(); }
    renderEventCard(); if (changed || !keep) applyStage(); Sidebar.setCurrent(ev.id); $("eventSel").value = ev.id; renderHeader(); TM.render(A);
  }
  function renderEventCard() {
    var e = state.event, live = A.live === "ok" ? '<span class="badge ok">MusicBrainz checked live' + (A.liveAdded ? " (+" + A.liveAdded + ")" : "") + "</span>" : "";
    var none = EVENTS.noneUpcoming && EVENTS.noneUpcoming[S.id];
    $("eventCard").innerHTML = (none ? '<div class="warnbox">' + esc(none.text) + ' <a href="' + esc(safeUrl(none.url)) + '" target="_blank" rel="noopener">checked here ↗</a></div>' : "") +
      (e ? '<div class="card sel"><div class="t">' + esc(e.name) + (e.tour ? ' <span class="muted small">' + esc(e.tour) + "</span>" : "") + "</div>" +
        '<div class="d">' + esc(fmtDate(e.date)) + " · " + esc(S.name) + (e.past ? " · <b>past</b>" : "") + (e.note ? " · " + esc(e.note) : "") + "</div>" +
        '<div class="small">Source: <a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.src) + " ↗</a>" + (e.live ? "" : " · read " + fmtDate(EVENTS.scrapedOn)) + "</div></div>" : "") +
      '<div class="small">' + live + "</div>";
  }

  // ---------- stadium switching ----------
  [["stadium", "Stadiums"], ["arena", "Arena"], ["theatre", "Theatre"]].forEach(function (k) {
    var og = document.createElement("optgroup"); og.label = k[1];
    STADIUMS.filter(function (s) { return (s.kind || "stadium") === k[0]; }).forEach(function (s) { var o = document.createElement("option"); o.value = s.id; o.textContent = s.name + " · " + s.city; og.appendChild(o); });
    $("stadiumSel").appendChild(og);
  });
  $("stadiumSel").addEventListener("change", function () { loadStadium(this.value); });
  var loadSeq = 0;
  function loadStadium(id) {
    $("loading").hidden = false; var my = ++loadSeq; A.ready = false;
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (my !== loadSeq) { resolve(false); return; } // a newer request superseded this one
        var next = STADIUMS.filter(function (s) { return s.id === id; })[0] || STADIUMS[0];
        if (sc) { sc.dispose(); if (rt) { rt.dispose(); rt = null; blitQuad.material.map = null; } }
        A.builds = (A.builds || 0) + 1; S = next; A.S = S; model = StadiumGeo.build(S); A.model = model;
        sc = new StadiumScene(renderer, S, model); A.sc = sc;
        $("stadiumSel").value = S.id; store("stadium", S.id);
        state.seatIdx = -1; A.lastSeat = null; state.block = null; state.level = S.levels[0].id; state.event = null;
        state.dist = model.seats.reduce(function (m, s) { return Math.max(m, Math.hypot(s.x, s.z)); }, 0) * 2.3; state.yaw = 0.6; state.pitch = 0.55;
        SeatMap.setStadium(); setMode("map"); resize();
        renderLevelTabs(); renderMap(); fillBlockSel(); $("blockInfo").innerHTML = ""; $("seatInfo").innerHTML = "";
        sc.stageSign = stageEndTag() === "A" ? -1 : 1; sc.setStage(currentPreset()); rebuildCrowd();
        loadEvents(); renderPhotos(); thumbCache = {}; if (document.querySelector("#tab-sources.on")) renderSources();
        try { sc.updateNearPeople(model.blocks[0].rowInfo[0].start, 1, 1); renderer.compile(sc.scene, sc.camera); sc.updateNearPeople(-1, 1, 1); } catch (e) {}
        $("loading").hidden = true; A.ready = true; invalidate(); resolve(true);
      }, 30);
    });
  }
  A.loadStadium = loadStadium;

  // ---------- seat picking: map + lists ----------
  function renderLevelTabs() {
    $("levelTabs").innerHTML = S.levels.map(function (L) { return '<button type="button" data-l="' + L.id + '"' + (L.id === state.level ? ' class="on"' : "") + ">" + esc(L.name) + "</button>"; }).join("");
    $("levelTabs").querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { state.level = b.dataset.l; renderLevelTabs(); renderMap(); fillBlockSel(); }); });
  }
  function renderMap() {
    if (!document.getElementById("map").offsetParent) return; // legacy SVG mini-map is hidden in this design
    var ring = model.ring, out = [], sx = 125 / Math.max(S.ring.halfX + 40, 1), sz = 155 / (S.ring.halfZ + 40), sca = Math.min(sx, sz);
    var hw = S.field.width / 2 * sca, hl = S.field.length / 2 * sca, pr = currentPreset().deck, sg = sc.stageSign, F = S.field.length / 2 - 13;
    out.push('<rect x="' + -hw + '" y="' + -hl + '" width="' + 2 * hw + '" height="' + 2 * hl + '" fill="#2f7d3b"/>');
    var zf = sg * F * sca, zb = sg * (F + pr.depth) * sca;
    out.push('<rect x="' + (-pr.width / 2 * sca) + '" y="' + Math.min(zf, zb) + '" width="' + pr.width * sca + '" height="' + Math.abs(zb - zf) + '" fill="#111" stroke="#ff2e88" stroke-width=".8"/><text x="0" y="' + ((zf + zb) / 2) + '" style="font-size:6px">STAGE</text>');
    var lvl = S.levels.map(function (L) { return L.id; }).indexOf(state.level), off = lvl * 9;
    model.blocks.forEach(function (b, bi) {
      if (b.level !== state.level) return;
      var d0 = (lvl === 0 ? 0 : 24) + off, d1 = d0 + (lvl === 0 ? 22 : 12), pts = [], n = Math.max(2, Math.ceil((b.pb - b.pa) * 24)), i, q;
      for (i = 0; i <= n; i++) { q = ring.point(b.pa + (b.pb - b.pa) * i / n, d0); pts.push((q.x * sca).toFixed(1) + "," + (q.z * sca).toFixed(1)); }
      for (i = n; i >= 0; i--) { q = ring.point(b.pa + (b.pb - b.pa) * i / n, d1); pts.push((q.x * sca).toFixed(1) + "," + (q.z * sca).toFixed(1)); }
      var c = ring.point((b.pa + b.pb) / 2, (d0 + d1) / 2), cls = "blk" + (sc.isClosed(b) ? " closed" : b.standing ? " terr" : "") + (state.block === bi ? " sel" : "");
      out.push('<polygon class="' + cls + '" data-b="' + bi + '" fill="#3d7a5a" points="' + pts.join(" ") + '"><title>' + esc(b.label + " · " + b.stand) + "</title></polygon>");
      out.push('<text x="' + (c.x * sca).toFixed(1) + '" y="' + (c.z * sca).toFixed(1) + '">' + esc(b.official ? b.id : b.zoneOf.split(" ")[0]) + "</text>");
    });
    $("map").innerHTML = out.join("");
    $("map").querySelectorAll(".blk").forEach(function (p) { p.addEventListener("click", function () { selectBlock(+p.dataset.b); }); });
  }
  function fillBlockSel() {
    var html = '<option value="">Choose a section…</option>';
    model.blocks.forEach(function (b, bi) { if (b.level === state.level) html += '<option value="' + bi + '"' + (state.block === bi ? " selected" : "") + ">" + esc(b.official ? b.label + " · " + b.stand : b.label) + (sc.isClosed(b) ? " (behind stage)" : "") + "</option>"; });
    $("blockSel").innerHTML = html;
  }
  $("blockSel").addEventListener("change", function () { if (this.value !== "") selectBlock(+this.value); });
  function selectBlock(bi) {
    state.block = bi; var b = model.blocks[bi]; renderMap(); fillBlockSel();
    $("rowWord").textContent = b.standing ? "Terrace row" : "Row"; $("seatWord").textContent = b.standing ? "Spot" : "Seat";
    $("rowSel").innerHTML = b.rowInfo.map(function (r, i) { return '<option value="' + i + '">' + r.label + "</option>"; }).join("");
    fillSeatSel();
    $("blockInfo").innerHTML = '<div class="small">' + esc(b.stand) + " · " + esc(b.levelName) + " · " + b.rows + " rows · " + b.seatCount.toLocaleString() + (b.standing ? " standing spots" : " seats") + " modelled</div>" +
      (b.official ? "" : '<div class="warnbox">This is <b>zone ' + esc(b.zoneOf) + "</b> of the " + esc(b.stand) + " — an app division, not an official section number. " + esc(S.numberingNote) + "</div>") +
      (sc.isClosed(b) ? '<div class="warnbox">Behind the stage — normally not sold for concerts with the stage at this end.</div>' : "");
  }
  function fillSeatSel() {
    var b = model.blocks[state.block], r = b.rowInfo[+$("rowSel").value || 0];
    $("seatSel").innerHTML = Array.from({ length: r.count }, function (_, i) { return '<option value="' + i + '">' + (i + 1) + "</option>"; }).join("");
  }
  $("rowSel").addEventListener("change", fillSeatSel);
  $("goSeat").addEventListener("click", function () { if (state.block == null) { flash("Choose a section first"); return; } var b = model.blocks[state.block], r = b.rowInfo[+$("rowSel").value]; goToSeat(r.start + (+$("seatSel").value)); });

  function goToSeat(idx) {
    var s = model.seats[idx]; if (!s) return; invalidate();
    state.seatIdx = idx; A.lastSeat = s;
    state.eye.set(s.x, s.y + (s.standing || state.standing ? 1.6 : 1.15), s.z);
    var d = sc.stageLook.clone().sub(state.eye); state.lookYaw = Math.atan2(d.x, d.z); state.lookPitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); state.fov = 55;
    sc.seatHighlight.position.set(s.x, s.y + 0.6, s.z); sc.seatHighlight.visible = true;
    sc.updateNearPeople(idx, state.density, state.phones);
    if (state.mode === "overview") setMode("seat");
    if (state.block !== s.blockIdx || state.level !== s.level) { state.level = s.level; renderLevelTabs(); selectBlock(s.blockIdx); }
    var b = model.blocks[s.blockIdx]; $("rowSel").value = b.rowLabels.indexOf(s.row); fillSeatSel(); $("seatSel").value = s.seat - 1;
    renderSeatInfo(); renderPhotos();
  }
  function renderSeatInfo() {
    var s = model.seats[state.seatIdx]; if (!s) return; var b = model.blocks[s.blockIdx];
    var front = sc.stageFront, dist = state.eye.distanceTo(front), dz = front.clone().sub(state.eye);
    var ang = Math.abs(Math.atan2(dz.x, Math.abs(dz.z)) * 180 / Math.PI), elev = Math.atan2(state.eye.y - front.y, Math.hypot(dz.x, dz.z)) * 180 / Math.PI;
    var vis = sc.visibilityFrom(state.eye, 160); A.lastVisibility = vis;
    var where = b.official ? SeatMap.seatLabel(state.seatIdx) : b.stand + (b.standing ? " · terrace row " + s.row + " · spot " + s.seat : " · zone " + b.zoneOf + " · Row " + s.row + " · Seat " + s.seat);
    var px = Math.max(1, Math.round(1.8 / dist * 1600 / (2 * Math.atan(17.3 / 24)))), visPct = vis ? Math.round(vis.visible * 100) : null;
    $("seatInfo").innerHTML = '<div class="hero"><div class="eyebrow">Your seat</div><div class="where">' + esc(where) + (b.official ? "" : ' <span class="badge warn">app zone</span>') + "</div>" +
      '<div class="stats"><div class="stat"><b>' + dist.toFixed(0) + ' m</b><span>' + (isSport(state.event) ? "to the centre of the pitch" : "to the stage") + '</span></div>' +
      '<div class="stat"><b>' + ang.toFixed(0) + '°</b><span>off-centre, looking ' + (elev >= 0 ? "down" : "up") + " " + Math.abs(elev).toFixed(0) + '°</span></div>' +
      '<div class="stat ' + (visPct === null ? "" : visPct >= 95 ? "good" : "warn") + '"><b>' + (visPct === null ? px + " px" : visPct + "%") + '</b><span>' + (visPct === null ? "performer in a 1× photo" : "of the show in view") + "</span></div></div>" +
      '<div class="btns"><button type="button" class="primary" data-go="seat">See my view</button><button type="button" data-go="phone">Take a photo</button><button type="button" id="cmpAdd" title="Add this seat to the comparison">+ Compare</button></div>' +
      '<details><summary>Details</summary><table class="info"><tr><td>Performer size</td><td>' + (1.8 / dist * 180 / Math.PI).toFixed(2) + "° tall · about " + px + " px in a 1600 px iPhone photo at 1×</td></tr>" +
      (vis && vis.visible < 1 ? "<tr><td>Set piece</td><td>Hides the performer " + Math.round((1 - vis.visible) * 100) + "% of the walk</td></tr>" : "") +
      "<tr><td>Accuracy</td><td>Stand heights, rake and row depths are estimates (no published drawings).</td></tr></table></details></div>";
    $("seatInfo").querySelectorAll("[data-go]").forEach(function (bt) { bt.addEventListener("click", function () { setMode(bt.dataset.go); }); });
    $("cmpAdd").addEventListener("click", function () { A.compareAdd(); });
  }

  // ---------- compare seats (up to 3, kept per venue in this browser) ----------
  function cmpKey() { return "cmp:" + S.id; }
  function cmpLoad() { try { var a = JSON.parse(store(cmpKey()) || "[]"); return Array.isArray(a) ? a.filter(function (x) { return x && typeof x.b === "string" && typeof x.r === "string" && x.n > 0; }).slice(0, 3) : []; } catch (e) { return []; } }
  function cmpSave(a) { store(cmpKey(), JSON.stringify(a.slice(0, 3))); }
  function seatIndexOf(c) {
    var bi = -1; model.blocks.forEach(function (b, i) { if (bi < 0 && String(b.id) === c.b) bi = i; }); if (bi < 0) return -1;
    var b = model.blocks[bi], ri = b.rowLabels.indexOf(c.r); if (ri < 0 || c.n > b.rowInfo[ri].count) return -1; return b.rowInfo[ri].start + c.n - 1;
  }
  function seatMetrics(idx) {
    var s = model.seats[idx], eye = new T.Vector3(s.x, s.y + (s.standing || state.standing ? 1.6 : 1.15), s.z), f = sc.stageFront, dz = f.clone().sub(eye);
    var vis = sc.visibilityFrom(eye, 60);
    return { d: eye.distanceTo(f), ang: Math.abs(Math.atan2(dz.x, Math.abs(dz.z)) * 180 / Math.PI), elev: Math.atan2(eye.y - f.y, Math.hypot(dz.x, dz.z)) * 180 / Math.PI, vis: vis ? vis.visible : null, eye: eye };
  }
  var thumbCache = {};
  function seatThumb(idx) { // small render of the real view from that seat (same scene, same crowd)
    var key = S.id + ":" + (state.event && state.event.id) + ":" + idx + ":" + state.density + ":" + state.standing; if (thumbCache[key]) return thumbCache[key];
    var m = seatMetrics(idx), cam = new T.PerspectiveCamera(50, 4 / 3, 0.1, 2000), W = 320, H = 240;
    cam.position.copy(m.eye); cam.lookAt(sc.stageLook); cam.updateMatrixWorld();
    sc.updateNearPeople(idx, state.density, state.phones);
    var t = new T.WebGLRenderTarget(W, H); setCrowdScale(cam, H); renderer.render(sc.scene, cam, t, true);
    var px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(t, 0, 0, W, H, px); t.dispose(); renderer.setRenderTarget(null);
    if (state.seatIdx >= 0) sc.updateNearPeople(state.seatIdx, state.density, state.phones);
    var c = document.createElement("canvas"); c.width = W; c.height = H; var x = c.getContext("2d"), img = x.createImageData(W, H);
    for (var y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    x.putImageData(img, 0, 0); invalidate(); return (thumbCache[key] = c.toDataURL("image/jpeg", 0.8));
  }
  A.compareAdd = function () {
    var s = model.seats[state.seatIdx]; if (!s) return false; var b = model.blocks[s.blockIdx], c = { b: String(b.id), r: s.row, n: s.seat }, a = cmpLoad();
    if (a.some(function (x) { return x.b === c.b && x.r === c.r && x.n === c.n; })) { flash("Already in your comparison"); return false; }
    if (a.length >= 3) a.shift(); a.push(c); cmpSave(a); renderCompare(); flash("Added to compare (" + a.length + "/3)"); return true;
  };
  A.compareList = cmpLoad;
  function renderCompare() {
    var box = $("compare"), list = cmpLoad().map(function (c) { return { c: c, i: seatIndexOf(c) }; }).filter(function (x) { return x.i >= 0; });
    if (!list.length) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    var ms = list.map(function (x) { return seatMetrics(x.i); }), best = { d: Math.min.apply(null, ms.map(function (m) { return m.d; })), ang: Math.min.apply(null, ms.map(function (m) { return m.ang; })) };
    var sport = isSport(state.event);
    box.innerHTML = "<div class='cmphead'><b>Compare seats</b><span class='muted small'>" + list.length + "/3</span><button type='button' class='linkbtn' id='cmpClear'>Clear</button></div><div class='cmpgrid'>" +
      list.map(function (x, k) {
        var m = ms[k];
        return "<div class='cmpcard'><img alt='View from " + esc(SeatMap.seatLabel(x.i)) + "' src='" + seatThumb(x.i) + "'><div class='cmpname'>" + esc(SeatMap.seatLabel(x.i)) + "</div>" +
          "<div class='cmpstats'><span" + (m.d === best.d ? " class='win'" : "") + "><b>" + m.d.toFixed(0) + " m</b>" + (sport ? "to pitch centre" : "to stage") + "</span><span" + (m.ang === best.ang ? " class='win'" : "") + "><b>" + m.ang.toFixed(0) + "°</b>off-centre</span>" +
          (m.vis != null ? "<span" + (m.vis >= 0.95 ? " class='win'" : "") + "><b>" + Math.round(m.vis * 100) + "%</b>show in view</span>" : "<span><b>" + Math.abs(m.elev).toFixed(0) + "°</b>looking " + (m.elev >= 0 ? "down" : "up") + "</span>") + "</div>" +
          "<div class='cmpbtns'><button type='button' data-go='" + x.i + "'>View</button><button type='button' class='iconbtn' data-rm='" + k + "' aria-label='Remove from compare'>×</button></div></div>";
      }).join("") + "</div><p class='small muted'>Lime = best of these. Views are rendered from each seat with the current crowd settings.</p>";
    $("cmpClear").addEventListener("click", function () { cmpSave([]); renderCompare(); });
    box.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { var i = +b.dataset.go; SeatMap.zoomToBlock(model.seats[i].blockIdx); SeatMap.selectSeat(i); setMode("seat"); }); });
    box.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { var a = cmpLoad(); a.splice(+b.dataset.rm, 1); cmpSave(a); renderCompare(); }); });
  }
  A.renderCompare = renderCompare;

  // ---------- photos ----------
  function commonsSrc(file) { return "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(file) + "?width=960"; }
  function photoFigure(p, label) {
    var credit = p.creditFormat ? '<a href="' + esc(safeUrl(p.licenceUrl)) + '" target="_blank" rel="noopener">' + esc(p.creditFormat) + "</a>" + (p.authorUrl ? ' · <a href="' + esc(safeUrl(p.authorUrl)) + '" target="_blank" rel="noopener">' + esc(p.authorUrl.replace(/^https?:\/\//, "")) + "</a>" : "")
      : "Photo: " + esc(p.author) + ' · <a href="' + esc(safeUrl(p.licenceUrl)) + '" target="_blank" rel="noopener">' + esc(p.licence) + "</a>";
    return '<figure class="photo"><img loading="lazy" alt="' + esc(p.caption) + '" src="' + commonsSrc(p.file) + '" data-fallback="1">' +
      "<figcaption>" + (label ? "<b>" + label + "</b><br>" : "") + esc(p.caption) + "<br>" + credit + ' · <a href="' + esc(safeUrl(p.page)) + '" target="_blank" rel="noopener">source (Wikimedia Commons)</a> · unmodified</figcaption></figure>';
  }
  function renderPhotos() {
    var s = A.lastSeat, b = s ? model.blocks[s.blockIdx] : null, mine = PHOTOS.filter(function (p) { return p.stadium === S.id; }), html = [], used = [];
    if (b) {
      var exact = mine.filter(function (p) { return p.blocks && p.blocks.indexOf(b.id) >= 0; });
      var stand = mine.filter(function (p) { return p.stand && b.stand.indexOf(p.stand) === 0 && exact.indexOf(p) < 0; });
      if (exact.length) exact.forEach(function (p) { html.push(photoFigure(p, "Real view from this exact block")); used.push(p); });
      else html.push('<div class="warnbox">No openly-licensed photo from your exact spot was found.' + (stand.length ? " Below: real photos from the same stand." : "") + "</div>");
      stand.forEach(function (p) { html.push(photoFigure(p, "Same stand (" + p.stand + ") — not your exact seat")); used.push(p); });
    }
    html.push("<h3>" + esc(S.name) + " — real photos</h3>");
    mine.filter(function (p) { return used.indexOf(p) < 0; }).forEach(function (p) { html.push(photoFigure(p, p.concert ? "Real concert photo" : "")); });
    html.push('<p class="small">More real seat views (copyrighted fan photos — opened on their site, not copied here): <a href="' + esc(safeUrl(SOURCES.avfms.url)) + '" target="_blank" rel="noopener">A View From My Seat ↗</a></p>');
    $("photos").innerHTML = html.join("");
  }

  // Broken photo -> friendly note. One delegated listener (capture phase: error events don't bubble), no inline handlers.
  document.addEventListener("error", function (e) {
    var t = e.target; if (t && t.tagName === "IMG" && t.dataset && t.dataset.fallback) { var d = document.createElement("div"); d.className = "fail"; d.textContent = "Image could not load here. Open it via the source link below."; t.replaceWith(d); }
  }, true);
  // ---------- sources ----------
  function srcLink(k) { var s = SOURCES[k]; return s ? '<a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>" : k === "calc" ? "calculated" : "⚠️ no published source"; }
  function renderSources() {
    var sum = StadiumGeo.summary(model), rows = [
      ["Total capacity", S.capacity.value.toLocaleString(), S.capacity.src, S.capacity.note],
      ["Seated (target → modelled)", S.seatedTarget.value.toLocaleString() + " → " + sum.seated.toLocaleString(), S.seatedTarget.src, S.seatedTarget.note],
      S.standingTarget ? ["Terraces (target → modelled)", S.standingTarget.value.toLocaleString() + " → " + sum.standing.toLocaleString(), S.standingTarget.src, S.standingTarget.note] : null,
      ["Field size", S.field.length + " × " + S.field.width + " m", S.field.src, S.field.note],
      ["Stage end", S.stage.endName[S.stage.defaultEnd], S.stage.src, S.stage.note],
      S.concertCapacity ? ["Concert capacity", S.concertCapacity.value.toLocaleString(), S.concertCapacity.src, S.concertCapacity.note] : null
    ].filter(Boolean);
    $("sources").innerHTML = "<h3>" + esc(S.name) + ": facts and where they come from</h3><table class='info'><tr><th>Fact</th><th>Value</th><th>Source</th></tr>" +
      rows.map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + srcLink(r[2]) + (r[3] ? "<br><span class='muted'>" + esc(r[3]) + "</span>" : "") + "</td></tr>"; }).join("") + "</table>" +
      "<h3>What is real vs estimated</h3><ul class='plain small'>" +
      "<li>✅ Real: stadium names, stands, tiers, capacities, field size" + (S.field.src === "placeholder" ? " (except field ⚠️)" : "") + ", every concert and date (official pages), every photo.</li>" +
      "<li>" + (S.numbering === "real-thirdparty" ? "⚠️ Block numbers from third-party maps (not official)." : "⚠️ Sections: no readable official list exists — app zones are used and labelled.") + " " + esc(S.numberingNote) + "</li>" +
      "<li>⚠️ Estimated: stand heights, rake, row depth, roof shape, seats per row (scaled so totals match the official capacity).</li>" +
      "<li>⚠️ Stage designs are generic (no real tour design is published for reuse); the golden statue is the example from the brief.</li>" +
      "<li>⚠️ The crowd and performer are simulated figures, not real people.</li>" +
      "<li>Phone view uses Apple's published iPhone 17 Pro focal lengths.</li></ul>" +
      "<details class='bynum'><summary>Live data (Ticketmaster)</summary><p class='small'>In the Events list, tap <b>Go live</b> and paste your free Ticketmaster Discovery API key (developer.ticketmaster.com). The app then loads every event at all six venues straight from Ticketmaster and refreshes once a day. If your browser blocks that, run <code>python tools\\tm_proxy.py</code> and open <code>http://localhost:8001/index.html?tm=1</code>. The free API has no per-seat availability.</p></details>" +
      "<h3>Free assets used</h3><ul class='plain small'><li>Crowd people: " + esc(People.source.bodies) + "; heights from " + esc(People.source.stature) + "</li><li>three.js r97: MIT</li><li>Photos: Wikimedia Commons (licences listed below)</li></ul><h3>All sources</h3><table class='info'>" + Object.keys(SOURCES).map(function (k) { var s = SOURCES[k]; return "<tr><td>" + (s.url ? '<a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>" : esc(s.title)) + "</td><td><span class='badge " + (s.status === "official" || s.status === "own-work" ? "ok" : "warn") + "'>" + s.status + "</span></td></tr>"; }).join("") +
      PHOTOS.map(function (p) { return "<tr><td><a href='" + esc(safeUrl(p.page)) + "' target='_blank' rel='noopener'>Photo: " + esc(p.caption) + "</a> — " + esc(p.author) + "</td><td>" + esc(p.licence) + "</td></tr>"; }).join("") + "</table>";
  }

  // ---------- tabs & helpers ----------
  function showTab(t) {
    document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
    document.querySelectorAll(".tab").forEach(function (d) { d.classList.toggle("on", d.id === "tab-" + t); });
    if (t === "sources") renderSources();
  }
  document.querySelectorAll("#tabs button").forEach(function (b) { b.setAttribute("role", "tab"); b.addEventListener("click", function () { showTab(b.dataset.tab); }); });
  // Keyboard: 1-4 switch view, C = camera shutter (in camera), ignored while typing.
  document.addEventListener("keydown", function (e) {
    var t = e.target, typing = t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable);
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    var modes = { "1": "map", "2": "overview", "3": "seat", "4": "phone" };
    if (modes[e.key]) { setMode(modes[e.key]); e.preventDefault(); }
    else if ((e.key === "c" || e.key === " ") && state.mode === "phone") { $("shutter").click(); e.preventDefault(); }
  });
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtDate(d, short) { if (!d) return "date unknown"; var x = new Date(String(d).slice(0, 10) + "T12:00:00"); return isNaN(x) ? "date unknown" : x.toLocaleDateString(undefined, short ? { day: "numeric", month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }

  var openSeq = 0;
  A.openEvent = function (sid, evId) {
    var my = ++openSeq; A.wantEvent = evId; function go() { if (my === openSeq && S && S.id === sid) selectEvent(evId); }
    if (!S || S.id !== sid || loadSeq && !A.ready) loadStadium(sid).then(go); else go();
  };
  function renderHeader() {
    var e = state.event; $("evTitle").textContent = e ? e.name + (e.tour ? " — " + e.tour : "") : S.name;
    $("evType").textContent = e ? EVENT_TYPES[e.type || "concert"] + (e.live ? " · live" : "") : ""; $("evType").className = "evtype t-" + (e ? e.type || "concert" : "");
    $("evMeta").innerHTML = e ? esc(fmtDate(e.date)) + " · <a href='#' id='evVenue'>" + esc(S.name + ", " + S.city) + "</a>" + (e.past ? " · <b>past</b>" : "") + " · <a href='" + esc(safeUrl(e.url)) + "' target='_blank' rel='noopener'>source ↗</a>" : "";
    var v = $("evVenue"); if (v) v.addEventListener("click", function (ev) { ev.preventDefault(); showTab("sources"); });
  }
  function humanStatus() {
    $("humanStat").textContent = " · life-size people";
    $("humanNote").innerHTML = "People near you are life-size: heights from NCD-RisC Irish averages (men 178.9 cm, women 165.1 cm, ±7 cm) and shoulder widths from CDC NHANES (41.1 / 36.7 cm). Built in the app, no download. Further away: lightweight dots.";
  }
  A.humanStatus = humanStatus;
  function renderModels() {
    var L = Models.list;
    $("modelList").innerHTML = L.length ? L.map(function (m) { return '<div class="m"><span>' + esc(m.name) + "</span><span class='muted'>" + m.tris.toLocaleString() + " tris" + (m.pose ? " · pose: " + esc(m.pose) : "") + "</span></div>"; }).join("") + '<button type="button" id="modelClear" class="small" style="margin-top:8px">Remove all</button>'
      : '<span class="muted">Using built-in people. Free CC0 humans: <a href="https://quaternius.com/packs/ultimatemodularwomen.html" target="_blank" rel="noopener noreferrer">Quaternius Ultimate Modular Women</a> / Men (glTF), or the <a href="https://eclair-assets.itch.io/background-posed-humans-glb-pack-28-free-cc0-3d-models" target="_blank" rel="noopener noreferrer">Background Posed Humans GLB pack</a>.</span>';
    var c = $("modelClear"); if (c) c.addEventListener("click", function () { Models.clear().then(function () { renderModels(); refreshPeople(); }); });
  }
  function refreshPeople() { if (sc && state.seatIdx >= 0) sc.updateNearPeople(state.seatIdx, state.density, state.phones); }
  $("modelFile").addEventListener("change", function () {
    var files = Array.prototype.slice.call(this.files || []); this.value = "";
    $("modelList").innerHTML = '<span class="muted">Loading ' + files.length + " file(s)…</span>";
    files.reduce(function (p, f) { return p.then(function () { return Models.add(f).catch(function (e) { flash(f.name + ": " + e.message); }); }); }, Promise.resolve())
      .then(function () { renderModels(); refreshPeople(); });
  });
  $("modelFlip").addEventListener("change", function () { Models.flip = this.checked; store("modelFlip", this.checked ? "1" : ""); refreshPeople(); });
  Models.flip = store("modelFlip") === "1"; $("modelFlip").checked = Models.flip;
  Models.restore().then(function () { renderModels(); refreshPeople(); });
  People.loadReal().then(function (ok) { // swap the built-in bodies for the real ones once they are unpacked
    if (!ok || !sc) return; refreshPeople(); if (sc.match) sc.match.build();
    if (sc.performerModel) { sc.performer.remove(sc.performerModel); sc.performerModel = null; } // rebuilt on the next frame
  });
  A.updateHash = function () {
    var s = model.seats[state.seatIdx]; if (!s) return; var b = model.blocks[s.blockIdx];
    var h = "#stadium=" + S.id + (state.event ? "&ev=" + encodeURIComponent(state.event.id) : "") + "&seat=" + encodeURIComponent(b.id + "~" + s.row + "~" + s.seat);
    try { history.replaceState(null, "", h); } catch (e) { location.hash = h; }
  };
  function readHash() {
    var out = Object.create(null); String(location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) { var p = kv.split("="); if (p.length === 2) { try { out[p[0]] = decodeURIComponent(p[1]).slice(0, 120); } catch (e) {} } });
    return out;
  }
  function applyDeepLink(h) {
    if (h.ev && state.events.some(function (e) { return e.id === h.ev; })) selectEvent(h.ev);
    if (!h.seat) return; var p = h.seat.split("~"); if (p.length !== 3) return;
    var bi = -1; model.blocks.forEach(function (b, i) { if (bi < 0 && b.id === p[0]) bi = i; }); if (bi < 0) return;
    var b = model.blocks[bi], ri = b.rowLabels.indexOf(p[1]), n = parseInt(p[2], 10); if (ri < 0 || !(n >= 1 && n <= b.rowInfo[ri].count)) return;
    SeatMap.zoomToBlock(bi); SeatMap.selectSeat(b.rowInfo[ri].start + n - 1);
  }
  A.goToSeat = goToSeat; A.setMode = setMode; A.setDensity = setDensity; A.showTab = showTab; A.selectBlock = selectBlock;

  // ---------- boot ----------
  setTimeout(function () { try { var w = document.createElement("canvas").getContext("2d", { willReadFrequently: true }); w.font = "7px sans-serif"; w.fillText("A", 0, 7); } catch (e) {} }, 300);
  var deep = readHash(), startId = deep.stadium || store("stadium") || "aviva";
  A.framed = (function () { try { return window.top !== window.self; } catch (e) { return true; } })();
  if (A.framed) document.body.classList.add("framed");
  SeatMap.init(A); Sidebar.init(A);
  $("infoMore").addEventListener("click", function (e) { e.preventDefault(); showTab("sources"); });
  loadStadium(startId).then(function () {
    renderCompare();
    requestAnimationFrame(loop);
    try { applyDeepLink(deep); } catch (e) {}
    window.addEventListener("hashchange", function () {
      var h = readHash(); if (!h.stadium) return;
      var go = function () { try { applyDeepLink(h); } catch (e) {} };
      if (!S || h.stadium !== S.id) { if (STADIUMS.some(function (x) { return x.id === h.stadium; })) loadStadium(h.stadium).then(function (ok) { if (ok) go(); }); } else go();
    });
    TM.check().then(function () { TM.render(A); });
    TM.onUpdate = function () { Sidebar.render(); if (S) { var cur = state.event && state.event.id; loadEvents(); if (cur) { A.wantEvent = cur; renderEventSel(true); } } };
    TM.autoRefresh();
    humanStatus();
  });
})();
