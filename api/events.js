/* Public relay for live Ticketmaster events (Vercel serverless function: GET /api/events).
 * The key lives only in the TM_API_KEY environment variable on Vercel: it is never sent to the browser.
 * Abuse protection - visitors cannot spend the Ticketmaster quota:
 *  - one fixed URL with no parameters: anything with a query string is refused, so the CDN cache can't be bypassed;
 *  - the CDN serves one cached copy to everyone for 6 h (s-maxage); this instance also remembers its last result,
 *    and parallel requests share a single refresh, so Ticketmaster sees ~12 calls per refresh, a few refreshes a day;
 *  - after a failed refresh, Ticketmaster is left alone for 5 minutes (and the CDN caches that answer), so an outage
 *    can't be turned into a flood of calls by hammering this URL;
 *  - GET/HEAD only; errors never include Ticketmaster's message (which could echo the key).
 * Output is rebuilt field by field with strict checks; the browser cleans it again with cleanEvent(). */
const VENUES = { aviva: "Aviva Stadium", croke: "Croke Park", puc: "Pairc Ui Chaoimh", thomond: "Thomond Park", "3arena": "3Arena", bget: "Bord Gais Energy Theatre" };
const BASE = "https://app.ticketmaster.com/discovery/v2/";
const FRESH = 6 * 3600 * 1000, BACKOFF = 5 * 60 * 1000, MAX_BYTES = 2000000;
let memo = null, inflight = null, failedAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpsUrl = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u) && u.length < 500 ? u : undefined);
const str = (v, n) => String(v == null ? "" : v).slice(0, n);

async function tm(path, key) {
  const r = await fetch(BASE + path + "&apikey=" + encodeURIComponent(key), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  const text = await r.text();
  if (!r.ok) throw new Error("Ticketmaster HTTP " + r.status);
  if (text.length > MAX_BYTES) throw new Error("reply too large");
  return JSON.parse(text);
}

function typeOf(e) {
  const c = (e.classifications || [])[0] || {}, seg = str((c.segment || {}).name, 40).toLowerCase(), gen = str((c.genre || {}).name, 40).toLowerCase();
  if (seg === "sports") return /rugby/.test(gen) ? "rugby" : /soccer|football/.test(gen) ? "football" : "sport";
  if (seg === "arts & theatre") return /comedy/.test(gen) ? "comedy" : "theatre";
  if (seg === "family") return "family";
  return "concert";
}

function clean(e) {
  if (!e || typeof e !== "object") return null;
  const st = (e.dates || {}).start || {}, id = str(e.id, 90).replace(/[^A-Za-z0-9_-]/g, ""), name = str(e.name, 120);
  if (!id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(str(st.localDate, 10))) return null;
  const out = { id: "tm-" + id, type: typeOf(e), name, date: st.localDate };
  if (/^\d{2}:\d{2}/.test(str(st.localTime, 8))) out.time = st.localTime.slice(0, 5);
  const status = str(((e.dates || {}).status || {}).code, 24).replace(/[^A-Za-z_]/g, "");
  if (status) out.status = status;
  const url = httpsUrl(e.url), seatmap = httpsUrl(e.seatmap && e.seatmap.staticUrl);
  if (url) out.url = url;
  if (seatmap) out.seatmap = seatmap;
  return out;
}

async function refresh(key) {
  const today = new Date().toISOString().slice(0, 10), venues = {};
  let failed = 0;
  for (const [sid, name] of Object.entries(VENUES)) {
    try {
      const v = await tm("venues.json?keyword=" + encodeURIComponent(name) + "&countryCode=IE&size=5", key);
      const vid = String((((v._embedded || {}).venues || [])[0] || {}).id || "");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(vid)) throw new Error("venue not found");
      await sleep(250);
      const ev = await tm("events.json?venueId=" + encodeURIComponent(vid) + "&size=100&sort=date,asc&startDateTime=" + today + "T00:00:00Z", key);
      venues[sid] = ((ev._embedded || {}).events || []).slice(0, 300).map(clean).filter(Boolean);
    } catch (err) {
      failed++; venues[sid] = (memo && memo.venues[sid]) || [];
      console.error("tm " + sid + ": " + err.message); // never logs the key: messages are our own
    }
    await sleep(250); // Ticketmaster allows 5 requests/second
  }
  if (failed === Object.keys(VENUES).length) throw new Error("every venue failed");
  return { at: Date.now(), venues };
}

function send(res, code, body, cache) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache || "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return send(res, 405, { error: "GET only" }); }
  if (String(req.url || "").includes("?")) return send(res, 400, { error: "no parameters accepted" });
  const key = String(process.env.TM_API_KEY || "").trim();
  if (!/^[A-Za-z0-9]{8,64}$/.test(key)) return send(res, 503, { error: "live data not configured" });
  try {
    if ((!memo || Date.now() - memo.at > FRESH) && Date.now() - failedAt > BACKOFF) {
      inflight = inflight || refresh(key).catch((err) => { failedAt = Date.now(); throw err; }).finally(() => { inflight = null; });
      memo = await inflight;
    }
    if (!memo) return send(res, 502, { error: "live data unavailable" }, "public, max-age=60, s-maxage=300");
    const stale = Date.now() - memo.at > FRESH; // only during back-off: cache briefly so the next refresh isn't delayed 6 h
    return send(res, 200, memo, stale ? "public, max-age=60, s-maxage=600" : "public, max-age=600, s-maxage=21600, stale-while-revalidate=86400");
  } catch (err) {
    console.error("tm refresh: " + err.message);
    if (memo) return send(res, 200, memo, "public, max-age=60, s-maxage=600");
    return send(res, 502, { error: "live data unavailable" }, "public, max-age=60, s-maxage=300");
  }
};
