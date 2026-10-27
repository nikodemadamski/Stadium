/* 2D interactive seat map, modelled on Ticketmaster's interactive seat map:
 *  - sections are BLUE when they match your filters and GREY when they don't (Ticketmaster's own colour rule);
 *  - click a section to zoom to individual seat dots, click a dot to select it (green = selected);
 *  - results list on the right with a mini stadium + pin per card.
 * NOT shown: prices / availability — Ticketmaster does not publish them in any reusable form (see Sources). Nothing is invented.
 * Seat dot positions come from js/geometry.js (layout calibrated to official capacity; rows/seats per block are estimates ⚠️). */
(function () {
  var SM = window.SeatMap = {};
  var cv, ctx, mini, mctx, wrap, tip, A, M, S;
  var view = { s: 2, tx: 0, ty: 0 }, dpr = 1, hover = -1, sel = -1, polys = [], stats = [], thumbURL = null;
  var F = SM.filters = { level: "all", maxDist: 999, hideClosed: true, sort: "best" };
  var SEAT_ZOOM = 7;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  SM.secName = function (b) { return b.official ? (S.id === "aviva" ? "BLK" + b.id : (S.blockPrefix || "Section ") + b.id) : b.stand + " · zone " + b.zoneOf.split(" ")[0]; };

  SM.init = function (app) {
    A = app; wrap = $("mapWrap"); cv = $("map2d"); ctx = cv.getContext("2d"); mini = $("miniMap"); mctx = mini.getContext("2d"); tip = $("mapTip");
    window.addEventListener("resize", function () { if (SM.active) { SM.resize(); SM.draw(); } });
    var ptrs = {}, down = null, pinch = null;
    cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY, n: Object.keys(ptrs).length }; });
    cv.addEventListener("pointermove", function (e) {
      var r = cv.getBoundingClientRect(), p = ptrs[e.pointerId], ids = Object.keys(ptrs);
      if (ids.length === 2 && p) { p.x = e.clientX; p.y = e.clientY; var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch); pinch = d; return; }
      if (p) { view.tx += e.clientX - p.x; view.ty += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; SM.draw(); return; }
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
    $("mapReset").addEventListener("click", function () { SM.fit(); });
    mini.addEventListener("click", function (e) { var r = mini.getBoundingClientRect(), m = SM.miniT, wx = (e.clientX - r.left - m.tx) / m.s, wz = (e.clientY - r.top - m.ty) / m.s; view.tx = cv.clientWidth / 2 - wx * view.s; view.ty = cv.clientHeight / 2 - wz * view.s; SM.draw(); });
    $("seatSearch").addEventListener("keydown", function (e) { if (e.key === "Enter") SM.search(this.value); });
    $("seatSearchGo").addEventListener("click", function () { SM.search($("seatSearch").value); });
    $("fLevel").addEventListener("change", function () { F.level = this.value; SM.refresh(); });
    $("fDist").addEventListener("input", function () { F.maxDist = +this.value >= 200 ? 999 : +this.value; $("fDistLbl").textContent = F.maxDist >= 999 ? "Any distance" : "≤ " + F.maxDist + " m"; SM.refresh(); });
    $("fSort").addEventListener("change", function () { F.sort = this.value; SM.renderList(); });
    $("fClosed").addEventListener("change", function () { F.hideClosed = this.checked; SM.refresh(); });
    $("surprise").addEventListener("click", function () { SM.surprise(); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (document.body.classList.contains("sideOpen")) { document.body.classList.remove("sideOpen"); return; }
      if (SM.active && !$("mapSel").hidden) SM.clearSel();
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
    $("fLevel").innerHTML = '<option value="all">All levels</option>' + S.levels.map(function (L) { return '<option value="' + L.id + '">' + esc(L.name) + "</option>"; }).join("") +
      (M.blocks.some(function (b) { return b.standing; }) ? '<option value="standing">Standing terraces</option>' : "");
    F.level = "all"; $("mapSel").hidden = true; SM.computeStats(); SM.fitted = false; SM.coach("Tap a section to see its seats");
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
  SM.fit = function () {
    var w = cv.clientWidth, h = cv.clientHeight, e = extent(), top = 56, hh = Math.max(120, h - top - 70);
    view.s = Math.min(w / (2 * e[0] + 16), hh / (2 * e[1] + 8)); view.tx = w / 2; view.ty = top + hh / 2; SM.draw();
  };
  function zoomAt(px, py, f) { var ns = Math.max(0.5, Math.min(60, view.s * f)); f = ns / view.s; view.tx = px - (px - view.tx) * f; view.ty = py - (py - view.ty) * f; view.s = ns; SM.draw(); }
  SM.zoomToBlock = function (bi) {
    var b = M.blocks[bi], x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (var i = b.seatStart; i < b.seatStart + b.seatCount; i++) { var s = M.seats[i]; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
    var w = cv.clientWidth, h = cv.clientHeight;
    view.s = Math.max(SEAT_ZOOM * 1.3, Math.min(40, Math.min(w / (x1 - x0 + 8), h / (z1 - z0 + 8))));
    view.tx = w / 2 - (x0 + x1) / 2 * view.s; view.ty = h / 2 - (z0 + z1) / 2 * view.s;
    SM.focusBlock = bi; A.selectBlock(bi); SM.draw(); SM.coach("Now tap a seat");
  };
  function toS(x, z) { return [x * view.s + view.tx, z * view.s + view.ty]; }
  function inPoly(x, z, pts) { var c = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function pick(px, py) {
    var wx = (px - view.tx) / view.s, wz = (py - view.ty) / view.s, block = -1;
    for (var bi = polys.length - 1; bi >= 0; bi--) if (inPoly(wx, wz, polys[bi].pts)) { block = bi; break; }
    if (block < 0 || view.s < SEAT_ZOOM) return { block: block, seat: -1 };
    var b = M.blocks[block], best = -1, bd = 0.36;
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
    if (!showSeats || view.s < 13) polys.forEach(function (P, bi) {
      var b = M.blocks[bi], s = toS(P.cx, P.cz); ctx.font = "bold " + Math.max(8, Math.min(13, view.s * 2.2)) + "px Segoe UI, Arial";
      ctx.fillStyle = showSeats ? "#8a91a3" : (matches(bi) ? "#fff" : "#5d6476"); ctx.fillText(b.official ? b.id : b.zoneOf.split(" ")[0], s[0], s[1]);
    });
    SM.drawMini();
  };
  SM.drawMini = function () {
    var w = mini.clientWidth, h = mini.clientHeight; if (!w) return; mini.width = w * dpr; mini.height = h * dpr; mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var e = extent(), s = Math.min(w / (2 * e[0] + 6), h / (2 * e[1] + 6)), m = SM.miniT = { s: s, tx: w / 2, ty: h / 2 };
    mctx.fillStyle = "#0b0d13"; mctx.fillRect(0, 0, w, h); drawBase(mctx, s, m.tx, m.ty);
    polys.forEach(function (P, bi) { mctx.beginPath(); P.pts.forEach(function (pt, i) { var x = pt[0] * s + m.tx, y = pt[1] * s + m.ty; if (i) mctx.lineTo(x, y); else mctx.moveTo(x, y); }); mctx.closePath();
      mctx.fillStyle = sel >= 0 && M.seats[sel].blockIdx === bi ? "#bef264" : colourFor(bi); mctx.fill(); });
    var x0 = -view.tx / view.s, z0 = -view.ty / view.s, x1 = (cv.clientWidth - view.tx) / view.s, z1 = (cv.clientHeight - view.ty) / view.s;
    mctx.fillStyle = "rgba(255,255,255,.12)"; mctx.fillRect(x0 * s + m.tx, z0 * s + m.ty, (x1 - x0) * s, (z1 - z0) * s);
    mctx.strokeStyle = "#ffffff"; mctx.lineWidth = 1.5; mctx.strokeRect(x0 * s + m.tx, z0 * s + m.ty, (x1 - x0) * s, (z1 - z0) * s);
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
    sel = i; A.goToSeat(i); SM.draw(); SM.coach(null); var s = M.seats[i], st = stats[s.blockIdx];
    $("mapSel").innerHTML = "<div class='selh'><span class='tick'>✓</span><div><b>" + esc(seatLabel(i)) + "</b><div class='small'>" + esc(M.blocks[s.blockIdx].stand) + " · ≈" + Math.round(st.d) + " m to stage</div></div><button type='button' class='x' id='mapSelX' aria-label='Clear'>×</button></div>" +
      "<div class='btns'><button type='button' class='primary' id='mapSee'>See view from seat</button><button type='button' id='mapPhoto'>iPhone photo from here</button><button type='button' id='mapShare'>Copy link</button></div><div class='small' id='shareMsg' aria-live='polite'></div>";
    $("mapSel").hidden = false;
    $("mapSee").addEventListener("click", function () { A.setMode("seat"); });
    $("mapPhoto").addEventListener("click", function () { A.setMode("phone"); });
    $("mapSelX").addEventListener("click", SM.clearSel);
    $("mapShare").addEventListener("click", function () {
      var url = location.href, done = function (ok) { $("shareMsg").textContent = ok ? "Link copied — it opens this exact seat." : "Copy this link: " + url; };
      try { navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
    });
    A.updateHash();
  };
  SM.coach = function (msg) { var c = $("coach"); if (!c) return; if (msg) { c.textContent = msg; c.hidden = false; } else c.hidden = true; };
  SM.clearSel = function () { sel = -1; $("mapSel").hidden = true; SM.draw(); };
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
