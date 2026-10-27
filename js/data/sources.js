/* Source & licence registry. status: official | third-party | community | own-work | placeholder. Checked 23 Oct 2026. */
window.safeUrl = function (u) { u = String(u == null ? "" : u).trim(); return /^https?:\/\//i.test(u) ? u.replace(/["'<>\s]/g, encodeURIComponent) : ""; };
/* Outside data (Ticketmaster, MusicBrainz, the browser's storage, share links) is never trusted.
 * cleanEvent() rebuilds an event from scratch, keeping only fields that pass strict format checks.
 * Pentest finding (24 Oct 2026): a crafted MusicBrainz reply or a planted storage value could inject HTML through an
 * event id or date. Validation here + escaping at every output + a hash-only script CSP close that path. */
window.cleanEvent = function (e, extra) {
  if (!e || typeof e !== "object") return null;
  var id = String(e.id == null ? "" : e.id), date = String(e.date || ""), until = e.until == null ? "" : String(e.until), time = e.time == null ? "" : String(e.time);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  var out = { id: id, date: date, name: String(e.name == null ? "" : e.name).slice(0, 120), type: Object.prototype.hasOwnProperty.call(window.EVENT_TYPES || {}, e.type) ? e.type : "concert",
    src: String(e.src || "").slice(0, 80), url: safeUrl(e.url) };
  if (!out.name) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(until)) out.until = until;
  if (/^\d{2}:\d{2}$/.test(time)) out.time = time;
  if (e.tour) out.tour = String(e.tour).slice(0, 120);
  if (e.note) out.note = String(e.note).slice(0, 160);
  if (e.status) out.status = String(e.status).replace(/[^A-Za-z_]/g, "").slice(0, 24);
  if (e.seatmap) out.seatmap = safeUrl(e.seatmap);
  if (e.live) out.live = true;
  if (extra) for (var k in extra) out[k] = extra[k];
  return out;
};
window.SOURCES = {
  aviva_official_home: { title: "Aviva Stadium — official site (capacity 51,711)", url: "https://www.avivastadium.ie/", status: "official" },
  aviva_official_findseat: { title: "Aviva Stadium — Finding Your Seat (block / row letter / seat scheme)", url: "https://www.avivastadium.ie/getting-here/finding-your-seat", status: "official" },
  wiki_aviva: { title: "Wikipedia — Aviva Stadium (field 106 × 68 m; 65,000 concert capacity)", url: "https://en.wikipedia.org/wiki/Aviva_Stadium", status: "community" },
  mapaplan_blocks: { title: "MapaPlan — Aviva block list & row-letter ranges (plans are copyright, link only)", url: "https://www.mapaplan.com/seating-plan/dublin-aviva-stadium-lansdowne-road-arena-seat-row-numbers-chart/dublin-aviva-stadium-arena-seating-plan.htm", status: "third-party" },
  seatingplan_net: { title: "SeatingPlan.net — Aviva block order; concert plan omits blocks 129–141", url: "https://www.seatingplan.net/aviva-stadium/standing", status: "third-party" },
  wiki_croke: { title: "Wikipedia — Croke Park (82,300 total; 69,100 seated; 13,200 terraced; field 145 × 88 m)", url: "https://en.wikipedia.org/wiki/Croke_Park", status: "community" },
  croke_official: { title: "Croke Park — official site", url: "https://crokepark.ie/", status: "official" },
  stadiuminsight_croke: { title: "StadiumInsight — Croke Park numbering (Level 3 / 5 / 7; Hill 16 lettered; no readable official section list)", url: "https://stadiuminsight.com/stadiums/croke-park/", status: "third-party" },
  dublinjournal_croke: { title: "Dublin Journal — Croke Park rows A–Z then AA–WW (citing fan guide)", url: "https://dublinjournal.com/tech/seat-number-croke-park-seating-plan/", status: "third-party" },
  cork_gaa_seating: { title: "Cork GAA — Páirc Uí Chaoimh seating plan (45,000; 21,000 seated N+S stands; 24,000 terraces; Row A nearest pitch)", url: "https://gaacork.ie/paircuichaoimh/thestadium/seating-plan-1/", status: "official" },
  wiki_puc: { title: "Wikipedia — Páirc Uí Chaoimh (field 144 × 88 m)", url: "https://en.wikipedia.org/wiki/P%C3%A1irc_U%C3%AD_Chaoimh", status: "community" },
  ticketmaster_zach_puc: { title: "Zach Bryan @ Páirc Uí Chaoimh event info — family area on Blackrock End terrace", url: "https://happeningnext.com/event/zach-bryan-with-heaven-on-tour-eid3fkbc6xueq", status: "third-party" },
  wiki_thomond: { title: "Wikipedia — Thomond Park (25,100 since Oct 2025; 15,100 seated)", url: "https://en.wikipedia.org/wiki/Thomond_Park", status: "community" },
  thomond_official: { title: "Thomond Park — official event news", url: "https://thomondpark.ie/category/events/", status: "official" },
  irelandreport_thomond: { title: "Ireland Report — Thomond Park rows A–Z, AA–QQ (citing TickPick)", url: "https://irelandreport.net/blog/thomond-park-seating-plan-guide/", status: "third-party" },
  irelandview_thomond: { title: "Ireland View — Thomond 'just over 25,000 for concerts'", url: "https://www.irelandview.com/3294-robbie-williams-schedules-extra-date-what-fans-should-know-about-tickets.php", status: "third-party" },
  wiki_irish_stadiums: { title: "Wikipedia — List of stadiums in Ireland by capacity", url: "https://en.wikipedia.org/wiki/List_of_stadiums_in_Ireland_by_capacity", status: "community" },
  musicbrainz: { title: "MusicBrainz API — live event check (core data CC0)", url: "https://musicbrainz.org/doc/About/Data_License", status: "official" },
  threejs: { title: "three.js r97 — MIT licence (built into the file)", url: "https://threejs.org/license", status: "official" },
  own_work: { title: "3D stands, crowd, stages and performer are drawn by this app from the data above. No 3D models or stage designs are copied.", url: "", status: "own-work" },
  apple_iphone17pro: { title: "Apple — iPhone 17 Pro tech specs (13 / 24 / 48 / 100 / 200 mm, digital zoom to 40×)", url: "https://support.apple.com/en-us/125090", status: "official" },
  tm_ism: { title: "Ticketmaster Help — how its interactive seat map works (blue = matches filters, grey = doesn't; used as the design reference)", url: "https://help.ticketmaster.ie/hc/en-ie/articles/360020403138-What-is-the-interactive-seat-map-and-how-do-I-use-it", status: "official" },
  tm_api: { title: "Ticketmaster Discovery API (events, status, seat-map image; no per-seat availability)", url: "https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/", status: "official" },
  user_tm_shot: { title: "Your Ticketmaster screenshot of the Aviva map (block order 101–141 / 301–331 / 501–529 checked against it)", url: "", status: "official" },
  kenney_people: { title: "Kenney — Mini Characters (12 rigged people), CC0 1.0", url: "https://kenney.nl/assets/mini-characters", status: "own-work" },
  wiki_3arena: { title: "Wikipedia — 3Arena (9,300 seated / 13,000 with standing; furthest seat 60 m from stage)", url: "https://en.wikipedia.org/wiki/3Arena_(Dublin)", status: "community" },
  arena_findseat: { title: "3Arena — official Find a Seat (blocks A–G / H–P, rows 1–32 / 33–53, flat floor rows A–P)", url: "https://3arena.ie/plan-your-visit/find-a-seat", status: "official" },
  arena_events: { title: "3Arena — official events page", url: "https://3arena.ie/events/", status: "official" },
  bget_plan: { title: "Bord Gáis Energy Theatre — official seating layout (Stalls / Circle / Upper Circle)", url: "https://bordgais.madcraft.digital/wp-content/uploads/2020/07/New_Seating_Plan_BGET-1.pdf", status: "official" },
  bget_capacity: { title: "Vivid Seats — Bord Gáis Energy Theatre capacity 2,111 (third-party)", url: "https://www.vividseats.com/bord-gais-energy-theatre-tickets/venue/14508", status: "third-party" },
  bget_shows: { title: "Bord Gáis Energy Theatre — official shows listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/", status: "official" },
  aviva_whatson: { title: "Aviva Stadium — official event calendar", url: "https://www.avivastadium.ie/whats-on", status: "official" },
  munster_fixtures: { title: "Munster Rugby — official fixtures", url: "https://www.munsterrugby.ie/fixture/list/14", status: "official" },
  tm_tutorial: { title: "Ticketmaster — official browser tutorial calling the Discovery API directly", url: "https://developer.ticketmaster.com/products-and-docs/tutorials/events-search/search_events_with_discovery_api.html", status: "official" },
  avfms: { title: "A View From My Seat — real fan seat photos (copyright of uploaders — link only)", url: "https://aviewfrommyseat.co.uk/", status: "third-party" }
};
/* Real photos. Licence of every file verified on its Wikimedia Commons page (23 Oct 2026). Shown unmodified, hot-linked, with credit. */
window.PHOTOS = [
  { stadium: "aviva", file: "Aviva_Stadium_seen_from_Block_312.jpg", caption: "View from Block 312 (Level 3), 7 Apr 2012", author: "wynnert", licence: "CC BY-SA 2.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0/", page: "https://commons.wikimedia.org/wiki/File:Aviva_Stadium_seen_from_Block_312.jpg", blocks: ["312"] },
  { stadium: "aviva", file: "Aviva_Stadium._View_from_the_North_Stand_-_panoramio.jpg", caption: "View from the North Stand, 7 Sep 2010", author: "Robin Pollard", licence: "CC BY 3.0", licenceUrl: "https://creativecommons.org/licenses/by/3.0/", page: "https://commons.wikimedia.org/wiki/File:Aviva_Stadium._View_from_the_North_Stand_-_panoramio.jpg", stand: "North" },
  { stadium: "aviva", file: "Aviva_Stadium_from_North_Stand.jpg", caption: "From the North Stand, 4 Aug 2010", author: "Hoops341", licence: "CC BY 3.0", licenceUrl: "https://creativecommons.org/licenses/by/3.0/", page: "https://commons.wikimedia.org/wiki/File:Aviva_Stadium_from_North_Stand.jpg", stand: "North" },
  { stadium: "aviva", file: "Dublin_aviva_stadium.jpg", caption: "Aerial view, 30 Jul 2023", author: "Arne Müseler / arne-mueseler.com", licence: "CC-BY-SA-3.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/deed.de", page: "https://commons.wikimedia.org/wiki/File:Dublin_aviva_stadium.jpg", creditFormat: "Photo: Arne Müseler / arne-mueseler.com / CC-BY-SA-3.0", authorUrl: "https://www.arne-mueseler.com" },
  { stadium: "croke", file: "U2_360°_Tour_at_Croke_Park.jpg", caption: "U2 360° Tour concert at Croke Park, 24 Jul 2009 (in-the-round stage)", author: "Kristian Strobech", licence: "CC BY 2.0", licenceUrl: "https://creativecommons.org/licenses/by/2.0/", page: "https://commons.wikimedia.org/wiki/File:U2_360%C2%B0_Tour_at_Croke_Park.jpg", concert: true },
  { stadium: "croke", file: "Croke_Park_from_the_Hill_-_2004_All-Ireland_Football_Championship_Final.jpg", caption: "View from Hill 16, All-Ireland Final 2004", author: "John H. Nolan", licence: "Public domain", licenceUrl: "https://commons.wikimedia.org/wiki/File:Croke_Park_from_the_Hill_-_2004_All-Ireland_Football_Championship_Final.jpg", page: "https://commons.wikimedia.org/wiki/File:Croke_Park_from_the_Hill_-_2004_All-Ireland_Football_Championship_Final.jpg", stand: "Hill 16" },
  { stadium: "croke", file: "Croke_park.jpg", caption: "Croke Park, Aug 2005", author: "Jcmurphy (English Wikipedia)", licence: "CC BY-SA 3.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/wiki/File:Croke_park.jpg" },
  { stadium: "croke", file: "Croke_park_all_ireland.jpg", caption: "Croke Park, Mar 2007", author: "Tolivero", licence: "Public domain", licenceUrl: "https://commons.wikimedia.org/wiki/File:Croke_park_all_ireland.jpg", page: "https://commons.wikimedia.org/wiki/File:Croke_park_all_ireland.jpg" },
  { stadium: "puc", file: "Páirc_Uí_Chaoimh.jpg", caption: "Páirc Uí Chaoimh panorama, 28 Jul 2017", author: "Charlesolivercork", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:P%C3%A1irc_U%C3%AD_Chaoimh.jpg" },
  { stadium: "thomond", file: "Thomond_Park,_July_2025.jpg", caption: "Thomond Park exterior, 17 Jul 2025", author: "William Murphy (infomatique)", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Thomond_Park,_July_2025.jpg" },
  { stadium: "thomond", file: "Thomond_Park.jpg", caption: "Thomond Park, 1 Nov 2008", author: "James Corbett", licence: "CC BY-SA 2.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0/", page: "https://commons.wikimedia.org/wiki/File:Thomond_Park.jpg" }
];
