/* Stadium geometry: data → seats / standing spots, row strips, blocks. Pure JS (Node-testable). */
(function (root) {
  function Ring(spec) { this.hx = spec.halfX; this.hz = spec.halfZ; this.R = spec.radius; this.sx = this.hx - this.R; this.sz = this.hz - this.R; }
  Ring.prototype.point = function (p, d) {
    p = ((p % 8) + 8) % 8;
    var seg = Math.floor(p), u = p - seg, R = this.R + d, sx = this.sx, sz = this.sz, a, cx, cz;
    switch (seg) {
      case 0: return { x: -sx + 2 * sx * u, z: -this.hz - d, nx: 0, nz: -1 };
      case 2: return { x: this.hx + d, z: -sz + 2 * sz * u, nx: 1, nz: 0 };
      case 4: return { x: sx - 2 * sx * u, z: this.hz + d, nx: 0, nz: 1 };
      case 6: return { x: -this.hx - d, z: sz - 2 * sz * u, nx: -1, nz: 0 };
      case 1: cx = sx; cz = -sz; a = -Math.PI / 2 + u * Math.PI / 2; break;
      case 3: cx = sx; cz = sz; a = u * Math.PI / 2; break;
      case 5: cx = -sx; cz = sz; a = Math.PI / 2 + u * Math.PI / 2; break;
      case 7: cx = -sx; cz = -sz; a = Math.PI + u * Math.PI / 2; break;
    }
    var nx = Math.cos(a), nz = Math.sin(a);
    return { x: cx + R * nx, z: cz + R * nz, nx: nx, nz: nz };
  };
  Ring.prototype.dsdp = function (p, d) {
    var seg = Math.floor(((p % 8) + 8) % 8);
    if (seg === 0 || seg === 4) return 2 * this.sx;
    if (seg === 2 || seg === 6) return 2 * this.sz;
    return (Math.PI / 2) * (this.R + d);
  };
  Ring.prototype.arc = function (pa, pb, d) {
    var n = Math.max(4, Math.ceil((pb - pa) * 64)), h = (pb - pa) / n, s = 0;
    for (var i = 0; i < n; i++) s += this.dsdp(pa + (i + 0.5) * h, d) * h;
    return s;
  };
  Ring.prototype.advance = function (pa, target, d) {
    var p = pa, s = 0, h = 1 / 256;
    while (s < target) { var ds = this.dsdp(p + h / 2, d) * h; if (s + ds >= target) return p + h * (target - s) / ds; s += ds; p += h; }
    return p;
  };
  function rowLetters(n, skip) {
    var base = [], out = [];
    for (var c = 65; c <= 90; c++) { var L = String.fromCharCode(c); if (skip.indexOf(L) < 0) base.push(L); }
    for (var i = 0; out.length < n; i++) { if (i < base.length) out.push(base[i]); else { var b = base[(i - base.length) % base.length]; out.push(b + b); } }
    return out;
  }
  // opts.fill = { seated: f, standing: f } multiplies every level's fill (used by the calibration script).
  function build(S, opts) {
    opts = opts || {};
    var ring = new Ring(S.ring), seats = [], blocks = [], strips = [], letters = rowLetters(60, S.rowLetters.skip);
    var seatW = S.seatWidth, aisle = S.aisleWidth;
    S.levels.forEach(function (L, li) {
      L.groups.forEach(function (g) {
        var rows = g.rows || L.rows, tread = g.tread || L.tread, rise0 = g.rise0 != null ? g.rise0 : L.rise0, riseGrow = g.riseGrow != null ? g.riseGrow : L.riseGrow;
        var standing = !!g.standing, spotW = standing ? 0.55 : seatW;
        var ids = g.blocks ? g.blocks.map(String) : Array.from({ length: g.zones }, function (_, i) { return g.stand + " · zone " + (i + 1); });
        var midD = L.d0 + rows * tread * 0.5, total = ring.arc(g.p[0], g.p[1], midD), per = total / ids.length, pa = g.p[0];
        var baseFill = (g.fill || L.fill || 1) * ((opts.fill && opts.fill[standing ? "standing" : "seated"]) || (standing ? S.fillStanding : S.fillSeated) || 1);
        ids.forEach(function (id, zi) {
          var pb = ring.advance(pa, per, midD);
          var blk = { id: id, label: g.blocks ? "Block " + id : id, level: L.id, levelIdx: li, levelName: L.name, stand: g.stand, endTag: g.endTag || null,
            standing: standing, official: !!g.blocks, zoneOf: g.blocks ? null : (zi + 1) + " of " + ids.length,
            pa: pa, pb: pb, rows: rows, seatStart: seats.length, rowInfo: [], color: g.color || L.color, rowLabels: [] };
          var y = L.y0;
          for (var r = 0; r < rows; r++) {
            var d = L.d0 + r * tread; if (r > 0) y += rise0 + riseGrow * r;
            var dSeat = d + tread * 0.55, arcLen = ring.arc(pa, pb, dSeat);
            var n = Math.max(1, Math.floor((arcLen * baseFill - aisle) / spotW));
            if (S.maxSeatsPerRow && !standing) n = Math.min(n, S.maxSeatsPerRow.value);
            var startS = (arcLen - n * spotW) / 2 + spotW / 2, rowStart = seats.length;
            var rs = g.rowStart != null ? g.rowStart : L.rowStart, label = standing ? String(r + 1) : rs != null ? String(rs + r) : letters[r];
            var p = ring.advance(pa, startS, dSeat);
            for (var k = 0; k < n; k++) {
              if (k > 0) p = ring.advance(p, spotW, dSeat); // incremental: O(seats) instead of O(seats × row length)
              var pt = ring.point(p, dSeat);
              seats.push({ block: id, level: L.id, row: label, rowIdx: r, seat: k + 1, x: pt.x, y: y, z: pt.z, nx: -pt.nx, nz: -pt.nz, p: p, blockIdx: blocks.length, standing: standing });
            }
            blk.rowLabels.push(label);
            blk.rowInfo.push({ label: label, start: rowStart, count: n, y: y, d: d });
            strips.push({ blockIdx: blocks.length, row: r, pa: pa, pb: pb, d0: d, d1: d + tread, y: y, prevY: r === 0 ? null : y - (rise0 + riseGrow * r) });
          }
          blk.seatCount = seats.length - blk.seatStart; blk.dFront = L.d0; blk.dBack = L.d0 + rows * tread; blk.yFront = L.y0; blk.yBack = y;
          blocks.push(blk); pa = pb;
        });
      });
    });
    return { ring: ring, seats: seats, blocks: blocks, strips: strips };
  }
  function summary(model) {
    var seated = 0, standing = 0, byLevel = {};
    model.blocks.forEach(function (b) { if (b.standing) standing += b.seatCount; else seated += b.seatCount; byLevel[b.levelName] = (byLevel[b.levelName] || 0) + b.seatCount; });
    return { total: model.seats.length, seated: seated, standing: standing, byLevel: byLevel };
  }
  var api = { Ring: Ring, build: build, summary: summary, rowLetters: rowLetters };
  if (typeof module !== "undefined") module.exports = api; else root.StadiumGeo = api;
})(this);
