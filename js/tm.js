/* Live event data from Ticketmaster's Discovery API (free key: developer.ticketmaster.com, 5,000 calls/day).
 * - Called straight from the browser, like Ticketmaster's own official tutorial does. Falls back to tools/tm_proxy.py if the browser blocks it.
 * - Refreshes automatically once a day (on open, if the last refresh is older than 24 h) and on demand.
 * - Results are cached in this browser only (localStorage) together with your key. Nothing is sent anywhere else.
 * - The free API has no per-seat availability and (since 2025) almost never prices, so neither is shown. */
(function () {
  var TM = window.TM = { state: "off", cache: {}, onUpdate: null };
  var VENUES = { aviva: "Aviva Stadium", croke: "Croke Park", puc: "Pairc Ui Chaoimh", thomond: "Thomond Park", "3arena": "3Arena", bget: "Bord Gais Energy Theatre" };
  var DAY = 24 * 3600 * 1000, BASE = "https://app.ticketmaster.com/discovery/v2/";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // Key storage. Pentest finding: Chrome and Edge give every HTML file opened from disk the SAME localStorage, so any
  // other local page could read a remembered key. Default is now this tab only (sessionStorage); "Remember" is opt-in.
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  var KEY_RE = /^[A-Za-z0-9]{8,64}$/;
  TM.key = function () { var k = ss("tm.key") || ls("tm.key"); return k && KEY_RE.test(k) ? k : ""; };
  TM.remembered = function () { return KEY_RE.test(ls("tm.key") || ""); };
  TM.setKey = function (k, remember) {
    k = String(k || "").trim(); if (k && !KEY_RE.test(k)) return false;
    ss("tm.key", null); ls("tm.key", null);
    if (k) { if (remember) ls("tm.key", k); else ss("tm.key", k); } else { ls("tm.cache", null); TM.data = null; }
    return true;
  };
  // The cached event list is outside data too: every event is rebuilt through cleanEvent() on load.
  function rebuild(j, hosted) {
    if (!j || typeof j !== "object" || !j.venues || typeof j.venues !== "object" || !(j.at > 0) || j.at > Date.now() + 864e5) return null;
    var v = Object.create(null); Object.keys(VENUES).forEach(function (sid) {
      var a = Object.prototype.hasOwnProperty.call(j.venues, sid) ? j.venues[sid] : null;
      v[sid] = Array.isArray(a) ? a.slice(0, 300).map(function (e) { return cleanEvent(hosted && e && typeof e === "object" ? { id: e.id, type: e.type, name: e.name, date: e.date, time: e.time, status: e.status, url: e.url, seatmap: e.seatmap, src: "Ticketmaster (live)", live: true } : e, { venue: sid }); }).filter(Boolean) : [];
    });
    return { at: j.at, venues: v };
  }
  function load() { try { return rebuild(JSON.parse(ls("tm.cache") || "null")); } catch (e) { return null; } }
  TM.data = load();
  // Public site (Vercel): live events come from /api/events, which keeps the key on the server (api/events.js).
  // No key ever reaches the browser, and the reply is cleaned here like any other outside data.
  TM.hosted = false;
  function loadHosted() {
    if (!/^https?:$/.test(location.protocol) || TM.key() || /[?&]tm=1\b/.test(location.search)) return Promise.resolve(false);
    return fetch("/api/events", { credentials: "omit", headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        var d = rebuild(j, true); if (!d) throw new Error("bad reply");
        TM.hosted = true; TM.data = d; TM.state = "on"; TM.status = ""; TM.renderPanel(); if (TM.onUpdate) TM.onUpdate(); return true;
      })
      .catch(function () { return false; });
  }
  TM.lastAt = function () { return TM.data ? TM.data.at : 0; };
  // Normalise Ticketmaster's classification into the app's event types.
  function typeOf(e) {
    var c = (e.classifications || [])[0] || {}, seg = ((c.segment || {}).name || "").toLowerCase(), gen = ((c.genre || {}).name || "").toLowerCase();
    if (seg === "sports") return /rugby/.test(gen) ? "rugby" : /soccer|football/.test(gen) ? "football" : "sport";
    if (seg === "arts & theatre") return /comedy/.test(gen) ? "comedy" : "theatre";
    if (seg === "family") return "family";
    return "concert";
  }
  function norm(e, sid) {
    var st = (e.dates || {}).start || {};
    if (!st.localDate || !/^\d{4}-\d{2}-\d{2}$/.test(st.localDate)) return null;
    return cleanEvent({ id: "tm-" + String(e.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 90), type: typeOf(e), name: e.name, date: st.localDate,
      time: st.localTime ? String(st.localTime).slice(0, 5) : "", status: ((e.dates || {}).status || {}).code || "", url: e.url,
      seatmap: e.seatmap && e.seatmap.staticUrl, src: "Ticketmaster (live)", live: true }, { venue: sid });
  }
  function getDirect(path) {
    return fetch(BASE + path + (path.indexOf("?") >= 0 ? "&" : "?") + "apikey=" + encodeURIComponent(TM.key()), { mode: "cors" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.fault && j.fault.faultstring) || "HTTP " + r.status); return j; }); });
  }
  function getRelay(path) { return fetch("/tm/discovery/v2/" + path).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }); }); }
  function get(path) {
    if (TM.mode === "relay") return getRelay(path);
    return getDirect(path).then(function (j) { TM.mode = "direct"; return j; }, function (e) {
      if (/^https?:/.test(location.protocol) && e instanceof TypeError) { TM.mode = "relay"; return getRelay(path); } // browser blocked it: try the local relay
      throw e;
    });
  }
  TM.check = function () { TM.state = TM.hosted || TM.key() || /[?&]tm=1\b/.test(location.search) ? "on" : "off"; return Promise.resolve(TM.state === "on"); };
  TM.eventsFor = function (sid) { return (TM.data && Object.prototype.hasOwnProperty.call(TM.data.venues, sid) && TM.data.venues[sid]) || []; };
  // Refresh every venue: 1 venue lookup + 1 event search each (12 calls for 6 venues), spaced to respect 5 requests/second.
  TM.refresh = function () {
    if (!TM.key() && !/[?&]tm=1\b/.test(location.search)) return Promise.reject(new Error("Add your free Ticketmaster key first."));
    if (TM.busy) return TM.busy;
    TM.status = "Refreshing…"; TM.renderPanel();
    var out = { at: Date.now(), venues: {}, errors: {} }, ids = Object.keys(VENUES), today = new Date().toISOString().slice(0, 10);
    TM.busy = ids.reduce(function (p, sid) {
      return p.then(function () {
        return get("venues.json?keyword=" + encodeURIComponent(VENUES[sid]) + "&countryCode=IE&size=5").then(function (j) {
          var vs = (j._embedded && j._embedded.venues) || []; if (!vs.length) throw new Error("venue not found");
          if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(vs[0].id))) throw new Error("unexpected venue id");
          return sleep(250).then(function () { return get("events.json?venueId=" + encodeURIComponent(vs[0].id) + "&size=100&sort=date,asc&startDateTime=" + today + "T00:00:00Z"); });
        }).then(function (e) {
          out.venues[sid] = ((e._embedded && e._embedded.events) || []).map(function (x) { return norm(x, sid); }).filter(Boolean);
        }, function (err) { out.errors[sid] = err.message; out.venues[sid] = (TM.data && TM.data.venues[sid]) || []; }).then(function () { return sleep(250); });
      });
    }, Promise.resolve()).then(function () {
      var ok = Object.keys(out.errors).length < ids.length;
      if (ok) { TM.data = out; ls("tm.cache", JSON.stringify(out)); }
      TM.status = ok ? "" : "Ticketmaster refused every request: " + out.errors[ids[0]];
      TM.busy = null; TM.renderPanel(); if (ok && TM.onUpdate) TM.onUpdate(); return out;
    }, function (e) { TM.busy = null; TM.status = e.message; TM.renderPanel(); throw e; });
    return TM.busy;
  };
  TM.autoRefresh = function () {
    TM.renderPanel();
    loadHosted().then(function (ok) { if (!ok && (TM.key() || /[?&]tm=1\b/.test(location.search)) && Date.now() - TM.lastAt() > DAY) TM.refresh().catch(function () {}); });
  };
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; }
  TM.renderPanel = function () {
    var bar = $("liveBar"); if (!bar) return;
    var n = 0; if (TM.data) Object.keys(TM.data.venues).forEach(function (k) { n += TM.data.venues[k].length; });
    var on = TM.hosted || !!TM.key() || /[?&]tm=1\b/.test(location.search);
    bar.innerHTML = on
      ? "<span class='dot " + (TM.busy ? "busy" : TM.data ? "ok" : "") + "'></span><span><b>Live</b> · Ticketmaster · " + (TM.busy ? "refreshing…" : TM.data ? n + " events · updated " + ago(TM.data.at) : "not loaded yet") + "</span>" +
        (TM.hosted ? "" : "<button type='button' id='liveRefresh' class='iconbtn' aria-label='Refresh live data' title='Refresh now'>↻</button><button type='button' id='liveSet' class='linkbtn'>Settings</button>")
      : "<span class='dot'></span><span>Listed events · checked " + esc(EVENTS.scrapedOn) + "</span><button type='button' id='liveSet' class='linkbtn'>Go live</button>";
    if (TM.status) bar.innerHTML += "<div class='small warnline'>" + esc(TM.status) + "</div>";
    if (TM.hosted) { $("livePanel").innerHTML = ""; $("livePanel").hidden = true; return; } // public site: no key settings at all
    var r = $("liveRefresh"); if (r) r.addEventListener("click", function () { TM.refresh().catch(function () {}); });
    $("liveSet").addEventListener("click", function () { var p = $("livePanel"); p.hidden = !p.hidden; });
    $("livePanel").innerHTML = "<p class='small'>Paste your free <a href='https://developer.ticketmaster.com' target='_blank' rel='noopener noreferrer'>Ticketmaster Discovery API key</a> (sign up → My Apps → Consumer Key). The app then pulls every event at all six venues straight from Ticketmaster and refreshes once a day by itself. The key stays in this browser.</p>" +
      "<div class='pickrow'><input id='tmKey' type='password' autocomplete='off' placeholder='Consumer Key' aria-label='Ticketmaster key' value='" + (TM.key() ? "••••••••" : "") + "'><button type='button' class='primary' id='tmSave'>Save &amp; load</button>" + (TM.key() ? "<button type='button' id='tmForget'>Remove</button>" : "") + "</div>" +
      "<label class='pickrow small'><input id='tmRemember' type='checkbox'" + (TM.remembered() ? " checked" : "") + "> Remember on this device</label>" +
      "<p class='small muted'>Off (recommended): the key is forgotten when you close this tab. On: it is kept in the browser, where — if you opened Seat View as a file in Chrome or Edge — any other HTML file you open from your computer could read it. Safest: run <code>tools\\tm_proxy.py</code> so the key never enters the browser.</p>";
    if (window.__app && __app.framed) { $("livePanel").innerHTML = "<p class='small'>Live data is turned off while Seat View is shown inside another page. Open it directly to use your key.</p>"; return; }
    $("tmSave").addEventListener("click", function () {
      var v = $("tmKey").value; if (/^•+$/.test(v)) { TM.setKey(TM.key(), $("tmRemember").checked); TM.refresh().catch(function () {}); return; }
      if (!TM.setKey(v, $("tmRemember").checked)) { TM.status = "That doesn't look like a Ticketmaster key (letters and numbers only)."; TM.renderPanel(); return; }
      $("livePanel").hidden = true; TM.check(); TM.refresh().catch(function () {});
    });
    var f = $("tmForget"); if (f) f.addEventListener("click", function () { TM.setKey(""); TM.check(); TM.status = ""; TM.renderPanel(); if (TM.onUpdate) TM.onUpdate(); });
  };
  // Show tab: Ticketmaster's details for the selected event, if it came from Ticketmaster.
  TM.render = function (A) {
    var box = $("tmBox"); if (!box) return; var e = A.event;
    if (!e || !e.live || e.src !== "Ticketmaster (live)") { box.innerHTML = ""; return; }
    box.innerHTML = "<div class='card'><b>Ticketmaster (live)</b> · status: " + esc(e.status || "?") + (e.time ? " · " + esc(e.time) : "") +
      (e.url ? "<br><a href='" + esc(e.url) + "' target='_blank' rel='noopener noreferrer'>Open on Ticketmaster ↗</a>" : "") + "</div>" +
      (e.seatmap ? "<figure class='photo'><img alt='Ticketmaster seat map' src='" + esc(e.seatmap) + "'><figcaption>Ticketmaster's official seat map for this event (image © Ticketmaster, shown from their API).</figcaption></figure>" : "");
  };
})();