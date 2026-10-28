/* Feature regression sweep: every existing feature still works after the UI pass.
 * Venues x event types (concert / sport where the venue has one) x desktop mouse / phone touch.
 *   node tools/tests/regression_check.js [venue ...]     exits 1 on any failure or page error */
const { chromium } = require("playwright"), path = require("path");
const PAGE = "file://" + path.resolve(__dirname, "../../index.html");
const VENUES = process.argv.slice(2).length ? process.argv.slice(2) : ["aviva", "croke", "3arena", "bget"];
const rows = [];
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const venue of VENUES) for (const [dev, vp, touch] of [["desktop", { width: 1366, height: 768 }, false], ["phone", { width: 390, height: 844 }, true]]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, acceptDownloads: true }), p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(e.message)); await p.route(/^https?:\/\/(?!127)/, (r) => r.fulfill({ status: 404, body: "" }));
    await p.goto(PAGE + "#stadium=" + venue); await p.waitForFunction(() => window.__app && __app.ready, { timeout: 90000 });
    const evs = await p.evaluate(() => { const o = [...document.getElementById("eventSel").options].map((x) => ({ v: x.value, t: x.textContent }));
      const sport = o.find((x) => /rugby|football|hurling|gaelic|match| v /i.test(x.t)), con = o.find((x) => !/rugby|football|hurling|gaelic|match| v /i.test(x.t)); return [con, sport].filter(Boolean); });
    for (const ev of evs) {
      const r = { venue, dev, event: ev.t.slice(0, 34) }, chk = (k, v) => { r[k] = v ? "ok" : "FAIL"; };
      if (touch) { await p.tap("#sideToggle"); await p.waitForTimeout(300); } await p.selectOption("#eventSel", ev.v); if (touch) r.menuClosed = (await p.isHidden("#side")) ? "ok" : "FAIL"; await p.waitForTimeout(1500);
      chk("eventLoads", await p.evaluate((v) => __app.state.event && String(__app.state.event.id) === v || document.getElementById("eventSel").value === v, ev.v));
      // map: search, filters, surprise, list
      await p.evaluate(() => { __app.setMode("map"); SeatMap.clearSel(); SeatMap.back(); SeatMap.back(); }); await p.waitForTimeout(500); // search lives at stadium level
      const q = await p.evaluate(() => { const b = __app.model.blocks.find((x) => x.official && x.rows > 10); return b ? b.id + " " + b.rowLabels[3] + " 4" : null; });
      if (q) { await p.fill("#seatSearch", q); await p.press("#seatSearch", "Enter"); await p.waitForTimeout(600); chk("search", await p.evaluate(() => __app.state.seatIdx >= 0 && SeatMap.focusRow === 3)); } else r.search = "n/a (no official ids)";
      await p.evaluate(() => { SeatMap.clearSel(); SeatMap.back(); SeatMap.back(); }); await p.waitForTimeout(500);
      if (await p.isHidden("#mapFilters")) await p.click("#mapFiltersBtn"); chk("filters open", await p.isVisible("#fDist")); await p.click("#surprise"); await p.waitForTimeout(600); chk("surprise", await p.evaluate(() => __app.state.seatIdx >= 0));
      await p.evaluate(() => { SeatMap.clearSel(); SeatMap.back(); SeatMap.back(); }); await p.waitForTimeout(400);
      if (touch) { await p.tap('#tabs button[data-tab="seat"]'); await p.waitForTimeout(300); }
      await p.locator("#mapList li[data-b]").first().click(); await p.waitForTimeout(600); chk("list -> section", await p.evaluate(() => SeatMap.focusBlock >= 0));
      if (touch) await p.evaluate(() => __app.sheet(false));
      // seat, 3D modes, compare, share, camera
      await p.evaluate(() => { const b = __app.model.blocks[SeatMap.focusBlock]; SeatMap.zoomToRow(SeatMap.focusBlock, Math.min(5, b.rows - 1)); SeatMap.selectSeat(b.rowInfo[Math.min(5, b.rows - 1)].start); }); await p.waitForTimeout(500);
      await p.click("#mapShare"); await p.waitForTimeout(300); chk("share", await p.evaluate(() => /#.*seat|stadium=/.test(location.hash) && document.getElementById("shareMsg").textContent.length > 0));
      for (const m of ["overview", "seat", "phone"]) { await p.evaluate((m) => __app.setMode(m), m); await p.waitForTimeout(1200); }
      chk("modes", await p.evaluate(() => __app.state.mode === "phone"));
      const dl = p.waitForEvent("download", { timeout: 15000 }).catch(() => null); await p.click("#shutter"); const d = await dl; chk("camera photo", !!d);
      await p.evaluate(() => __app.setMode("seat")); await p.waitForTimeout(800);
      const cmp = await p.$("#cmpAdd"); if (cmp) { await p.evaluate(() => document.getElementById("cmpAdd").click()); await p.waitForTimeout(800); chk("compare", await p.evaluate(() => !document.getElementById("compare").hidden)); }
      // crowd + show controls
      await p.click("#crowdBtn"); await p.click('#crowdPanel button[data-d="0"]'); await p.waitForTimeout(300); chk("crowd empty", await p.evaluate(() => __app.state.density === 0 && __app.sc.visiblePeople() === 0));
      await p.click('#crowdPanel button[data-d="1"]'); await p.click("#crowdBtn");
      await p.click("#crowdWave"); chk("wave", await p.evaluate(() => People.U.uWaveOn.value > 0 || People.G.waveOn));
      const presets = await p.$$("#presetBtns button"); if (presets.length > 1) { await p.evaluate(() => document.querySelectorAll("#presetBtns button")[1].click()); await p.waitForTimeout(1500); chk("stage preset", await p.evaluate(() => !!__app.sc)); }
      r.errors = errs.length ? errs.slice(0, 2).join(" | ") : 0; rows.push(r); errs.length = 0;
    }
    // events rail: calendar + live panel
    if (!touch) { await p.click("#sideToggle"); await p.click("#sideCal"); const cal = await p.isVisible(".cal"); await p.click("#sideList"); const live = await p.$("#liveSet"); if (live) await live.click(); rows.push({ venue, dev, event: "(events menu)", calendar: cal ? "ok" : "FAIL", live: live ? (await p.isVisible("#livePanel") ? "ok" : "FAIL") : "n/a", errors: errs.length ? errs.join(" | ") : 0 }); }
    await ctx.close();
  }
  await b.close(); console.table(rows);
  const bad = rows.filter((r) => Object.values(r).some((v) => v === "FAIL") || r.errors); console.log(bad.length ? "FAILED rows: " + bad.length : "ALL PASS (" + rows.length + " rows)"); process.exit(bad.length ? 1 : 0);
})();
