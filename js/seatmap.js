/* 2D interactive seat map, modelled on Ticketmaster's interactive seat map:
 *  - sections are BLUE when they match your filters and GREY when they don't (Ticketmaster's own colour rule);
 *  - progressive disclosure, driven by what you picked (not by zoom): Stadium (sections only) -> Section (isolated,
 *    rows as bars) -> Row (that row's seat dots) -> Seat (selected; then My view / Camera);
 *  - results list on the right with a stadium thumbnail + pin per card; level tabs, a section bar with row/seat pickers.
 * NOT shown: prices / availability — Ticketmaster does not publish them in any reusable form (see Sources). Nothing is invented.
 * Seat dot positions come from js/geometry.js (layout calibrated to official capacity; rows/seats per block are estimates ⚠️). */
(function () {
  var SM = window.SeatMap = {};
  var cv, ctx, wrap, tip, A, M, S;
  var view = { s: 2, tx: 0, ty: 0 }, dpr = 1, hover = -1, sel = -1, polys = [], stats = [], thumbURL = null;
  var F = SM.filters = { level: "all", maxDist: 999, hideClosed: true, sort: "best" };
  var goal = null, anim = 0; SM.focusBlock = -1; SM.focusRow = -1; SM.hoverRow = -1;
  var ROW_ZOOM = 22; // px per metre when a row is open: seats ~11 px apart
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  SM.secName = function (b) { return b.official ? (S.id === "aviva" ? "BLK" + b.id : (S.blockPrefix || "Section ") + b.id) : b.stand + " · zone " + b.zoneOf.split(" ")[0]; };

  SM.init = function (app) {
    A = app; wrap = $("mapWrap"); cv = $("map2d"); ctx = cv.getContext("2d"); tip = $("mapTip");
    window.addEventListener("resize", function () { if (SM.active) { SM.resize(); SM.draw(); } });
    if (window.ResizeObserver) new ResizeObserver(function () { if (SM.active) { SM.resize(); SM.draw(); } }).observe($("mapArea")); // toolbar rows come and go
    var ptrs = {}, down = null, pinch = null;
    cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY, n: Object.keys(ptrs).length }; });
    cv.addEventListener("pointermove", function (e) {
      var r = cv.getBoundingClientRect(), p = ptrs[e.pointerId], ids = Object.keys(ptrs);
      if (ids.length === 2 && p) { p.x = e.clientX; p.y = e.clientY; var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch); pinch = d; return; }
      if (p) { stopAnim(); view.tx += e.clientX - p.x; view.ty += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; SM.draw(); return; }
      var h = pick(e.clientX - r.left, e.clientY - r.top);
      if (h.seat !== hover || h.block !== SM.hoverBlock || h.row !== SM.hoverRow) { hover = h.seat; SM.hoverBlock = h.block; SM.hoverRow = h.row; SM.draw(); }
      showTip(h, e.clientX - r.left, e.clientY - r.top);
    });
    cv.addEventListener("pointerup", function (e) {
      var r = cv.getBoundingClientRect();
      if (down && down.n === 1 && Object.keys(ptrs).length === 1 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
        var h = pick(e.clientX - r.left, e.clientY - r.top);
        if (h.seat >= 0) SM.selectSeat(h.seat); else if (h.row >= 0) SM.zoomToRow(h.block, h.row); else if (h.block >= 0 && h.block !== SM.focusBlock) SM.zoomToBlock(h.block);
      }
      delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null;
    });
    cv.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; pinch = null; });
    cv.addEventListener("pointerleave", function () { tip.hidden = true; if (hover !== -1 || SM.hoverBlock !== -1 || SM.hoverRow !== -1) { hover = -1; SM.hoverBlock = -1; SM.hoverRow = -1; SM.draw(); } });
    cv.addEventListener("wheel", function (e) { e.preventDefault(); var r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 1 / 1.2 : 1.2); }, { passive: false });
    $("mapZoomIn").addEventListener("click", function () { zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1.5); });
    $("mapZoomOut").addEventListener("click", function () { zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1 / 1.5); });
    $("mapReset").addEventListener("click", function () { SM.back(); });
    $("mapFiltersBtn").addEventListener("click", function () { var f = $("mapFilters"), open = f.hidden; f.hidden = !open; this.setAttribute("aria-expanded", open); SM.resize(); SM.draw(); });
    $("seatSearch").addEventListener("keydown", function (e) { if (e.key === "Enter") SM.search(this.value); });
    $("seatSearchGo").addEventListener("click", function () { SM.search($("seatSearch").value); });
    $("fDist").addEventListener("input", function () { F.maxDist = +this.value >= 200 ? 999 : +this.value; $("fDistLbl").textContent = F.maxDist >= 999 ? "Any distance" : "≤ " + F.maxDist + " m"; SM.refresh(); });
    $("fSort").addEventListener("change", function () { F.sort = this.value; SM.renderList(); });
    $("fClosed").addEventListener("change", function () { F.hideClosed = this.checked; SM.refresh(); });
    $("surprise").addEventListener("click", function () { SM.surprise(); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (document.body.classList.contains("sideOpen")) { document.body.classList.remove("sideOpen"); return; }
      if (SM.active && !$("mapSel").hidden) SM.clearSel(); else if (SM.active && SM.focusBlock >= 0) SM.back(); // one level up
    });
  };
  SM.setStadium = function () {
    M = A.model; S = A.S; sel = -1; hover = -1; SM.hoverBlock = -1; thumbURL = null;
    var ring = M.ring; polys = M.blocks.map(function (b) {
      var n = Math.max(2, Math.ceil((b.pb - b.pa) * 24)), pts = [], i, q;
      for (i = 0; i <= n; i++) { q = ring.point(b.pa + (b.pb - b.pa) * i / n, b.dFront); pts.push([q.x, q.z]); }
      for (i = n; i >= 0; i--) { q = ring.point(b.pa + (b.pb - b.pa) * i / n, b.dBack); pts.push([q.x, q.z]); }
      var c = ring.point((b.pa + b.pb) / 2, (b.dFront + b.dBack) / 2); return { pts: pts, cx: c.x, cz: c.z };
    });
    var tabs = [["all", "All"]].concat(S.levels.map(function (L) { return [L.id, L.name]; }));
    if (M.blocks.some(function (b) { return b.standing; })) tabs.push(["standing", "Standing"]);
    $("mapLevels").innerHTML = tabs.map(function (t) { return '<button type="button" data-l="' + esc(t[0]) + '"' + (t[0] === "all" ? ' class="on"' : "") + ">" + esc(t[1]) + "</button>"; }).join("");
    $("mapLevels").querySelectorAll("button").forEach(function (bt) { bt.addEventListener("click", function () {
      F.level = bt.dataset.l; $("mapLevels").querySelectorAll("button").forEach(function (o) { o.classList.toggle("on", o === bt); }); SM.refresh();
    }); });
    F.level = "all"; $("mapSel").hidden = true; SM.focusBlock = -1; SM.focusRow = -1; rowGeo = {}; stackCache = {}; renderSecBar(); SM.computeStats(); SM.fitted = false; SM.coach("Tap a section to see its rows");
  };
  SM.computeStats = function () {
    if (!M || !A.sc || !A.sc.stageFront) return; var f = A.sc.stageFront, sg = A.sc.stageSign;
    stats = M.blocks.map(function (b) {
      var r = b.rowInfo[Math.floor(b.rows / 2)], s = M.seats[r.start + Math.floor(r.count / 2)];
      var dx = s.x - f.x, dz = s.z - f.z;
      var d = Math.hypot(dx, s.y + 1.2 - f.y, dz), ang = Math.abs(Math.atan2(dx, -sg * dz)) * 180 / Math.PI, elev = Math.atan2(s.y + 1.2 - f.y, Math.hypot(dx, dz)) * 180 / Math.PI;
      // View score (lower = better): distance, plus a penalty for side-on angles and for very flat or very steep sight-lines.
      var score = d * (1 + Math.pow(ang / 70, 2)) + Math.max(0, 8 - elev) * 0.8 + Math.max(0, elev - 35) * 1.5;
      return { d: d, ang: ang, elev: elev, score: score, closed: A.sc.isClosed(b) };
    });
    thumbURL = null;
  };
  function matches(bi) {
    var b = M.blocks[bi], st = stats[bi]; if (!st) return true;
    if (F.hideClosed && st.closed) return false;
    if (st.d > F.maxDist) return false;
    if (F.level === "standing") return b.standing;
    if (F.level !== "all" && (b.level !== F.level || b.standing)) return false;
    return true;
  }
  SM.matches = matches; SM._view = function () { return view; }; // tests
  SM.refresh = function () { SM.draw(); SM.renderList(); };
  SM.resize = function () { dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.max(1, cv.clientWidth * dpr); cv.height = Math.max(1, cv.clientHeight * dpr); };
  function extent() { var hx = 0, hz = 0; M.seats.forEach(function (s) { hx = Math.max(hx, Math.abs(s.x)); hz = Math.max(hz, Math.abs(s.z)); }); return [hx, hz]; }
  // The mode bar floats over the bottom of the map, so everything is framed in the area above it.
  function freeArea() { var h = cv.clientHeight, bottom = h - 86, sel = $("mapSel"); if (!sel.hidden) bottom = Math.min(bottom, sel.offsetTop - 8); return { w: cv.clientWidth, top: 8, bottom: Math.max(bottom, 120) }; }
  function stopAnim() { if (anim) cancelAnimationFrame(anim); anim = 0; goal = null; }
  function animateTo(g, ms) { // smooth zoom/pan so you can see where you are going
    var from = { s: view.s, tx: view.tx, ty: view.ty }, t0 = performance.now(); ms = ms || 320; goal = g; if (anim) cancelAnimationFrame(anim);
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 1;
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3), ls = Math.log(from.s) + (Math.log(g.s) - Math.log(from.s)) * e;
      view.s = Math.exp(ls); view.tx = from.tx + (g.tx - from.tx) * e; view.ty = from.ty + (g.ty - from.ty) * e; SM.draw();
      anim = k < 1 ? requestAnimationFrame(step) : 0; if (!anim) goal = null;
    })(t0);
  }
  function frame(x0, x1, z0, z1, pad, maxS, minS) {
    var a = freeArea(), s = Math.min(a.w / (x1 - x0 + pad), (a.bottom - a.top) / (z1 - z0 + pad)); s = Math.max(minS || 0.5, Math.min(maxS || 60, s));
    return { s: s, tx: a.w / 2 - (x0 + x1) / 2 * s, ty: (a.top + a.bottom) / 2 - (z0 + z1) / 2 * s };
  }
  SM.fit = function (animate) { var e = extent(), g = frame(-e[0], e[0], -e[1], e[1], 10); if (animate) animateTo(g); else { stopAnim(); view.s = g.s; view.tx = g.tx; view.ty = g.ty; SM.draw(); } };
  SM.back = function () { // one level up: Row -> Section -> Stadium
    if (SM.focusRow >= 0) { var bi = SM.focusBlock; SM.focusRow = -1; SM.zoomToBlock(bi, true); return; }
    SM.focusBlock = -1; renderSecBar(); SM.coach(sel >= 0 ? null : "Tap a section to see its rows"); SM.fit(true);
  };
  function zoomAt(px, py, f) { stopAnim(); var ns = Math.max(0.5, Math.min(60, view.s * f)); f = ns / view.s; view.tx = px - (px - view.tx) * f; view.ty = py - (py - view.ty) * f; view.s = ns; SM.draw(); }
  function blockBox(b) { var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (var i = b.seatStart; i < b.seatStart + b.seatCount; i++) { var s = M.seats[i]; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); } return [x0, x1, z0, z1]; }
  SM.zoomToBlock = function (bi, keepRow) {
    var bb = blockBox(M.blocks[bi]); if (SM.focusBlock !== bi || !keepRow) SM.focusRow = -1; SM.focusBlock = bi; renderSecBar();
    animateTo(frame(bb[0], bb[1], bb[2], bb[3], 6, 40)); // the whole section in view, whatever its size
    A.selectBlock(bi); SM.coach(sel >= 0 && M.seats[sel].blockIdx === bi ? null : "Tap a row, or choose a row above");
  };
  SM.zoomToRow = function (bi, ri) { // the row fills the width; its seats appear
    if (SM.focusBlock !== bi) { SM.focusBlock = bi; A.selectBlock(bi); } SM.focusRow = ri; renderSecBar();
    var r = M.blocks[bi].rowInfo[ri], x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (var i = r.start; i < r.start + r.count; i++) { var q = M.seats[i]; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    animateTo(frame(x0, x1, z0, z1, 4, 60, ROW_ZOOM)); SM.coach(sel >= 0 && M.seats[sel].blockIdx === bi && rowOf(sel) === ri ? null : "Tap a seat");
  };
  function rowOf(i) { var s = M.seats[i]; return M.blocks[s.blockIdx].rowLabels.indexOf(s.row); }
  // Row centrelines of a block (through its seats), built on demand.
  var rowGeo = {};
  function rowsOf(bi) {
    if (rowGeo[bi]) return rowGeo[bi];
    return (rowGeo[bi] = M.blocks[bi].rowInfo.map(function (r) { var pts = [], step = Math.max(1, Math.floor(r.count / 12));
      for (var i = r.start; i < r.start + r.count; i += step) pts.push([M.seats[i].x, M.seats[i].z]);
      var e = M.seats[r.start + r.count - 1]; pts.push([e.x, e.z]); return pts; }));
  }
  function segD2(px, pz, a, b) { var dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L)) : 0, x = a[0] + dx * t - px, z = a[1] + dz * t - pz; return x * x + z * z; }
  // Real stacked tiers: blocks of another level whose footprint overlaps this one in plan (an upper tier overhanging
  // a lower one). They are hidden while a section is isolated so their seats never sit on top of each other.
  var stackCache = {};
  function stackedWith(bi) {
    if (stackCache[bi]) return stackCache[bi]; var b = M.blocks[bi], out = [];
    M.blocks.forEach(function (o, oi) { if (oi === bi || o.level === b.level) return; var hit = false;
      for (var r = 0; r < o.rowInfo.length && !hit; r += 2) { var ri = o.rowInfo[r]; for (var i = ri.start; i < ri.start + ri.count && !hit; i += 3) if (inPoly(M.seats[i].x, M.seats[i].z, polys[bi].pts)) hit = true; }
      if (hit) out.push(oi); });
    return (stackCache[bi] = out);
  }
  SM.stackedWith = function (bi) { return stackedWith(bi); };
  // Section bar: where you are + row/seat pickers, so nobody has to hit a 4-pixel dot.
  function renderSecBar() {
    var bar = $("secBar"), bi = SM.focusBlock; wrap.classList.toggle("focus", !!M && bi >= 0); // inside a section the breadcrumb replaces levels/search
    if (!M || bi < 0) { bar.hidden = true; bar.innerHTML = ""; return; }
    var b = M.blocks[bi], cur = sel >= 0 && M.seats[sel].blockIdx === bi ? M.seats[sel] : null, ri = SM.focusRow >= 0 ? SM.focusRow : cur ? b.rowLabels.indexOf(cur.row) : -1;
    var stk = stackedWith(bi).map(function (oi) { return M.blocks[oi]; }), above = stk.filter(function (o) { return o.levelIdx > b.levelIdx; }), below = stk.filter(function (o) { return o.levelIdx < b.levelIdx; });
    var tier = below.length ? "Upper tier: overhangs " + below[0].levelName : above.length ? "Under the " + above[0].levelName + " overhang (rows at the back)" : "";
    bar.innerHTML = "<button type='button' class='back' id='secBack' aria-label='" + (SM.focusRow >= 0 ? "Back to " + esc(SM.secName(b)) : "Back to the whole venue") + "'>‹ " + (SM.focusRow >= 0 ? esc(SM.secName(b)) : "Stadium") + "</button><div class='nm'><b>" + esc(SM.secName(b)) + (SM.focusRow >= 0 ? " · " + (b.standing ? "Terrace row " : "Row ") + esc(b.rowLabels[SM.focusRow]) : "") + "</b><span>" + esc(b.stand + " · " + b.levelName) + (tier ? " · " + esc(tier) : "") + "</span></div>" +
      "<label>" + (b.standing ? "Terrace row" : "Row") + " <select id='secRow'><option value=''>–</option>" + b.rowLabels.map(function (l, i) { return "<option value='" + i + "'" + (i === ri ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
      "<label>" + (b.standing ? "Spot" : "Seat") + " <select id='secSeat'" + (ri < 0 ? " disabled" : "") + ">" + (ri < 0 ? "<option>–</option>" : Array.from({ length: b.rowInfo[ri].count }, function (_, i) { return "<option value='" + i + "'" + (cur && cur.seat === i + 1 ? " selected" : "") + ">" + (i + 1) + "</option>"; }).join("")) + "</select></label>";
    bar.hidden = false;
    $("secBack").addEventListener("click", SM.back);
    $("secRow").addEventListener("change", function () { if (this.value === "") return; SM.zoomToRow(bi, +this.value); });
    $("secSeat").addEventListener("change", function () { var r = b.rowInfo[+$("secRow").value]; if (r) SM.selectSeat(r.start + +this.value); });
  }
  function toS(x, z) { return [x * view.s + view.tx, z * view.s + view.ty]; }
  function inPoly(x, z, pts) { var c = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function hidden(bi) { var f = SM.focusBlock; return f >= 0 && bi !== f && stackedWith(f).indexOf(bi) >= 0; }
  // What is under the pointer at the current level: Stadium -> sections; Section -> its rows; Row -> that row's seats.
  function pick(px, py) {
    var wx = (px - view.tx) / view.s, wz = (py - view.ty) / view.s, block = -1, f = SM.focusBlock, bi;
    if (f >= 0 && inPoly(wx, wz, polys[f].pts)) block = f; // the isolated section wins over anything stacked on it
    else for (bi = polys.length - 1; bi >= 0; bi--) if (!hidden(bi) && inPoly(wx, wz, polys[bi].pts)) { block = bi; break; }
    var none = { block: block, row: -1, seat: -1 }; if (block < 0 || block !== f) return none;
    var b = M.blocks[block], tol = 14 / view.s; // ~14 px finger tolerance
    if (SM.focusRow >= 0) { var r = b.rowInfo[SM.focusRow], best = -1, bd = Math.max(tol, 0.35) * Math.max(tol, 0.35);
      for (var i = r.start; i < r.start + r.count; i++) { var s = M.seats[i], d = (s.x - wx) * (s.x - wx) + (s.z - wz) * (s.z - wz); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) return { block: block, row: SM.focusRow, seat: best }; }
    var rows = rowsOf(block), br = -1, brd = 1e9;
    rows.forEach(function (pts, ri) { for (var k = 1; k < pts.length; k++) { var d = segD2(wx, wz, pts[k - 1], pts[k]); if (d < brd) { brd = d; br = ri; } } });
    return { block: block, row: brd < Math.max(tol, 1.2) * Math.max(tol, 1.2) ? br : -1, seat: -1 };
  }
  var BLUE = "#4266D4", GREY = "#273246", TERR = "#3E5BA8", YELLOW = "#FFCF3F", NAVY = "#0E1522"; // = --c-map, --c-acc, --c-bg in css/app.css
  function colourFor(bi) { return !matches(bi) ? GREY : M.blocks[bi].standing ? TERR : BLUE; }
  function drawBase(c, s, tx, ty, opts) {
    var hw = S.field.width / 2, hl = S.field.length / 2;
    c.fillStyle = S.kind === "stadium" ? "#2E7D4A" : S.kind === "arena" ? "#262a35" : "#3a2418"; c.fillRect(-hw * s + tx, -hl * s + ty, S.field.width * s, S.field.length * s);
    if (S.kind === "stadium") c.strokeStyle = "rgba(255,255,255,.7)"; else c.strokeStyle = "rgba(255,255,255,0)"; c.lineWidth = 1; c.strokeRect(-hw * s + tx + 3, -hl * s + ty + 3, S.field.width * s - 6, S.field.length * s - 6);
    var pr = A.sc.preset;
    if (!pr && opts && opts.labels) { c.fillStyle = "rgba(255,255,255,.85)"; c.font = "bold " + Math.max(10, Math.min(20, s * 3)) + "px Segoe UI, Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(S.kind === "stadium" ? "PITCH" : "FLOOR", tx, ty); }
    if (pr) {
      var dw = Math.min(pr.deck.width, S.field.width - 12), zf = A.sc.stageZ(0), zb = A.sc.stageZ(-pr.deck.depth);
      c.fillStyle = "#111318"; c.fillRect(-dw / 2 * s + tx, Math.min(zf, zb) * s + ty, dw * s, Math.abs(zb - zf) * s);
      if (opts && opts.labels) { c.fillStyle = "#fff"; c.font = "bold " + Math.max(10, Math.min(20, s * 3)) + "px Segoe UI, Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("STAGE", tx, (zf + zb) / 2 * s + ty);
        c.fillStyle = "rgba(255,255,255,.9)"; c.font = Math.max(9, Math.min(14, s * 2)) + "px Segoe UI, Arial, sans-serif"; if (!S.noFloorCrowd) c.fillText(S.kind === "stadium" ? "Standing" : "Floor standing", tx, -A.sc.stageSign * hl * (S.kind === "stadium" ? 0.35 : 0.3) * s + ty); }
    }
  }
  // Labels every `n`th item, more when there is room: every one if items are >= 16 px apart, every 2nd at >= 8 px.
  function labelStep(px) { return px >= 16 ? 1 : px >= 8 ? 2 : px * 5 >= 16 ? 5 : 10; }
  var hatchPat = null;
  function hatch() { if (hatchPat) return hatchPat; var c = document.createElement("canvas"); c.width = c.height = 8; var x = c.getContext("2d"); x.strokeStyle = "rgba(255,255,255,.09)"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, 8); x.lineTo(8, 0); x.stroke(); return (hatchPat = ctx.createPattern(c, "repeat")); }
  function path(pts) { ctx.beginPath(); pts.forEach(function (pt, i) { var q = toS(pt[0], pt[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); }
  SM.draw = function () {
    if (!SM.active || !M) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = NAVY; ctx.fillRect(0, 0, cv.width, cv.height);
    drawBase(ctx, view.s, view.tx, view.ty, { labels: true });
    var f = SM.focusBlock, W = cv.clientWidth, H = cv.clientHeight, FONT = "'Barlow Semi Condensed', system-ui, sans-serif";
    polys.forEach(function (P, bi) {
      if (bi === f || hidden(bi)) return; // the isolated section is drawn last, on top; stacked tiers hidden
      path(P.pts); ctx.closePath(); ctx.globalAlpha = f >= 0 ? 0.22 : 1;
      ctx.fillStyle = bi === SM.hoverBlock && matches(bi) ? "#7D9AF0" : colourFor(bi); ctx.fill();
      if (!matches(bi)) { ctx.fillStyle = hatch(); ctx.fill(); } // filtered out: hatched, not just grey
      ctx.lineWidth = bi === SM.hoverBlock ? 2.5 : 1; ctx.strokeStyle = bi === SM.hoverBlock ? "#ffffff" : NAVY; ctx.stroke(); ctx.globalAlpha = 1;
    });
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (f < 0) polys.forEach(function (P, bi) { // a label only where it fits inside its section: no pile-ups
      var b = M.blocks[bi], s = toS(P.cx, P.cz), txt = String(b.official ? b.id : b.zoneOf.split(" ")[0]), fs = Math.max(9, Math.min(13, view.s * 2.2));
      ctx.font = "600 " + fs + "px " + FONT;
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; P.pts.forEach(function (pt) { var q = toS(pt[0], pt[1]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
      var tw = ctx.measureText(txt).width, w = x1 - x0, h = y1 - y0;
      if (!(w >= tw + 4 && h >= fs + 2) && !(h >= tw + 4 && w >= fs + 2) && bi !== SM.hoverBlock) return;
      ctx.fillStyle = matches(bi) ? "#fff" : "#5d6476"; ctx.fillText(txt, s[0], s[1]);
    });
    if (f < 0) return;
    // ---- isolated section: rows as bars ----
    var b = M.blocks[f], rows = rowsOf(f), fr = SM.focusRow;
    path(polys[f].pts); ctx.closePath(); ctx.fillStyle = "#151F31"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(125,154,240,.6)"; ctx.stroke();
    var rowPx = b.rowInfo.length > 1 ? Math.abs(b.rowInfo[1].d - b.rowInfo[0].d) * view.s : 20, bar = Math.max(2, Math.min(rowPx * 0.62, 14));
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    rows.forEach(function (pts, ri) {
      path(pts); ctx.lineWidth = ri === fr ? Math.max(bar, 6) : bar;
      ctx.strokeStyle = ri === fr ? "rgba(66,102,212,.35)" : ri === SM.hoverRow ? "rgba(125,154,240,.9)" : fr >= 0 ? "rgba(66,102,212,.2)" : matches(f) ? "rgba(66,102,212,.55)" : "rgba(107,120,145,.5)"; ctx.stroke();
    });
    var step = labelStep(rowPx); ctx.font = "600 11px " + FONT; ctx.fillStyle = "#aab0bf";
    b.rowInfo.forEach(function (r, ri) { // row labels just past the first seat, along the row
      if (ri !== fr && ri !== SM.hoverRow && (ri + 1) % step && ri !== 0) return;
      var s0 = M.seats[r.start], s1 = M.seats[r.start + r.count - 1], tx = s0.x - s1.x, tz = s0.z - s1.z, L = Math.hypot(tx, tz) || 1, off = 14 / view.s + 0.4;
      var q = toS(s0.x + tx / L * off, s0.z + tz / L * off); if (q[0] < 0 || q[1] < 0 || q[0] > W || q[1] > H) return;
      ctx.fillStyle = ri === fr || ri === SM.hoverRow ? "#ffffff" : "#aab0bf"; ctx.fillText(r.label, q[0], q[1]);
    });
    if (fr < 0) return;
    // ---- selected row: its seats ----
    var R = b.rowInfo[fr], seatPx = R.count > 1 ? Math.hypot(M.seats[R.start + 1].x - M.seats[R.start].x, M.seats[R.start + 1].z - M.seats[R.start].z) * view.s : 20;
    var rad = Math.max(2.5, Math.min(seatPx * 0.38, 9)), sstep = labelStep(seatPx), c = matches(f) ? (b.standing ? TERR : BLUE) : GREY;
    for (var i = R.start; i < R.start + R.count; i++) {
      var s = M.seats[i], p = toS(s.x, s.z); if (p[0] < -10 || p[1] < -10 || p[0] > W + 10 || p[1] > H + 10) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], i === sel ? rad * 1.35 : rad, 0, 6.2832);
      ctx.fillStyle = i === sel ? YELLOW : i === hover ? "#ffffff" : c; ctx.fill();
      if (i === sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(1.5, rad * 0.28); ctx.beginPath(); ctx.moveTo(p[0] - rad * 0.55, p[1]); ctx.lineTo(p[0] - rad * 0.1, p[1] + rad * 0.45); ctx.lineTo(p[0] + rad * 0.6, p[1] - rad * 0.45); ctx.stroke(); } // ✓: selected is not colour alone
      var n = i - R.start + 1; // seat numbers on the pitch side of the dot
      if (n === 1 || n === R.count || n % sstep === 0 || i === sel || i === hover) { var lq = toS(s.x + s.nx * (rad + 9) / view.s, s.z + s.nz * (rad + 9) / view.s); ctx.font = (i === sel ? "700 " : "500 ") + "10.5px " + FONT; ctx.fillStyle = i === sel ? YELLOW : "#C8D1DE"; ctx.fillText(String(s.seat), lq[0], lq[1]); }
    }
  };
  function thumb() { // one shared stadium thumbnail for the result cards (Ticketmaster shows one per card with a pin)
    if (thumbURL) return thumbURL;
    var c = document.createElement("canvas"), w = 120, h = 96; c.width = w * 2; c.height = h * 2; var x = c.getContext("2d"); x.scale(2, 2);
    var e = extent(), s = Math.min(w / (2 * e[0] + 4), h / (2 * e[1] + 4)); x.fillStyle = "#12151d"; x.fillRect(0, 0, w, h); drawBase(x, s, w / 2, h / 2);
    polys.forEach(function (P) { x.beginPath(); P.pts.forEach(function (pt, i) { var px = pt[0] * s + w / 2, py = pt[1] * s + h / 2; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.closePath(); x.fillStyle = "#d5d9df"; x.fill(); x.strokeStyle = "#fff"; x.lineWidth = .5; x.stroke(); });
    SM.thumbT = { s: s, w: w, h: h }; return (thumbURL = c.toDataURL());
  }
  function seatLabel(i) { var s = M.seats[i], b = M.blocks[s.blockIdx]; return SM.secName(b) + (b.standing ? " · Terrace row " + s.row : " · Row " + s.row + " · Seat " + s.seat); }
  SM.seatLabel = seatLabel;
  function showTip(h, x, y) {
    if (h.block < 0) { tip.hidden = true; return; }
    var b = M.blocks[h.block], st = stats[h.block] || {};
    var head = h.seat >= 0 ? seatLabel(h.seat) : h.row >= 0 ? SM.secName(b) + " · " + (b.standing ? "Terrace row " : "Row ") + b.rowLabels[h.row] + " · " + b.rowInfo[h.row].count + (b.standing ? " spots" : " seats") : SM.secName(b);
    tip.innerHTML = "<b>" + esc(head) + "</b><br>" + esc(b.stand) + " · " + esc(b.levelName) +
      "<br>" + (st.closed ? "Behind the stage — not normally sold" : "≈" + Math.round(st.d) + (A.isSport() ? " m to the pitch centre" : " m to stage · " + Math.round(st.ang) + "° off-centre")) +
      "<br><span>" + (h.seat >= 0 ? "Click to select this seat" : h.row >= 0 ? "Click to see this row's seats" : h.block === SM.focusBlock ? "Click a row" : "Click to see its rows") + "</span>";
    tip.hidden = false; tip.style.left = Math.min(x + 14, cv.clientWidth - 240) + "px"; tip.style.top = Math.min(y + 14, cv.clientHeight - 90) + "px";
  }
  SM.selectSeat = function (i) {
    sel = i; A.goToSeat(i); SM.coach(null); var s = M.seats[i], st = stats[s.blockIdx], b = M.blocks[s.blockIdx], ri = b.rowLabels.indexOf(s.row), r = b.rowInfo[ri];
    if (SM.focusBlock !== s.blockIdx) SM.focusBlock = s.blockIdx; SM.focusRow = ri; renderSecBar();
    $("mapSel").innerHTML = "<div class='selh'><span class='tick'>✓</span><div><b>" + esc(seatLabel(i)) + "</b><div class='small'>" + esc(b.stand) + " · ≈" + Math.round(st.d) + (A.isSport() ? " m to the pitch centre" : " m to stage") + "</div></div>" +
      "<span class='step'><button type='button' id='selPrev' aria-label='Previous seat'" + (i <= r.start ? " disabled" : "") + ">‹</button><button type='button' id='selNext' aria-label='Next seat'" + (i >= r.start + r.count - 1 ? " disabled" : "") + ">›</button></span>" +
      "<button type='button' class='x' id='mapSelX' aria-label='Clear'>×</button></div>" +
      "<div class='btns'><button type='button' class='primary' id='mapSee'>My view</button><button type='button' id='mapPhoto'>Camera view</button><button type='button' id='mapShare'>Share link</button></div><div class='small' id='shareMsg' aria-live='polite'></div>";
    $("mapSel").hidden = false;
    $("mapSee").addEventListener("click", function () { A.setMode("seat"); });
    $("mapPhoto").addEventListener("click", function () { A.setMode("phone"); });
    $("mapSelX").addEventListener("click", SM.clearSel);
    $("selPrev").addEventListener("click", function () { SM.selectSeat(i - 1); });
    $("selNext").addEventListener("click", function () { SM.selectSeat(i + 1); });
    // keep the chosen seat in sight above the card, at seat-level zoom
    var g = goal || { s: view.s, tx: view.tx, ty: view.ty }; if (g.s < ROW_ZOOM * 0.8) { var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (var k = r.start; k < r.start + r.count; k++) { var q = M.seats[k]; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); } g = frame(x0, x1, z0, z1, 4, 60, ROW_ZOOM); }
    var a = freeArea(), px = s.x * g.s + g.tx, py = s.z * g.s + g.ty;
    if (px < 30 || px > a.w - 30 || py < a.top + 30 || py > a.bottom - 30) { g = { s: g.s, tx: g.tx + a.w / 2 - px, ty: g.ty + (a.top + a.bottom) / 2 - py }; }
    if (g !== goal) animateTo(g); else SM.draw();
    $("mapShare").addEventListener("click", function () {
      var url = location.href, done = function (ok) { $("shareMsg").textContent = ok ? "Link copied — it opens this exact seat." : "Copy this link: " + url; };
      try { navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
    });
    A.updateHash();
  };
  SM.coach = function (msg) { var c = $("coach"); if (!c) return; if (msg) { c.textContent = msg; c.hidden = false; } else c.hidden = true; };
  SM.clearSel = function () { sel = -1; $("mapSel").hidden = true; renderSecBar(); SM.coach(SM.focusRow >= 0 ? "Tap a seat" : SM.focusBlock >= 0 ? "Tap a row" : "Tap a section to see its rows"); SM.draw(); };
  SM.surprise = function () { // random open seat in a section that matches the current filters
    var ok = []; M.blocks.forEach(function (b, bi) { if (matches(bi) && stats[bi] && !stats[bi].closed) ok.push(bi); });
    if (!ok.length) { $("mapMsg").textContent = "No sections match your filters."; return; }
    var b = M.blocks[ok[(Math.random() * ok.length) | 0]], i = b.seatStart + ((Math.random() * b.seatCount) | 0);
    $("mapMsg").textContent = ""; SM.zoomToBlock(M.seats[i].blockIdx); SM.selectSeat(i);
  };
  SM.search = function (q) {
    q = String(q || "").trim(); if (!q) return; var m = q.toLowerCase().replace(/blk|block|section|sec|row|seat/g, " ").trim().split(/[\s,]+/);
    var bi = -1; M.blocks.forEach(function (b, i) { if (bi < 0 && b.official && String(b.id).toLowerCase() === m[0]) bi = i; });
    if (bi < 0) { var low = q.toLowerCase(); M.blocks.forEach(function (b, i) { if (bi < 0 && (b.label + " " + b.stand).toLowerCase().indexOf(low) >= 0) bi = i; }); }
    if (bi < 0) { $("mapMsg").textContent = "No section matches “" + q + "”."; return; }
    $("mapMsg").textContent = ""; var b = M.blocks[bi];
    if (m[1]) {
      var ri = b.rowLabels.indexOf(m[1].toUpperCase());
      if (ri < 0) { $("mapMsg").textContent = "Row " + m[1].toUpperCase() + " isn't in " + SM.secName(b) + " (rows " + b.rowLabels[0] + "–" + b.rowLabels[b.rows - 1] + ")."; SM.zoomToBlock(bi); return; }
      var r = b.rowInfo[ri], sn = Math.max(1, Math.min(r.count, +m[2] || 1)); SM.zoomToBlock(bi); SM.selectSeat(r.start + sn - 1); return;
    }
    SM.zoomToBlock(bi);
  };
  SM.renderList = function () {
    if (!M) return; var t = thumb(), T = SM.thumbT;
    var rows = M.blocks.map(function (b, bi) { return { b: b, bi: bi, st: stats[bi] }; }).filter(function (r) { return r.st && matches(r.bi); });
    rows.sort(F.sort === "best" ? function (a, c) { return a.st.score - c.st.score; } : F.sort === "centre" ? function (a, c) { return a.st.ang - c.st.ang || a.st.d - c.st.d; } : F.sort === "level" ? function (a, c) { return a.b.levelIdx - c.b.levelIdx || a.st.d - c.st.d; } : function (a, c) { return a.st.d - c.st.d; });
    rows.forEach(function (r, i) { r.rank = i; });
    $("mapCount").textContent = rows.length + " section" + (rows.length === 1 ? "" : "s");
    $("mapList").innerHTML = rows.map(function (r) {
      var P = polys[r.bi], px = (P.cx * T.s + T.w / 2) / T.w * 100, py = (P.cz * T.s + T.h / 2) / T.h * 100;
      return "<li data-b='" + r.bi + "' tabindex='0' role='button' aria-label='" + esc(SM.secName(r.b) + ", about " + Math.round(r.st.d) + " metres to stage") + "'><span class='th' style='background-image:url(" + t + ")'><i style='left:" + px.toFixed(1) + "%;top:" + py.toFixed(1) + "%'></i></span><span class='tx'><b>" + esc(SM.secName(r.b)) + (F.sort === "best" && r.rank < 3 ? " <span class='toppick'>Top pick</span>" : "") + "</b><span>" + esc(r.b.stand) + " · " + esc(r.b.levelName) + "</span><span>Rows " + r.b.rowLabels[0] + "–" + r.b.rowLabels[r.b.rows - 1] + " · " + r.b.seatCount.toLocaleString() + (r.b.standing ? " spots" : " seats") + "</span><span class='d'>≈" + Math.round(r.st.d) + (A.isSport() ? " m to the pitch centre" : " m to stage · " + Math.round(r.st.ang) + "° off-centre") + "</span></span><span class='chev'>›</span></li>";
    }).join("") || "<li class='none'>No sections match these filters.</li>";
    $("mapList").querySelectorAll("li[data-b]").forEach(function (li) {
      li.addEventListener("click", function () { if (A.state.mode !== "map") A.setMode("map"); SM.zoomToBlock(+li.dataset.b); });
      li.addEventListener("mouseenter", function () { SM.hoverBlock = +li.dataset.b; SM.draw(); });
      li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); li.click(); } });
    });
  };
  SM.show = function (on) { SM.active = on; wrap.hidden = !on; if (on) { SM.resize(); if (!SM.fitted) { SM.fit(); SM.fitted = true; } else SM.draw(); } };
})();
