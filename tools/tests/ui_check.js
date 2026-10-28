/* UI behaviour checks for the redesigned controls (real clicks/taps and keys in headless Chromium).
 *   node tools/tests/ui_check.js        (needs Playwright) — exits 1 if any check fails */
const { chromium } = require("playwright"), path = require("path");
const PAGE = "file://" + path.resolve(__dirname, "../../index.html");
const results = []; function ok(name, pass, info) { results.push({ check: name, pass: !!pass, info: info === undefined ? "" : JSON.stringify(info) }); }
async function open(b, vp, touch, hash) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: !!touch, isMobile: !!touch }), p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(e.message)); await p.route(/^https?:\/\/(?!127)/, (r) => r.fulfill({ status: 404, body: "" }));
  await p.goto(PAGE + "#stadium=" + (hash || "aviva")); await p.waitForFunction(() => window.__app && __app.ready, { timeout: 90000 }); await p.waitForTimeout(800);
  return { ctx, p, errs };
}
const seat = (p) => p.evaluate(() => { const b = __app.model.blocks.find((x) => !x.standing && x.rows > 12); SeatMap.selectSeat(b.rowInfo[10].start + 3); });
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  { // laptop: crowd panel
    const { ctx, p, errs } = await open(b, { width: 1366, height: 768 });
    await seat(p); await p.evaluate(() => __app.setMode("seat")); await p.waitForTimeout(1500);
    ok("crowd panel starts closed", await p.isHidden("#crowdPanel"));
    await p.click("#crowdBtn"); ok("Crowd button opens panel", await p.isVisible("#crowdPanel"), await p.getAttribute("#crowdBtn", "aria-expanded"));
    await p.click('#crowdPanel button[data-d="0.5"]'); ok("How full: Half", await p.evaluate(() => __app.state.density === 0.5));
    ok("Person in front, Wave, Jump live in the Crowd panel", await p.evaluate(() => ["frontBar", "crowdWave", "crowdJump"].every((id) => document.getElementById("crowdPanel").contains(document.getElementById(id)))) && await p.isVisible("#frontBar"));
    await p.click("#crowdWave"); ok("Wave from the panel", await p.evaluate(() => People.U.uWaveOn.value > 0 || People.G.waveOn));
    await p.keyboard.press("Escape");
    ok("view shows only Crowd + Still switch + dock pill", await p.evaluate(() => { const vis = (id) => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).display !== "none"; }; return vis("crowdBtn") && vis("stillSwitch") && vis("dockBtn") && !vis("modeBar") && !vis("crowdPanel"); }));
    await p.click("#stillSwitch"); ok("Still switch on (iOS-style, role=switch)", await p.evaluate(() => People.still === true && document.getElementById("stillToggle").getAttribute("aria-checked") === "true" && document.getElementById("stillToggle").getAttribute("role") === "switch"));
    await p.click("#crowdBtn");
    await p.click("#stillSit"); await p.waitForTimeout(800); ok("Fans are: Sitting (one control, was checkbox + Still-only buttons)", await p.evaluate(() => __app.state.standing === false && document.getElementById("stillSit").getAttribute("aria-pressed") === "true"));
    await p.keyboard.press("Escape"); await p.focus("#stillToggle"); await p.keyboard.press("Space"); ok("Still switch off by keyboard", await p.evaluate(() => People.still === false)); await p.click("#crowdBtn");
    ok("Sitting/Standing offered while Moving", await p.isVisible("#stillSit"));
    await p.fill("#phones", "0.6"); await p.dispatchEvent("#phones", "input"); ok("Phones up slider", await p.evaluate(() => __app.state.phones === 0.6 && document.getElementById("phonesLbl").textContent === "60%"));
    await p.keyboard.press("Escape"); ok("Escape closes crowd panel, focus back on button", await p.isHidden("#crowdPanel") && await p.evaluate(() => document.activeElement.id === "crowdBtn"));
    await p.click("#crowdBtn"); await p.mouse.click(600, 400); ok("Click outside closes crowd panel", await p.isHidden("#crowdPanel"));
    ok("fps hidden without #debug", await p.isHidden("#fps"));
    ok("Person in front only in My view", await p.evaluate(() => { __app.setMode("overview"); return getComputedStyle(document.getElementById("frontBar")).display === "none"; }));
    await p.evaluate(() => __app.setMode("seat")); await p.waitForTimeout(1200);
    ok("hint shows when a view opens, then fades", await p.evaluate(() => document.getElementById("hint").classList.contains("show")) && await p.waitForFunction(() => !document.getElementById("hint").classList.contains("show"), null, { timeout: 30000 }).then(() => true, () => false));
    ok("dock folded by default, pill names the view", await p.isHidden("#modeBar") && (await p.textContent("#dockLbl")) === "My view");
    await p.click("#dockBtn"); ok("dock opens on request", await p.isVisible("#modeBar") && await p.getAttribute("#dockBtn", "aria-expanded") === "true");
    await p.mouse.click(500, 400); await p.waitForTimeout(300); ok("tapping the scene folds the dock", await p.isHidden("#modeBar"));
    await p.click("#dockBtn"); await p.keyboard.press("Escape"); ok("Escape folds the dock", await p.isHidden("#modeBar"));
    await p.click("#dockBtn"); await p.mouse.move(500, 200); await p.waitForTimeout(6800); ok("dock folds itself after 6 s untouched (stays while hovered)", await p.isHidden("#modeBar"));
    ok("events rail moved to menu at 1366", await p.isHidden("#side") && await p.isVisible("#sideToggle"));
    await p.click("#sideToggle"); ok("menu opens events drawer", await p.isVisible("#side"), await p.getAttribute("#sideToggle", "aria-expanded"));
    await p.keyboard.press("Escape"); ok("Escape closes menu", await p.isHidden("#side"));
    // keyboard focus is visible
    await p.keyboard.press("Tab"); const fv = await p.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return { tag: e.tagName, outline: cs.outlineStyle + " " + cs.outlineWidth }; });
    ok("keyboard focus ring visible", /solid 2px/.test(fv.outline), fv);
    ok("laptop: no page errors", !errs.length, errs); await ctx.close();
  }
  { // phone portrait: bottom sheet + menu pickers
    const { ctx, p, errs } = await open(b, { width: 390, height: 844 }, true);
    ok("phone: venue pickers live in the menu", await p.evaluate(() => !!document.querySelector("#menuPickers .pickers")));
    ok("phone: details tabs hidden until the dock is opened", await p.evaluate(() => document.getElementById("panel").getBoundingClientRect().top >= innerHeight - 1));
    await p.tap("#dockBtn"); await p.waitForTimeout(400);
    ok("phone: dock shows views + tab strip", await p.isVisible("#modeBar") && await p.evaluate(() => { const r = document.getElementById("panel").getBoundingClientRect(); return r.height <= 60 && r.top < innerHeight - 40; }));
    await p.tap('#tabs button[data-tab="photos"]'); await p.waitForTimeout(400);
    ok("tab opens sheet on that tab", await p.evaluate(() => document.body.classList.contains("sheetOpen") && document.getElementById("tab-photos").classList.contains("on") && document.getElementById("panel").getBoundingClientRect().height > 400));
    ok("sheet is a dialog and takes focus", await p.evaluate(() => document.getElementById("panel").getAttribute("role") === "dialog" && document.getElementById("panel").contains(document.activeElement)));
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    ok("Escape closes sheet, focus returns to tab", await p.evaluate(() => !document.body.classList.contains("sheetOpen") && document.activeElement.dataset.tab === "photos"));
    await p.tap("#dockBtn"); await p.waitForTimeout(300); await p.tap('#tabs button[data-tab="seat"]'); await p.waitForTimeout(300); await p.tap("#sheetClose"); await p.waitForTimeout(300);
    ok("close button closes sheet", await p.evaluate(() => !document.body.classList.contains("sheetOpen")));
    await p.tap("#sideToggle"); await p.waitForTimeout(300);
    const other = await p.evaluate(() => [...document.getElementById("stadiumSel").options].map((o) => o.value).find((v) => v !== "aviva"));
    await p.selectOption("#stadiumSel", other); await p.waitForFunction((v) => __app.S && __app.S.id === v, other, { timeout: 60000 }).catch(() => {});
    ok("venue change from the menu works", await p.evaluate((v) => __app.S.id === v, other), other);
    ok("phone: no page errors", !errs.length, errs); await ctx.close();
  }
  { // phone landscape: details drawer from the header
    const { ctx, p, errs } = await open(b, { width: 844, height: 390 }, true);
    ok("landscape: Details button shown", await p.isVisible("#sheetOpenBtn"));
    await p.tap("#sheetOpenBtn"); await p.waitForTimeout(400);
    ok("landscape: drawer opens on the right", await p.evaluate(() => { const r = document.getElementById("panel").getBoundingClientRect(); return document.body.classList.contains("sheetOpen") && r.right <= innerWidth + 1 && r.left > innerWidth * 0.4; }));
    await p.keyboard.press("Escape"); ok("landscape: Escape closes drawer", await p.evaluate(() => !document.body.classList.contains("sheetOpen")));
    ok("landscape: no page errors", !errs.length, errs); await ctx.close();
  }
  await b.close();
  console.table(results); const bad = results.filter((r) => !r.pass); console.log(bad.length ? "FAILED " + bad.length + " of " + results.length : "ALL PASS " + results.length); process.exit(bad.length ? 1 : 0);
})();
