/* Drag direction check for My view (seat) and Camera (phone): real mouse drags and CDP touch drags on the canvas.
 * For each drag it projects a fixed point in the scene (50 m ahead before the drag) and reports which way it moved
 * on screen. "Grab" = the scene follows the finger on both axes, like dragging a photo.
 *   node tools/tests/drag_check.js            (needs Playwright) */
const { chromium } = require("playwright"), path = require("path");
const PAGE = "file://" + path.resolve(__dirname, "../../index.html") + "#stadium=aviva";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, hasTouch: true }), p = await ctx.newPage();
  await p.route(/^https?:\/\/(?!127)/, (r) => r.fulfill({ status: 404, body: "" }));
  await p.goto(PAGE); await p.waitForFunction(() => window.__app && __app.ready, { timeout: 90000 });
  await p.evaluate(() => { const m = __app.model, bk = m.blocks[5]; SeatMap.selectSeat(bk.rowInfo[6].start + 3); });
  const cdp = await ctx.newCDPSession(p), rows = [];
  for (const view of ["seat", "phone"]) {
    await p.evaluate((v) => __app.setMode(v), view); await p.waitForTimeout(1500);
    for (const input of ["mouse", "touch"]) for (const [dir, dx, dy] of [["right", 120, 0], ["left", -120, 0], ["down", 0, 80], ["up", 0, -80]]) {
      const before = await p.evaluate(() => { const A = __app, s = A.state; s.lookYaw = Math.atan2(-s.eye.x, -s.eye.z); s.lookPitch = 0; A.updateCamera();
        const cp = Math.cos(s.lookPitch), d = new THREE.Vector3(Math.sin(s.lookYaw) * cp, Math.sin(s.lookPitch), Math.cos(s.lookYaw) * cp);
        window.__pt = s.eye.clone().add(d.multiplyScalar(50)); return { yaw: s.lookYaw, pitch: s.lookPitch }; });
      await p.waitForTimeout(150);
      const box = await p.locator("#c3d, canvas").first().boundingBox(), x0 = box.x + box.width / 2, y0 = box.y + box.height / 2;
      if (input === "mouse") { await p.mouse.move(x0, y0); await p.mouse.down(); for (let i = 1; i <= 6; i++) await p.mouse.move(x0 + dx * i / 6, y0 + dy * i / 6); await p.mouse.up(); }
      else { const tp = (x, y) => [{ x, y, id: 1 }]; await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(x0, y0) });
        for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(x0 + dx * i / 6, y0 + dy * i / 6) });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
      await p.waitForTimeout(200);
      const after = await p.evaluate((view) => { const A = __app, s = A.state; A.updateCamera(); let cam = A.sc.camera;
        if (view === "phone") { cam = A.sc.phoneCam; const cp = Math.cos(s.lookPitch), d = new THREE.Vector3(Math.sin(s.lookYaw) * cp, Math.sin(s.lookPitch), Math.cos(s.lookYaw) * cp); cam.position.copy(s.eye); cam.lookAt(s.eye.clone().add(d)); cam.updateMatrixWorld(); }
        // where the point was (screen centre) and where it is now, in screen pixels (+x right, +y down)
        const v = __pt.clone().project(cam); return { yaw: s.lookYaw, pitch: s.lookPitch, sx: v.x * innerWidth / 2, sy: -v.y * innerHeight / 2 }; }, view);
      const moved = Math.abs(after.sx) > Math.abs(after.sy) ? (after.sx > 0 ? "right" : "left") : (after.sy > 0 ? "down" : "up");
      const still = Math.hypot(after.sx, after.sy) < 2;
      rows.push({ view, input, drag: dir, sceneMoved: still ? "none" : moved, grab: !still && moved === dir, dYaw: +(after.yaw - before.yaw).toFixed(3), dPitch: +(after.pitch - before.pitch).toFixed(3) });
    }
  }
  console.table(rows); const bad = rows.filter((r) => !r.grab); console.log(bad.length ? "NOT GRAB: " + bad.length + " of " + rows.length : "ALL GRAB: " + rows.length + " of " + rows.length);
  await b.close(); process.exit(bad.length ? 1 : 0);
})();
