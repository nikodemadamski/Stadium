/* 2D interactive seat map, modelled on Ticketmaster's interactive seat map:
 *  - sections are BLUE when they match your filters and GREY when they don't (Ticketmaster's own colour rule);
 *  - click a section to zoom to individual seat dots, click a dot to select it (green = selected);
 *  - results list on the right with a stadium thumbnail + pin per card; level tabs, a section bar with row/seat pickers.
 * NOT shown: prices / availability — Ticketmaster does not publish them in any reusable form (see Sources). Nothing is invented.
 * Seat dot positions come from js/geometry.js (layout calibrated to official capacity; rows/seats per block are estimates ⚠️). */
(function () {
  var SM = window.SeatMap = {};
  var cv, ctx, wrap, tip, A, M, S;
  var view = { s: 2, tx: 0, ty: 0 }, dpr = 1, hover = -1, sel = -1, polys = [], stats = [], thumbURL = null;
  var F = SM.filters = { level: "all", maxDist: 999, hideClosed: true, sort: "best" };
  var goal = null, anim = 0; SM.focusBlock = -1;
  var SEAT_ZOOM = 7;
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
      if (h.seat !== hover || h.block !== SM.hoverBlock) { hover = h.seat; SM.hoverBlock = h.block; SM.draw(); }
      showTip(h, e.clientX - r.left, e.clientY - r.top);
    });
    cv.addEventListener("pointerup", function (e) {
      var r = cv.getBoundingClientRect();
      if (down && down.n === 1 && Object.keys(ptrs).length === 1 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
        var h = pick(e.clientX - r.left, e.clientY - r.top);
        if (h.seat >= 0) SM.selectSeat(h.seat); else if (h.block >= 0) SM.zoomToBlock(h.block);
      }
      delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null;
    });
    cv.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; pinch = null; });
    cv.addEventListener("pointerleave", function () { tip.hidden = true; if (hover !== -1 || SM.hoverBlock !== -1) { hover = -1; SM.hoverBlock = -1; SM.draw(); } });
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
      if (SM.active && !$("mapSel").hidden) SM.clearSel(); else if (SM.active && SM.focusBlock >= 0) SM.back();
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
    F.level = "all"; $("mapSel").hidden = true; SM.focusBlock = -1; renderSecBar(); SM.computeStats(); SM.fitted = false; SM.coach("Tap a section to see its seats");
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
  SM.matches = matches;
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
  SM.back = function () { SM.focusBlock = -1; renderSecBar(); SM.coach(sel >= 0 ? null : "Tap a section to see its seats"); SM.fit(true); };
  function zoomAt(px, py, f) { stopAnim(); var ns = Math.max(0.5, Math.min(60, view.s * f)); f = ns / view.s; view.tx = px - (px - view.tx) * f; view.ty = py - (py - view.ty) * f; view.s = ns; SM.draw(); }
  function blockBox(b) { var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (var i = b.seatStart; i < b.seatStart + b.seatCount; i++) { var s = M.seats[i]; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); } return [x0, x1, z0, z1]; }
  SM.zoomToBlock = function (bi) {
    var bb = blockBox(M.blocks[bi]); SM.focusBlock = bi; renderSecBar();
    animateTo(frame(bb[0], bb[1], bb[2], bb[3], 6, 40, SEAT_ZOOM * 1.3));
    A.selectBlock(bi); SM.coach(sel >= 0 && M.seats[sel].blockIdx === bi ? null : "Tap a seat, or choose a row and seat above");
  };
  // Section bar: where you are + row/seat pickers, so nobody has to hit a 4-pixel dot.
  function renderSecBar() {
    var bar = $("secBar"), bi = SM.focusBlock; if (!M || bi < 0) { bar.hidden = true; bar.innerHTML = ""; return; }
    var b = M.blocks[bi], cur = sel >= 0 && M.seats[sel].blockIdx === bi ? M.seats[sel] : null, ri = cur ? b.rowLabels.indexOf(cur.row) : -1;
    bar.innerHTML = "<button type='button' class='back' id='secBack'>‹ All sections</button><div class='nm'><b>" + esc(SM.secName(b)) + "</b><span>" + esc(b.stand + " · " + b.levelName) + "</span></div>" +
      "<label>" + (b.standing ? "Terrace row" : "Row") + " <select id='secRow'><option value=''>–</option>" + b.rowLabels.map(function (l, i) { return "<option value='" + i + "'" + (i === ri ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select></label>" +
      "<label>" + (b.standing ? "Spot" : "Seat") + " <select id='secSeat'" + (ri < 0 ? " disabled" : "") + ">" + (ri < 0 ? "<option>–</option>" : Array.from({ length: b.rowInfo[ri].count }, function (_, i) { return "<option value='" + i + "'" + (cur && cur.seat === i + 1 ? " selected" : "") + ">" + (i + 1) + "</option>"; }).join("")) + "</select></label>";
    bar.hidden = false;
    $("secBack").addEventListener("click", SM.back);
    $("secRow").addEventListener("change", function () { if (this.value === "") return; var r = b.rowInfo[+this.value]; SM.selectSeat(r.start + Math.floor((r.count - 1) / 2)); });
    $("secSeat").addEventListener("change", function () { var r = b.rowInfo[+$("secRow").value]; if (r) SM.selectSeat(r.start + +this.value); });
  }
  function toS(x, z) { return [x * view.s + view.tx, z * view.s + view.ty]; }
  function inPoly(x, z, pts) { var c = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function pick(px, py) {
    var wx = (px - view.tx) / view.s, wz = (py - view.ty) / view.s, block = -1;
    for (var bi = polys.length - 1; bi >= 0; bi--) if (inPoly(wx, wz, polys[bi].pts)) { block = bi; break; }
    if (block < 0 || view.s < SEAT_ZOOM) return { block: block, seat: -1 };
    var tol = Math.max(0.6, 14 / view.s), b = M.blocks[block], best = -1, bd = tol * tol; // ~14 px finger tolerance
    for (var i = b.seatStart; i < b.seatStart + b.seatCount; i++) { var s = M.seats[i], d = (s.x - wx) * (s.x - wx) + (s.z - wz) * (s.z - wz); if (d < bd) { bd = d; best = i; } }
    return { block: block, seat: best };
  }
  var BLUE = "#7c5cff", GREY = "#272c39", TERR = "#4f5fb5";
  function colourFor(bi) { return !matches(bi) ? GREY : M.blocks[bi].standing ? TERR : BLUE; }
  function drawBase(c, s, tx, ty, opts) {
    var hw = S.field.width / 2, hl = S.field.length / 2;
    c.fillStyle = S.kind === "stadium" ? "#1b5a36" : S.kind === "arena" ? "#262a35" : "#3a2418"; c.fillRect(-hw * s + tx, -hl * s + ty, S.field.width * s, S.field.length * s);
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
  SM.draw = function () {
    if (!SM.active || !M) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#0b0d13"; ctx.fillRect(0, 0, cv.width, cv.height);
    drawBase(ctx, view.s, view.tx, view.ty, { labels: true });
    var showSeats = view.s >= SEAT_ZOOM, W = cv.clientWidth, H = cv.clientHeight;
    polys.forEach(function (P, bi) {
      ctx.beginPath(); P.pts.forEach(function (pt, i) { var s = toS(pt[0], pt[1]); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath();
      ctx.fillStyle = showSeats ? "#151925" : (bi === SM.hoverBlock && matches(bi) ? "#a78bfa" : colourFor(bi)); ctx.fill();
      ctx.lineWidth = bi === SM.hoverBlock ? 2.5 : 1; ctx.strokeStyle = bi === SM.hoverBlock ? "#ffffff" : "#0b0d13"; ctx.stroke();
    });
    if (showSeats) {
      var r = Math.max(1.4, 0.21 * view.s);
      M.blocks.forEach(function (b, bi) {
        var c = matches(bi) ? (b.standing ? TERR : BLUE) : GREY;
        for (var i = b.seatStart; i < b.seatStart + b.seatCount; i++) {
          var s = M.seats[i], p = toS(s.x, s.z); if (p[0] < -6 || p[1] < -6 || p[0] > W + 6 || p[1] > H + 6) continue;
          ctx.beginPath(); ctx.arc(p[0], p[1], i === sel ? r * 1.5 : r, 0, 6.2832);
          ctx.fillStyle = i === sel ? "#bef264" : i === hover ? "#ffffff" : c; ctx.fill();
          if (i === sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = "#0b0d13"; ctx.font = "bold " + Math.round(r * 1.6) + "px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("✓", p[0], p[1] + 0.5); }
        }
        if (view.s > 13) { ctx.fillStyle = "#8a91a3"; ctx.font = "11px Segoe UI, Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          b.rowInfo.forEach(function (ri) { var s0 = M.seats[ri.start], p = toS(s0.x - s0.nz * 0.75, s0.z + s0.nx * 0.75); if (p[0] > 0 && p[1] > 0 && p[0] < W && p[1] < H) ctx.fillText(ri.label, p[0], p[1]); }); }
      });
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (!showSeats || view.s < 13) polys.forEach(function (P, bi) { // a label only where it fits inside its section: no pile-ups
      var b = M.blocks[bi], s = toS(P.cx, P.cz), txt = String(b.official ? b.id : b.zoneOf.split(" ")[0]), fs = Math.max(9, Math.min(13, view.s * 2.2));
      ctx.font = "bold " + fs + "px Segoe UI, Arial";
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; P.pts.forEach(function (pt) { var q = toS(pt[0], pt[1]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
      var tw = ctx.measureText(txt).width, w = x1 - x0, h = y1 - y0;
      if (!(w >= tw + 4 && h >= fs + 2) && !(h >= tw + 4 && w >= fs + 2) && bi !== SM.hoverBlock) return;
      ctx.fillStyle = showSeats ? "#8a91a3" : (matches(bi) ? "#fff" : "#5d6476"); ctx.fillText(txt, s[0], s[1]);
    });
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
    tip.innerHTML = "<b>" + esc(h.seat >= 0 ? seatLabel(h.seat) : SM.secName(b)) + "</b><br>" + esc(b.stand) + " · " + esc(b.levelName) +
      "<br>" + (st.closed ? "Behind the stage — not normally sold" : "≈" + Math.round(st.d) + (A.isSport() ? " m to the pitch centre" : " m to stage · " + Math.round(st.ang) + "° off-centre")) +
      "<br><span>" + (h.seat >= 0 ? "Click to select this seat" : "Click to see seats") + "</span>";
    tip.hidden = false; tip.style.left = Math.min(x + 14, cv.clientWidth - 240) + "px"; tip.style.top = Math.min(y + 14, cv.clientHeight - 90) + "px";
  }
  SM.selectSeat = function (i) {
    sel = i; A.goToSeat(i); SM.coach(null); var s = M.seats[i], st = stats[s.blockIdx], b = M.blocks[s.blockIdx], ri = b.rowLabels.indexOf(s.row), r = b.rowInfo[ri];
    if (SM.focusBlock !== s.blockIdx) SM.focusBlock = s.blockIdx; renderSecBar();
    $("mapSel").innerHTML = "<div class='selh'><span class='tick'>✓</span><div><b>" + esc(seatLabel(i)) + "</b><div class='small'>" + esc(b.stand) + " · ≈" + Math.round(st.d) + (A.isSport() ? " m to the pitch centre" : " m to stage") + "</div></div>" +
      "<span class='step'><button type='button' id='selPrev' aria-label='Previous seat'" + (i <= r.start ? " disabled" : "") + ">‹</button><button type='button' id='selNext' aria-label='Next seat'" + (i >= r.start + r.count - 1 ? " disabled" : "") + ">›</button></span>" +
      "<button type='button' class='x' id='mapSelX' aria-label='Clear'>×</button></div>" +
      "<div class='btns'><button type='button' class='primary' id='mapSee'>See view from seat</button><button type='button' id='mapPhoto'>iPhone photo from here</button><button type='button' id='mapShare'>Copy link</button></div><div class='small' id='shareMsg' aria-live='polite'></div>";
    $("mapSel").hidden = false;
    $("mapSee").addEventListener("click", function () { A.setMode("seat"); });
    $("mapPhoto").addEventListener("click", function () { A.setMode("phone"); });
    $("mapSelX").addEventListener("click", SM.clearSel);
    $("selPrev").addEventListener("click", function () { SM.selectSeat(i - 1); });
    $("selNext").addEventListener("click", function () { SM.selectSeat(i + 1); });
    // keep the chosen seat in sight above the card, at seat-level zoom
    var g = goal || { s: view.s, tx: view.tx, ty: view.ty }; if (g.s < SEAT_ZOOM * 1.3) { var bb = blockBox(b); g = frame(bb[0], bb[1], bb[2], bb[3], 6, 40, SEAT_ZOOM * 1.3); }
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
  SM.clearSel = function () { sel = -1; $("mapSel").hidden = true; renderSecBar(); SM.draw(); };
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
