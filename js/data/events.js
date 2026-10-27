/* Concerts scraped from official venue / ticketing pages on 23 Oct 2026. Every event links to the page it was read from.
 * The app ALSO checks MusicBrainz live (if the browser allows it) and adds any extra upcoming concerts it finds, tagged "MusicBrainz". */
/* type: concert | rugby | football | theatre | comedy | family. Sport events use the sport layout (no stage, every stand open). */
window.EVENT_TYPES = { concert: "Concert", rugby: "Rugby", football: "Football", theatre: "Theatre", comedy: "Comedy", family: "Family", sport: "Sport" };
window.EVENTS = {
  scrapedOn: "2026-10-23", // every list re-checked this date; Ticketmaster live (if a key is set) refreshes daily on top
  aviva: [
    { id: "aviva-noah-kahan-2027-07-17", name: "Noah Kahan", tour: "The Last of the Bugs Tour", date: "2027-07-17",
      src: "Aviva Stadium official calendar", url: "https://www.avivastadium.ie/whats-on" },
    { id: "aviva-noah-kahan-2027-07-18", name: "Noah Kahan", tour: "The Last of the Bugs Tour", date: "2027-07-18",
      src: "Ticketmaster.ie (official ticket agent)", url: "https://www.ticketmaster.ie/discover/dublin?categoryId=KZFzniwnSyZfZ7v7nJ" }
    , { id: "aviva-urc-leinster-munster-2026-10-24", type: "rugby", name: "Leinster v Munster", tour: "United Rugby Championship", date: "2026-10-24", time: "18:00",
      src: "Aviva Stadium official calendar", url: "https://www.avivastadium.ie/whats-on" }
    , { id: "aviva-ireland-argentina-2026-11-06", type: "rugby", name: "Ireland v Argentina", tour: "Nations Championship", date: "2026-11-06", time: "20:10",
      src: "Irish Rugby official fixtures", url: "https://www.irishrugby.ie/fixture/list/91" }
    , { id: "aviva-fai-cup-final-2026-11-08", type: "football", name: "Derry City v Waterford", tour: "Men's FAI Cup Final", date: "2026-11-08", time: "15:00", note: "Derry fans North Stand, Waterford South Stand (FAI)",
      src: "Aviva Stadium official event page", url: "https://www.avivastadium.ie/whats-on/2026fai-mens-cup-final" }
    , { id: "aviva-ireland-fiji-2026-11-14", type: "rugby", name: "Ireland v Fiji", tour: "Nations Championship", date: "2026-11-14", time: "20:10",
      src: "Irish Rugby official fixtures", url: "https://www.irishrugby.ie/fixture/list/91" }
    , { id: "aviva-roi-kosovo-2026-11-17", type: "football", name: "Republic of Ireland v Kosovo", tour: "UEFA Nations League", date: "2026-11-17", time: "19:45",
      src: "Aviva Stadium official event page", url: "https://www.avivastadium.ie/whats-on/uefa-nations-league-republic-of-ireland-v-kosovo" }
    , { id: "aviva-ireland-southafrica-2026-11-21", type: "rugby", name: "Ireland v South Africa", tour: "Nations Championship", date: "2026-11-21", time: "16:40",
      src: "Irish Rugby official fixtures", url: "https://www.irishrugby.ie/fixture/list/91" }
    , { id: "aviva-wnt-poland-2026-12-05", type: "football", name: "Republic of Ireland v Poland", tour: "Women's World Cup play-off final", date: "2026-12-05",
      src: "Aviva Stadium official calendar", url: "https://www.avivastadium.ie/whats-on" }
    , { id: "aviva-ireland-england-2027-02-05", type: "rugby", name: "Ireland v England", tour: "Six Nations 2027", date: "2027-02-05", time: "20:10",
      src: "Irish Rugby official fixtures", url: "https://www.irishrugby.ie/fixture/list/91" }
    , { id: "aviva-ireland-france-2027-03-13", type: "rugby", name: "Ireland v France", tour: "Six Nations 2027", date: "2027-03-13", time: "20:10",
      src: "Irish Rugby official fixtures", url: "https://www.irishrugby.ie/fixture/list/91" }
  ],
  croke: [
    { id: "croke-harry-styles-2027-08-18", name: "Harry Styles", tour: "Together, Together", date: "2027-08-18",
      src: "Croke Park official news", url: "https://crokepark.ie/news-and-events/harry-styles-at-croke-park-2027" },
    { id: "croke-harry-styles-2027-08-20", name: "Harry Styles", tour: "Together, Together", date: "2027-08-20",
      src: "Croke Park official news", url: "https://crokepark.ie/news-and-events/harry-styles-at-croke-park-2027" },
    { id: "croke-harry-styles-2027-08-21", name: "Harry Styles", tour: "Together, Together", date: "2027-08-21",
      src: "Croke Park official news", url: "https://crokepark.ie/news-and-events/harry-styles-at-croke-park-2027" }
  ],
  thomond: [
    { id: "thomond-amble-2027-07-03", name: "Amble", date: "2027-07-03",
      src: "Thomond Park official news", url: "https://thomondpark.ie/amble-announce-major-2027-show-at-thomond-park/" },
    { id: "thomond-robbie-williams-2027-07-06", name: "Robbie Williams", tour: "RW27", date: "2027-07-06", note: "Sold out (official)",
      src: "Thomond Park official news", url: "https://thomondpark.ie/robbie-williams-announces-only-irish-show-of-2027-at-thomond-park/" },
    { id: "thomond-robbie-williams-2027-07-07", name: "Robbie Williams", tour: "RW27", date: "2027-07-07",
      src: "Thomond Park official news", url: "https://thomondpark.ie/robbie-williams-announces-only-irish-show-of-2027-at-thomond-park/" },
    { id: "thomond-kingfishr-2027-07-09", name: "Kingfishr", date: "2027-07-09",
      src: "Thomond Park official news", url: "https://thomondpark.ie/kingfishr-add-second-thomond-park-show-following-huge-demand/" },
    { id: "thomond-kingfishr-2027-07-10", name: "Kingfishr", date: "2027-07-10",
      src: "Thomond Park official news", url: "https://thomondpark.ie/kingfishr-add-second-thomond-park-show-following-huge-demand/" }
    , { id: "thomond-munster-sharks-2026-10-31", type: "rugby", name: "Munster v Sharks", tour: "United Rugby Championship", date: "2026-10-31", time: "17:30",
      src: "Munster Rugby official fixtures", url: "https://www.munsterrugby.ie/fixture/list/14" }
    , { id: "thomond-munster-leinster-2026-12-27", type: "rugby", name: "Munster v Leinster", tour: "United Rugby Championship", date: "2026-12-27", time: "19:45",
      src: "Munster Rugby official fixtures", url: "https://www.munsterrugby.ie/fixture/list/14" }
    , { id: "thomond-munster-gloucester-2027-01-16", type: "rugby", name: "Munster v Gloucester", tour: "Champions Cup", date: "2027-01-16", time: "17:30",
      src: "Munster Rugby official fixtures", url: "https://www.munsterrugby.ie/fixture/list/14" }
    , { id: "thomond-munster-connacht-2027-01-23", type: "rugby", name: "Munster v Connacht", tour: "United Rugby Championship", date: "2027-01-23", time: "19:45",
      src: "Munster Rugby official fixtures", url: "https://www.munsterrugby.ie/fixture/list/14" }
    , { id: "thomond-munster-ospreys-2027-03-20", type: "rugby", name: "Munster v Ospreys", tour: "United Rugby Championship", date: "2027-03-20", time: "17:30",
      src: "Munster Rugby official fixtures", url: "https://www.munsterrugby.ie/fixture/list/14" }
    , { id: "thomond-munster-ulster-2027-05-08", type: "rugby", name: "Munster v Ulster", tour: "United Rugby Championship", date: "2027-05-08", time: "17:15",
      src: "Munster Rugby official fixtures", url: "https://www.munsterrugby.ie/fixture/list/14" }
  ],
  puc: [
    // No upcoming concerts were announced on any source checked (Songkick lists 0 upcoming). Most recent real concert kept, marked PAST.
    { id: "puc-zach-bryan-2026-06-20", name: "Zach Bryan", date: "2026-06-20", past: true,
      src: "Cork GAA official concert guide", url: "https://gaacork.ie/2026/06/15/zach-bryan-at-pairc-ui-chaoimh-2026-everything-you-need-to-know/" },
    { id: "puc-zach-bryan-2026-06-21", name: "Zach Bryan", date: "2026-06-21", past: true,
      src: "Cork GAA official concert guide", url: "https://gaacork.ie/2026/06/15/zach-bryan-at-pairc-ui-chaoimh-2026-everything-you-need-to-know/" }
  ],
  "3arena": [
    { id: "3arena-the-script-2026-10-30", type: "concert", name: "The Script", tour: "The Man in the Arena Tour", date: "2026-10-30", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-the-script-2026-10-31", type: "concert", name: "The Script", tour: "The Man in the Arena Tour", date: "2026-10-31", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-stevie-wonder-2026-11-01", type: "concert", name: "Stevie Wonder", tour: "Songs In The Key of Life 50th Anniversary", date: "2026-11-01", src: "Love Dublin (third-party)", url: "https://www.lovedublin.org/stevie-wonder-songs-in-the-key-of-life-3arena-dublin-2026/" },
    { id: "3arena-niall-horan-2026-11-09", type: "concert", name: "Niall Horan", tour: "Dinner Party Live", date: "2026-11-09", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-niall-horan-2026-11-10", type: "concert", name: "Niall Horan", tour: "Dinner Party Live", date: "2026-11-10", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-niall-horan-2026-11-12", type: "concert", name: "Niall Horan", tour: "Dinner Party Live", date: "2026-11-12", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-niall-horan-2026-11-13", type: "concert", name: "Niall Horan", tour: "Dinner Party Live", date: "2026-11-13", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-jacksons-2026-11-15", type: "concert", name: "The Jacksons and Sister Sledge", date: "2026-11-15", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-phoebe-bridgers-2026-11-23", type: "concert", name: "Phoebe Bridgers", tour: "The Lost Tour", date: "2026-11-23", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-phoebe-bridgers-2026-11-24", type: "concert", name: "Phoebe Bridgers", tour: "The Lost Tour", date: "2026-11-24", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" },
    { id: "3arena-bryson-tiller-2026-12-01", type: "concert", name: "Bryson Tiller", date: "2026-12-01", src: "Songkick (third-party)", url: "https://www.songkick.com/metro-areas/29314-ireland-dublin/december-2026" },
    { id: "3arena-placebo-2026-12-02", type: "concert", name: "Placebo", tour: "30th Anniversary Tour", date: "2026-12-02", src: "Songkick (third-party)", url: "https://www.songkick.com/metro-areas/29314-ireland-dublin/december-2026" },
    { id: "3arena-sex-pistols-2026-12-07", type: "concert", name: "Sex Pistols", date: "2026-12-07", src: "Songkick (third-party)", url: "https://www.songkick.com/metro-areas/29314-ireland-dublin/december-2026" },
    { id: "3arena-the-pogues-2026-12-09", type: "concert", name: "The Pogues", tour: "Greatest Hits Tour", date: "2026-12-09", src: "The Dean Hotels Dublin gig guide (third-party)", url: "https://thedeanhotels.com/locations/dublin-centre/whats-on/concerts-and-live-music" }
  ],
  bget: [
    { id: "bget-high-society-2026-10-20", type: "theatre", name: "High Society", date: "2026-10-20", until: "2026-10-24", note: "Runs to 2026-10-24", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-katherine-jenkins-2026-10-25", type: "concert", name: "Katherine Jenkins", date: "2026-10-25", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-carmen-2026-11-02", type: "theatre", name: "Carmen", date: "2026-11-02", until: "2026-11-07", note: "Runs to 2026-11-07", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-leslie-odom-jr-2026-11-05", type: "concert", name: "Leslie Odom Jr. in Concert", date: "2026-11-05", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-choir-of-man-2026-11-10", type: "theatre", name: "The Choir of Man", date: "2026-11-10", until: "2026-11-14", note: "Runs to 2026-11-14", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-heathers-2026-11-17", type: "theatre", name: "Heathers", date: "2026-11-17", until: "2026-11-21", note: "Runs to 2026-11-21", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-anna-lapwood-2026-11-22", type: "concert", name: "Anna Lapwood", date: "2026-11-22", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-silence-of-the-lambs-2026-11-24", type: "theatre", name: "The Silence of the Lambs", date: "2026-11-24", until: "2026-11-28", note: "Runs to 2026-11-28", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-harry-enfield-2026-11-29", type: "comedy", name: "Harry Enfield and No Chums", date: "2026-11-29", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-mrs-doubtfire-2026-12-02", type: "theatre", name: "Mrs. Doubtfire", date: "2026-12-02", until: "2027-01-03", note: "Runs to 2027-01-03", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-celine-byrne-2026-12-14", type: "concert", name: "Celine Byrne – A Christmas Celebration", date: "2026-12-14", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" },
    { id: "bget-paw-patrol-2027-01-15", type: "family", name: "PAW Patrol Live! Heroes Unite", date: "2027-01-15", until: "2027-01-17", note: "Runs to 2027-01-17", src: "Bord Gáis Energy Theatre official listing", url: "https://www.bordgaisenergytheatre.ie/shows-listing/" }
  ],
  noneUpcoming: {
    puc: { text: "No upcoming concerts announced (checked 23 Oct 2026).", url: "https://www.songkick.com/venues/70088-pairc-ui-chaoimh" }
  }
};
