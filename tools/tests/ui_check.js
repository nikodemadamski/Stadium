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
    await p.click("#crowdStill"); ok("Motion: Still", await p.evaluate(() => People.still === true && document.getElementById("crowdStill").getAttribute("aria-pressed") === "true"));
    await p.click("#stillSit"); await p.waitForTimeout(800); ok("Fans are: Sitting (one control, was checkbox + Still-only buttons)", await p.evaluate(() => __app.state.standing === false && document.getElementById("stillSit").getAttribute("aria-pressed") === "true"));
    await p.click("#crowdMove"); ok("Sitting still offered while Moving", await p.isVisible("#stillSit"));
    await p.fill("#phones", "0.6"); await p.dispatchEvent("#phones", "input"); ok("Phones up slider", await p.evaluate(() => __app.state.phones === 0.6 && document.getElementById("phonesLbl").textContent === "60%"));
    await p.keyboard.press("Escape"); ok("Escape closes crowd panel, focus back on button", await p.isHidden("#crowdPanel") && await p.evaluate(() => document.activeElement.id === "crowdBtn"));
    await p.click("#crowdBtn"); await p.mouse.click(600, 400); ok("Click outside closes crowd panel", await p.isHidden("#crowdPanel"));
    ok("fps hidden without #debug", await p.isHidden("#fps"));
    ok("Person in front only in My view", await p.isVisible("#frontBar") && await p.evaluate(() => { __app.setMode("overview"); return getComputedStyle(document.getElementById("frontBar")).display === "none"; }));
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
    ok("phone: sheet collapsed to tab strip", await p.evaluate(() => document.getElementById("panel").getBoundingClientRect().height <= 60));
    await p.tap('#tabs button[data-tab="photos"]'); await p.waitForTimeout(400);
    ok("tab opens sheet on that tab", await p.evaluate(() => document.body.classList.contains("sheetOpen") && document.getElementById("tab-photos").classList.contains("on") && document.getElementById("panel").getBoundingClientRect().height > 400));
    ok("sheet is a dialog and takes focus", await p.evaluate(() => document.getElementById("panel").getAttribute("role") === "dialog" && document.getElementById("panel").contains(document.activeElement)));
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    ok("Escape closes sheet, focus returns to tab", await p.evaluate(() => !document.body.classList.contains("sheetOpen") && document.activeElement.dataset.tab === "photos"));
    await p.tap('#tabs button[data-tab="seat"]'); await p.waitForTimeout(300); await p.tap("#sheetClose"); await p.waitForTimeout(300);
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
