/* Left sidebar: every announced concert (js/data/events.js — scraped from official pages), as a list by artist or a month calendar. */
(function () {
  var SB = window.Sidebar = {}, A, cur = null, monthOffset = 0, mode = "list", q = "", tf = "all";
  var GROUP = { concert: "concert", rugby: "sport", football: "sport", sport: "sport", theatre: "theatre", comedy: "theatre", family: "theatre" };
  function today() { return new Date().toISOString().slice(0, 10); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function all() {
    var out = [], seen = {}, t = today();
    STADIUMS.forEach(function (S) { (EVENTS[S.id] || []).concat(TM.eventsFor(S.id)).forEach(function (e) {
      if (!e || !/^[A-Za-z0-9_-]{1,100}$/.test(e.id) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return; // defence in depth
      var k = S.id + e.date + e.name.toLowerCase().slice(0, 8); if (seen[k]) return; seen[k] = 1;
      e.past = (e.until || e.date) < t; out.push({ e: e, S: S });
    }); });
    return out.sort(function (a, b) { return a.e.date < b.e.date ? -1 : 1; });
  }
  SB.init = function (app) {
    A = app;
    $("sideList").addEventListener("click", function () { mode = "list"; SB.render(); });
    $("sideCal").addEventListener("click", function () { mode = "cal"; SB.render(); });
    $("sideToggle").addEventListener("click", function (e) { e.stopPropagation(); var open = document.body.classList.toggle("sideOpen"); this.setAttribute("aria-expanded", open); if (open) $("side").querySelector("select, input, button:not(#sideClose)").focus(); });
    new MutationObserver(function () { $("sideToggle").setAttribute("aria-expanded", document.body.classList.contains("sideOpen")); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    $("sideClose").addEventListener("click", function () { document.body.classList.remove("sideOpen"); });
    document.addEventListener("click", function (e) { // tap outside the drawer closes it
      if (document.body.classList.contains("sideOpen") && !e.target.closest("#side")) { document.body.classList.remove("sideOpen"); e.stopPropagation(); e.preventDefault(); }
    }, true);
    $("sideQ").addEventListener("input", function () { q = this.value.toLowerCase(); SB.render(); });
    document.querySelectorAll(".typechips button").forEach(function (b) { b.addEventListener("click", function () {
      tf = b.dataset.t; document.querySelectorAll(".typechips button").forEach(function (x) { x.classList.toggle("on", x === b); }); SB.render();
    }); });
    TM.renderPanel();
    var first = all().filter(function (x) { return !x.e.past; })[0];
    if (first) { var d = new Date(first.e.date + "T12:00:00"), now = new Date(); monthOffset = (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth(); }
    SB.render();
  };
  SB.setCurrent = function (id) { cur = id; SB.render(); };
  SB.render = function () {
    $("sideList").classList.toggle("on", mode === "list"); $("sideCal").classList.toggle("on", mode === "cal");
    var items = all().filter(function (x) { return (!q || (x.e.name + " " + (x.e.tour || "") + " " + x.S.name + " " + x.S.city).toLowerCase().indexOf(q) >= 0) && (tf === "all" || GROUP[x.e.type || "concert"] === tf); }), body = $("sideBody");
    if (mode === "list") {
      var by = {}; items.forEach(function (x) { (by[x.e.name] = by[x.e.name] || []).push(x); });
      var names = Object.keys(by).sort(function (a, b) { var pa = by[a].every(function (x) { return x.e.past; }), pb = by[b].every(function (x) { return x.e.past; }); return pa !== pb ? (pa ? 1 : -1) : (by[a][0].e.date < by[b][0].e.date ? -1 : 1); });
      body.innerHTML = names.map(function (n) {
        var xs = by[n], past = xs.every(function (x) { return x.e.past; });
        var ty = xs[0].e.type || "concert";
        return "<div class='artist" + (past ? " past" : "") + "'><div class='an'><span class='av t-" + ty + "'>" + esc(n.charAt(0)) + "</span>" + esc(n) + (past ? " <span class='badge'>past</span>" : "") + "</div>" +
          xs.slice(0, 8).map(function (x) {
            var d = new Date(x.e.date + "T12:00:00");
            return "<button type='button' class='date" + (x.e.id === cur ? " on" : "") + "' data-ev='" + esc(x.e.id) + "' data-s='" + esc(x.S.id) + "'><span class='dd'><b>" + d.toLocaleDateString(undefined, { day: "numeric" }) + "</b>" + d.toLocaleDateString(undefined, { month: "short" }) + "<i>" + d.toLocaleDateString(undefined, { weekday: "short" }) + " " + d.getFullYear() + "</i></span><span>" + esc(x.S.name) + "<i>" + esc(x.S.city) + (x.e.time ? " · " + esc(x.e.time) : "") + (x.e.live ? " · <span class='livetag'>LIVE</span>" : "") + "</i></span></button>";
          }).join("") + (xs.length > 8 ? "<p class='small muted'>+" + (xs.length - 8) + " more dates — use the calendar</p>" : "") + "</div>";
      }).join("") + (names.length ? "" : "<p class='small muted'>No concerts match.</p>") +
        "<p class='small muted'>Listed events come from official venue, club and ticket pages (each links to its source in the Show tab). Turn on Live to add Ticketmaster's full, daily-refreshed list.</p>";
    } else {
      var now = new Date(), m = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), y = m.getFullYear(), mo = m.getMonth();
      var start = (m.getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate(), cells = [], key = "";
      for (var i = 0; i < start; i++) cells.push("<div class='c e'></div>");
      for (var d = 1; d <= days; d++) {
        key = y + "-" + String(mo + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        var evs = items.filter(function (x) { return x.e.date === key; });
        cells.push("<div class='c" + (evs.length ? " has" : "") + "'><span class='n'>" + d + "</span>" + evs.map(function (x) {
          return "<button type='button' class='chip" + (x.e.id === cur ? " on" : "") + "' data-ev='" + esc(x.e.id) + "' data-s='" + esc(x.S.id) + "' title='" + esc(x.e.name + " · " + x.S.name) + "'>" + esc(x.e.name) + "<i>" + esc(x.S.name.split(" ")[0]) + "</i></button>";
        }).join("") + "</div>");
      }
      var ym = key.slice(0, 7), count = items.filter(function (x) { return x.e.date.slice(0, 7) === ym; }).length;
      var months = {}; items.forEach(function (x) { months[x.e.date.slice(0, 7)] = 1; });
      body.innerHTML = "<div class='calhead'><button type='button' id='calPrev' aria-label='Previous month'>‹</button><b>" + m.toLocaleDateString(undefined, { month: "long", year: "numeric" }) + "</b><button type='button' id='calNext' aria-label='Next month'>›</button></div>" +
        "<div class='cal'>" + ["M", "T", "W", "T", "F", "S", "S"].map(function (x) { return "<div class='c h'>" + x + "</div>"; }).join("") + cells.join("") + "</div>" +
        "<p class='small muted'>" + (count ? count + " concert" + (count > 1 ? "s" : "") + " this month." : "No announced concerts this month.") + "</p><div class='jump'>" +
        Object.keys(months).sort().map(function (k) { return "<button type='button' data-m='" + k + "'>" + new Date(k + "-01T12:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" }) + "</button>"; }).join("") + "</div>";
      $("calPrev").addEventListener("click", function () { monthOffset--; SB.render(); });
      $("calNext").addEventListener("click", function () { monthOffset++; SB.render(); });
      body.querySelectorAll("[data-m]").forEach(function (a) { a.addEventListener("click", function () { var t = new Date(a.dataset.m + "-01T12:00:00"); monthOffset = (t.getFullYear() - now.getFullYear()) * 12 + t.getMonth() - now.getMonth(); SB.render(); }); });
    }
    var on = body.querySelector(".on[data-ev]"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
    body.querySelectorAll("[data-ev]").forEach(function (b) { b.addEventListener("click", function () { document.body.classList.remove("sideOpen"); A.openEvent(b.dataset.s, b.dataset.ev); }); });
  };
})();
