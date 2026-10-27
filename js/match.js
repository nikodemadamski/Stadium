/* Match preview for football / rugby / GAA events: two teams, a referee and a ball playing on the pitch, so you can
 * judge how a game looks from your seat. A lightweight simulation, not a replay: the ball carrier runs at the line,
 * passes when tackled (backwards in rugby), possession turns over now and then, and a score sets the crowd off.
 * Kit colours are approximate home colours, for orientation only. Players are the same animated people as the crowd. */
(function () {
  var T = THREE;
  // [shirt, shorts] — approximate home kits; anything unknown falls back to green v white.
  var KITS = {
    "ireland": [[0.05, 0.45, 0.2], [0.92, 0.92, 0.92]], "argentina": [[0.46, 0.67, 0.86], [0.1, 0.12, 0.3]], "england": [[0.93, 0.93, 0.93], [0.1, 0.12, 0.3]],
    "fiji": [[0.93, 0.93, 0.93], [0.06, 0.06, 0.07]], "france": [[0.08, 0.12, 0.35], [0.93, 0.93, 0.93]], "south africa": [[0.04, 0.33, 0.2], [0.93, 0.93, 0.93]],
    "leinster": [[0.08, 0.25, 0.6], [0.08, 0.2, 0.5]], "munster": [[0.75, 0.08, 0.1], [0.08, 0.1, 0.25]], "connacht": [[0.05, 0.5, 0.25], [0.06, 0.06, 0.07]],
    "ulster": [[0.93, 0.93, 0.93], [0.93, 0.93, 0.93]], "gloucester": [[0.65, 0.05, 0.12], [0.06, 0.06, 0.07]], "ospreys": [[0.06, 0.06, 0.07], [0.06, 0.06, 0.07]],
    "sharks": [[0.06, 0.06, 0.07], [0.06, 0.06, 0.07]], "derry": [[0.75, 0.1, 0.1], [0.06, 0.06, 0.07]], "waterford": [[0.15, 0.35, 0.75], [0.15, 0.35, 0.75]],
    "kosovo": [[0.1, 0.3, 0.75], [0.1, 0.3, 0.75]], "poland": [[0.93, 0.93, 0.93], [0.8, 0.1, 0.15]], "cork": [[0.75, 0.08, 0.1], [0.93, 0.93, 0.93]],
    "kerry": [[0.05, 0.45, 0.2], [0.93, 0.93, 0.93]], "dublin": [[0.4, 0.65, 0.88], [0.1, 0.12, 0.3]], "limerick": [[0.05, 0.45, 0.2], [0.93, 0.93, 0.93]]
  };
  function kitFor(name, fallback) {
    var n = String(name || "").toLowerCase();
    for (var k in KITS) if (Object.prototype.hasOwnProperty.call(KITS, k) && n.indexOf(k) >= 0) return KITS[k];
    return fallback;
  }
  function dist2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
  function rnd(s) { var x = Math.sin(s * 91.7) * 43758.5; return x - Math.floor(x); }

  function Match(sc, ev) {
    this.sc = sc; this.type = ev.type; var S = sc.S, n = ev.type === "football" ? 11 : 15;
    var names = String(ev.name || "").split(/\s+v(?:s\.?)?\s+/i);
    var home = kitFor(names[0], KITS.ireland), away = kitFor(names[1], [[0.93, 0.93, 0.93], [0.06, 0.06, 0.07]]);
    var d = Math.abs(home[0][0] - away[0][0]) + Math.abs(home[0][1] - away[0][1]) + Math.abs(home[0][2] - away[0][2]);
    if (d < 0.45) away = [[0.93, 0.93, 0.93], away[1]]; // colour clash: the away side changes shirts, as in real life
    this.hw = S.field.width / 2 - 3; this.hl = Math.min(S.field.length / 2 - 6, ev.type === "football" ? 52 : 50);
    this.players = []; var k0 = 900000 + (sc.S.id.length * 977);
    for (var t = 0; t < 2; t++) for (var i = 0; i < n; i++) {
      var k = k0 + t * 100 + i, kit = t ? away : home;
      this.players.push({ team: t, role: i, x: 0, z: 0, vx: 0, vz: 0, rot: 0, k: k, h: 1.78 + 0.1 * rnd(k), top: kit[0], legs: kit[1], lod: 1, mode: People.MODE.run });
    }
    this.ref = { team: 2, role: 0, x: 0, z: 0, vx: 0, vz: 0, rot: 0, k: k0 + 999, h: 1.78, top: [0.08, 0.08, 0.09], legs: [0.08, 0.08, 0.09], lod: 1, mode: People.MODE.run };
    this.players.push(this.ref);
    this.players.forEach(function (p) { var dd = People.describe(p.k); dd.sex = "m"; dd.top = p.top; dd.legs = p.legs; p.d = dd; });
    this.n = n; this.group = new T.Group(); sc.scene.add(this.group);
    var ballGeo = new T.SphereBufferGeometry(1, 16, 12); if (ev.type === "rugby") ballGeo.scale(0.095, 0.095, 0.15); else ballGeo.scale(0.11, 0.11, 0.11);
    this.ball = new T.Mesh(ballGeo, new T.MeshLambertMaterial({ color: ev.type === "rugby" ? 0xf2efe6 : 0xffffff, emissive: 0x333333 })); this.group.add(this.ball);
    this.kickoff(0); this.markings(ev.type);
    this.crowd = null; this.build();
  }
  // Pitch markings and goals for the sport (the stadium model only has touchlines and halfway).
  Match.prototype.markings = function (type) {
    var g = this.group, hw = this.hw + 3, hl = this.hl, white = new T.MeshBasicMaterial({ color: 0xf3f4f6 }), post = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 });
    function line(x0, z0, x1, z1, w) { var len = Math.hypot(x1 - x0, z1 - z0), m = new T.Mesh(new T.PlaneBufferGeometry(w || 0.12, len), white); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(x0 - x1, z0 - z1); m.position.set((x0 + x1) / 2, 0.035, (z0 + z1) / 2); g.add(m); }
    function bar(x, y, z, sx, sy, sz) { var m = new T.Mesh(new T.BoxBufferGeometry(sx, sy, sz), post); m.position.set(x, y, z); g.add(m); }
    [-1, 1].forEach(function (s) {
      if (type === "football") { // goal line, 18-yard and 6-yard boxes, a 7.32 m x 2.44 m goal
        var z = s * hl; line(-hw, z, hw, z);
        [[20.16, 16.5], [9.16, 5.5]].forEach(function (bx) { line(-bx[0], z, -bx[0], z - s * bx[1]); line(bx[0], z, bx[0], z - s * bx[1]); line(-bx[0], z - s * bx[1], bx[0], z - s * bx[1]); });
        bar(-3.66, 1.22, z + s * 0.05, 0.12, 2.44, 0.12); bar(3.66, 1.22, z + s * 0.05, 0.12, 2.44, 0.12); bar(0, 2.44, z + s * 0.05, 7.44, 0.12, 0.12);
      } else { // rugby/GAA: try line, 22 m and 10 m lines, H posts (5.6 m apart, crossbar at 3 m)
        var tz = s * hl; line(-hw, tz, hw, tz); line(-hw, s * (hl - 22), hw, s * (hl - 22)); line(-hw, s * 10, hw, s * 10, 0.08);
        bar(-2.8, 7, tz, 0.16, 14, 0.16); bar(2.8, 7, tz, 0.16, 14, 0.16); bar(0, 3, tz, 5.76, 0.16, 0.16);
      }
    });
    if (type === "football") { var n = 48, pts = []; for (var i = 0; i <= n; i++) { var a = i / n * 6.2832; pts.push([Math.sin(a) * 9.15, Math.cos(a) * 9.15]); } for (i = 0; i < n; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); }
  };
  Match.prototype.build = function () { // (re)build the instanced people; called again once the real bodies are unpacked
    if (this.crowd) { this.group.remove(this.crowd); this.crowd.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    var self = this; this.players.forEach(function (p) { p.y = 0.02; });
    this.crowd = People.makeCrowd(this.players); this.group.add(this.crowd);
    this.slots = []; // player -> [attributes, index] for per-frame updates
    this.crowd.children.forEach(function (m) { var list = m.userData.people || [], at = m.userData.attrs || {}; list.forEach(function (p, i) { self.slots.push([p, at, i]); }); });
  };
  Match.prototype.dispose = function () { this.sc.scene.remove(this.group); this.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); };
  Match.prototype.kickoff = function (team) {
    var self = this; this.poss = team; this.carrier = null; this.flight = null; this.clock = 0; this.nextPass = 2;
    this.players.forEach(function (p) { var f = self.formation(p, { x: 0, z: 0 }, true); p.x = f.x; p.z = f.z; p.vx = p.vz = 0; });
    var first = this.players.filter(function (p) { return p.team === team; }).sort(function (a, b) { return (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z); })[0];
    this.carrier = first;
  };
  // Where a player wants to be, relative to the ball. Team 0 attacks +z, team 1 attacks -z.
  Match.prototype.formation = function (p, b, kick) {
    var dir = p.team === 0 ? 1 : -1, att = p.team === this.poss, i = p.role, hw = this.hw, x, z;
    if (p.team === 2) return { x: b.x * 0.6 + 8 * (b.x > 0 ? -1 : 1), z: b.z - 6 };
    if (this.type === "football") {
      var lines = [[0, -0.92], [-0.6, -0.55], [-0.2, -0.6], [0.2, -0.6], [0.6, -0.55], [-0.65, -0.15], [-0.22, -0.2], [0.22, -0.2], [0.65, -0.15], [-0.2, 0.15], [0.2, 0.15]][i];
      var shift = kick ? -0.2 : Math.max(-1, Math.min(1, b.z * dir / this.hl)) * 0.45 + (att ? 0.1 : -0.1);
      var zz = i === 0 ? lines[1] : Math.max(-0.9, Math.min(0.85, lines[1] + shift)); if (kick) zz = Math.min(zz, -0.03); // kick-off: own half
      return { x: lines[0] * hw * 0.9 + (i ? b.x * 0.25 : 0), z: dir * this.hl * zz };
    }
    if (att) { // rugby attack: forwards around the ball, backs in a diagonal line behind it
      if (i < 8) { x = b.x + ((i % 4) - 1.5) * 2.2; z = b.z - dir * (1 + (i >> 2) * 2); }
      else if (i === 14) { x = b.x * 0.3; z = b.z - dir * 22; }
      else { var j = i - 7, side = b.x > 0 ? -1 : 1; x = b.x + side * j * 6; z = b.z - dir * (2 + j * 2.2); }
    } else { // defence: a flat line across the pitch between the ball and their own line, full-back deep
      if (i === 14) { x = b.x * 0.4; z = b.z - dir * 25; }
      else { x = (i / 13 - 0.5) * 2 * hw * 0.92 + b.x * 0.2; z = b.z - dir * 2.5; }
    }
    if (kick) { z = -dir * (8 + (i % 5) * 4); x = (i / (this.n - 1) - 0.5) * 2 * hw * 0.85; }
    return { x: Math.max(-hw, Math.min(hw, x)), z: Math.max(-this.hl - 4, Math.min(this.hl + 4, z)) };
  };
  Match.prototype.update = function (dt, t) {
    if (dt <= 0) return; dt = Math.min(dt, 0.05); this.clock += dt;
    var self = this, rugby = this.type !== "football", b = this.ballPos();
    // ball in the air
    if (this.flight) {
      var f = this.flight; f.t += dt; if (f.t >= f.dur) { this.carrier = f.to; this.flight = null; this.poss = f.to.team; }
    }
    var c = this.carrier;
    if (c && !this.flight) {
      var dir = c.team === 0 ? 1 : -1;
      // carrier runs at the line (a footballer dribbles slower), weaving a little
      c.tx = Math.max(-this.hw, Math.min(this.hw, c.x + Math.sin(t * 0.7 + c.k) * 3)); c.tz = c.z + dir * 10; c.speed = rugby ? 7 : 5.5;
      if (dir * c.z > this.hl) { this.score(c.team); return; }
      var opp = this.players.filter(function (p) { return p.team === 1 - c.team; }), near = null, nd = 1e9;
      opp.forEach(function (p) { var dd = dist2(p, c); if (dd < nd) { nd = dd; near = p; } });
      this.nextPass -= dt;
      if (nd < (rugby ? 1.6 : 1.2) * (rugby ? 1.6 : 1.2) || this.nextPass <= 0) {
        var mates = this.players.filter(function (p) { return p.team === c.team && p !== c && (!rugby || dir * (p.z - c.z) < 0.5) && dist2(p, c) < (rugby ? 400 : 900); });
        if (nd < 2.6 && Math.random() < (rugby ? 0.12 : 0.25)) { this.carrier = near; this.poss = near.team; } // tackle wins it back
        else if (mates.length) { var to = mates[(Math.random() * mates.length) | 0]; this.flight = { from: { x: c.x, z: c.z }, to: to, t: 0, dur: 0.35 + Math.sqrt(dist2(to, c)) / 25 }; this.carrier = null; }
        this.nextPass = rugby ? 2.5 + Math.random() * 3 : 1.2 + Math.random() * 2;
      }
    }
    b = this.ballPos();
    // everyone else: formation spots; the nearest defender chases the carrier, the referee trails play
    var chaser = null, cd = 1e9; if (this.carrier) this.players.forEach(function (p) { if (p.team === 1 - self.carrier.team) { var dd = dist2(p, self.carrier); if (dd < cd) { cd = dd; chaser = p; } } });
    this.players.forEach(function (p) {
      if (p === self.carrier && !self.flight) return;
      var f = p === chaser ? { x: self.carrier.x, z: self.carrier.z } : self.formation(p, b, false); p.tx = f.x; p.tz = f.z; p.speed = p === chaser ? 7.5 : p.team === 2 ? 5 : 6;
    });
    this.players.forEach(function (p) {
      var dx = p.tx - p.x, dz = p.tz - p.z, dd = Math.hypot(dx, dz), sp = dd > 0.3 ? Math.min(p.speed, dd * 2) : 0;
      p.vx += ((dd > 0 ? dx / dd * sp : 0) - p.vx) * Math.min(1, dt * 4); p.vz += ((dd > 0 ? dz / dd * sp : 0) - p.vz) * Math.min(1, dt * 4);
      p.x += p.vx * dt; p.z += p.vz * dt;
      var v = Math.hypot(p.vx, p.vz); p.moving = v > 1.2;
      p.rot = v > 0.5 ? Math.atan2(p.vx, p.vz) : Math.atan2(b.x - p.x, b.z - p.z);
    });
    // ball: carried at hip height, or a pass in flight
    b = this.ballPos(); this.ball.position.set(b.x, b.y, b.z); this.ball.rotation.y = this.carrier ? this.carrier.rot : this.ball.rotation.y + dt * 6;
    this.push();
  };
  Match.prototype.ballPos = function () {
    if (this.flight) { var f = this.flight, u = Math.min(1, f.t / f.dur); return { x: f.from.x + (f.to.x - f.from.x) * u, y: 1.1 + Math.sin(u * Math.PI) * Math.min(4, f.dur * 3), z: f.from.z + (f.to.z - f.from.z) * u }; }
    var c = this.carrier || this.players[0]; return { x: c.x + Math.sin(c.rot) * 0.3, y: 1.05, z: c.z + Math.cos(c.rot) * 0.3 };
  };
  Match.prototype.score = function (team) { People.cheer(); this.kickoff(1 - team); };
  Match.prototype.push = function () { // copy positions into the instance buffers
    var run = People.MODE.run, idle = People.MODE.idle;
    this.slots.forEach(function (s) {
      var p = s[0], a = s[1], i = s[2];
      if (a.iOffset) { a.iOffset.array[i * 3] = p.x; a.iOffset.array[i * 3 + 2] = p.z; a.iOffset.needsUpdate = true; }
      if (a.iRot) { a.iRot.array[i] = p.rot; a.iRot.needsUpdate = true; }
      if (a.iAct) { a.iAct.array[i * 4] = p.moving ? run : idle; a.iAct.needsUpdate = true; }
    });
  };
  window.Match = Match;
})();
