export const GOLDIE_ENGINE_NAME = "Goldie";
export const GOLDIE_ENGINE_VERSION = "goldie-v1.0.0-playbook-80";
export const GOLDIE_MIN_HIT_RATE = 80;

function clampOdd(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 1 ? v : 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function normName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function compact(value) {
  return normName(value).replace(/\s+/g, "");
}
export function namesMatch(name, aliases) {
  const hay = compact(name);
  if (!hay) return false;
  return (aliases || []).some((alias) => {
    const needle = compact(alias);
    if (!needle) return false;
    return hay === needle || hay.includes(needle) || needle.includes(hay);
  });
}
export function sideOf(fixture, aliases) {
  if (namesMatch(fixture.home, aliases)) return "home";
  if (namesMatch(fixture.away, aliases)) return "away";
  return null;
}
function blob(fixture) {
  return `${normName(fixture.country)} ${normName(fixture.league)}`;
}

export function matchCompetition(fixture) {
  const b = blob(fixture);
  const league = normName(fixture.league);
  const compactLeague = compact(fixture.league);
  if (/\bwomen\b|\bwsl\b|\bnwsl\b/.test(b)) return null;
  if (/uefa youth|youth league/.test(b)) return "youth-league";
  if (/netherlands|holland/.test(b) && /eerste|keuken kampioen|kkd/.test(b) && !/eredivisie/.test(b)) return "eerste";
  if (/netherlands|holland/.test(b) && /eredivisie/.test(b) && !/vrouw|women|eerste/.test(b)) return "eredivisie";
  if (/ukraine/.test(b) && /persha|first league/.test(b)) return "ukraine-persha";
  if (/ukraine/.test(b) && /premier/.test(b) && !/persha/.test(b)) return "ukraine-premier";
  if (/turkey/.test(b) && (/1 lig|1\. lig|tff 1|first league/.test(b)) && !/super/.test(league)) return "turkey-1-lig";
  if (/turkey/.test(b) && /super lig/.test(b)) return "turkey-super-lig";
  if (/austria/.test(b) && /2 liga|2\. liga|second league/.test(b)) return "austria-2";
  if (/austria/.test(b) && /regionalliga/.test(b) && /east|ost/.test(b)) return "regionalliga-east";
  if (/austria/.test(b) && /bundesliga/.test(b) && !/2/.test(league)) return "austria-bundesliga";
  if (/belgium/.test(b) && /acff/.test(b)) return "belgium-acff";
  if (/belgium/.test(b) && (/national division 1|nationale 1/.test(b) && /vv/.test(b) || /division 1 vv|eerste nationale vv/.test(b))) return "belgium-vv";
  if (/belgium/.test(b) && /jupiler|pro league/.test(b) && !/challenger|women|u21/.test(b)) return "jupiler";
  if (/belgium/.test(b) && /challenger/.test(b)) return "challenger";
  if (/denmark/.test(b) && /1st division|1 division|first division/.test(b)) return "denmark-1";
  if (/england/.test(b) && /championship/.test(league) && !/women/.test(b)) return "championship";
  if (/england/.test(b) && /league one/.test(league) && !/women/.test(b)) return "league-one";
  if (/england/.test(b) && /league two/.test(league)) return "league-two";
  if (/england/.test(b) && /fa cup/.test(b) && !/trophy/.test(b)) return "fa-cup";
  if (/england/.test(b) && /premier league 2|pl cup|u21/.test(b)) return "pl-cup-u21";
  if (/england/.test(b) && /premier league/.test(league) && !/2|women|u21/.test(league)) return "epl";
  if (/france/.test(b) && /ligue 1/.test(b) && !/women/.test(b)) return "ligue-1";
  if (/serbia/.test(b) && /super/.test(b)) return "serbia";
  if (/costa rica/.test(b) && /ascenso/.test(b)) return "costa-rica-ascenso";
  if (/qatar/.test(b) && /stars|qsl/.test(b)) return "qatar";
  if (/greece/.test(b) && /super league/.test(b)) return "greece";
  if (/italy/.test(b) && /serie a/.test(league) && !/b|c|women|cup/.test(league)) return "serie-a";
  if (/spain/.test(b) && (/laliga/.test(compactLeague) || /primera division/.test(league)) && !/2|laliga2|rfef/.test(compactLeague)) return "laliga";
  if (/finland/.test(b) && /ykkosliiga/.test(b)) return "finland-ykkos";
  if (/estonia/.test(b) && /esiliiga b/.test(b)) return "esiliiga-b";
  if (/estonia/.test(b) && /esiliiga/.test(b) && !/\bb\b/.test(league)) return "esiliiga";
  if (/uzbekistan/.test(b) && /super/.test(b)) return "uzbekistan";
  if (/sweden/.test(b) && /sodra svealand|södra svealand|division 2/.test(b) && /svealand|sodra/.test(b)) return "sweden-sodra";
  if (/sweden/.test(b) && /allsvenskan/.test(b) && !/superettan|women/.test(b)) return "allsvenskan";
  if (/sweden/.test(b) && /superettan/.test(b)) return "superettan";
  if (/norway/.test(b) && /eliteserien/.test(b)) return "eliteserien";
  if (/brazil/.test(b) && /serie a|serie a betano|brasileiro/.test(b) && !/serie b|serie c|copa|u20/.test(b)) return "brazil-a";
  if (/brazil/.test(b) && /serie b/.test(b)) return "brazil-b";
  if (/iran/.test(b) && /pro league|persian/.test(b)) return "iran";
  if (/china/.test(b) && /league one|jia b|china league 1/.test(b)) return "china-league-one";
  if (/china/.test(b) && /super league/.test(b)) return "csl";
  if (/chile/.test(b) && /ascenso|primera b/.test(b)) return "chile-ascenso";
  if (/portugal/.test(b) && /liga portugal|primeira/.test(b) && !/2|3/.test(league)) return "portugal";
  if (/latvia/.test(b) && /virsliga/.test(b)) return "latvia";
  if (/iraq/.test(b) && /stars/.test(b)) return "iraq";
  if (/egypt/.test(b) && /premier/.test(b)) return "egypt-pl";
  if (/egypt/.test(b) && /division 2|second division/.test(b)) return "egypt-div2";
  if (/germany/.test(b) && /regionalliga/.test(b) && /nordost|northeast|north east|nord ost/.test(b)) return "regionalliga-ne";
  if (/germany/.test(b) && /bundesliga/.test(league) && !/2|3/.test(league)) return "bundesliga";
  if (/usa|united states/.test(b) && (/\bmls\b/.test(b) || /major league soccer/.test(b)) && !/next/.test(b)) return "mls";
  if (/georgia/.test(b) && /erovnuli/.test(b)) return "georgia";
  if (/colombia/.test(b) && /primera b/.test(b)) return "colombia-b";
  return null;
}

function deriveDc(h, d, a) {
  const ih = 1 / h;
  const id = 1 / d;
  const ia = 1 / a;
  const s = ih + id + ia;
  if (!(s > 0)) return { dc1x: 0, dc12: 0, dcx2: 0 };
  return {
    dc1x: round2(1 / ((ih + id) / s)),
    dc12: round2(1 / ((ih + ia) / s)),
    dcx2: round2(1 / ((id + ia) / s))
  };
}
function deriveDnb(h, a, side) {
  if (!(h > 1) || !(a > 1)) return 0;
  const ih = 1 / h;
  const ia = 1 / a;
  const p = side === "home" ? ih / (ih + ia) : ia / (ih + ia);
  return p > 0 ? round2(1 / p) : 0;
}
export function priceOf(fixture, key) {
  const o = fixture.odds || {};
  const line = Number(o.ouLine) || 0;
  switch (key) {
    case "home":
      return clampOdd(o.home);
    case "away":
      return clampOdd(o.away);
    case "dc-1x":
      return clampOdd(o.dc1x) || clampOdd(deriveDc(o.home, o.draw, o.away).dc1x);
    case "dc-x2":
      return clampOdd(o.dcx2) || clampOdd(deriveDc(o.home, o.draw, o.away).dcx2);
    case "dnb-home":
      return clampOdd(deriveDnb(o.home, o.away, "home"));
    case "dnb-away":
      return clampOdd(deriveDnb(o.home, o.away, "away"));
    case "over-15":
      return line === 1.5 ? clampOdd(o.over) : 0;
    case "over-25":
      return line === 2.5 ? clampOdd(o.over) : 0;
    case "under-25":
      return line === 2.5 ? clampOdd(o.under) : 0;
    case "btts-yes":
      return clampOdd(o.bttsYes);
    default:
      return 0;
  }
}

function favorite(fixture) {
  const h = clampOdd(fixture.odds?.home);
  const a = clampOdd(fixture.odds?.away);
  if (!h || !a) return null;
  if (h <= a) return { side: "home", odd: h, name: fixture.home };
  return { side: "away", odd: a, name: fixture.away };
}
function impliedGap(fixture) {
  const h = clampOdd(fixture.odds?.home);
  const a = clampOdd(fixture.odds?.away);
  if (!h || !a) return 0;
  return Math.abs(1 / Math.min(h, a) - 1 / Math.max(h, a));
}

function isBanned(key, selection) {
  const k = String(key || "").toLowerCase();
  const s = String(selection || "").toLowerCase();
  if (k === "dc-12" || k === "12") return true;
  if (/\b12\b/.test(`${k} ${s}`)) return true;
  if (/home or away|either team to win|home\/away/.test(s)) return true;
  return false;
}

function r(id, tier, hitRate, comp, type, teams = [], extra = {}) {
  return { id: String(id), tier, hitRate, comp, type, teams, ...extra };
}

// Playbook 01–226. Rule 52 (Serie A Top 4 vs Bottom 3) is omitted: fail-closed without standings.
export const GOLDIE_RULES = [
  r("01", 1, 100, "eerste", "team-ml", ["heracles almelo", "heracles"]),
  r("02", 1, 100, "eerste", "fade-dc", ["top oss"]),
  r("03", 1, 100, "eerste", "team-over25", ["heracles almelo", "heracles"]),
  r("04", 1, 100, "eerste", "team-btts", ["helmond sport", "helmond"]),
  r("05", 1, 100, "eerste", "team-over15", ["helmond sport", "helmond"]),
  r("06", 1, 100, "eerste", "team-over15", ["nac breda"]),
  r("07", 1, 100, "eerste", "team-over15", ["vvv venlo", "vvv"]),
  r("08", 1, 100, "eerste", "team-over15", ["de graafschap", "graafschap"]),
  r("09", 1, 100, "eerste", "team-over15", ["fc den bosch", "den bosch"]),
  r("10", 1, 100, "eerste", "team-over15", ["rkc waalwijk", "waalwijk"]),
  r("11", 1, 100, "eerste", "team-dc", ["rkc waalwijk", "waalwijk"]),
  r("12", 1, 100, "ukraine-persha", "fade-dc", ["probiy horodenka", "probiy"]),
  r("13", 1, 100, "ukraine-persha", "team-dc", ["viktoria"]),
  r("14", 1, 100, "ukraine-persha", "team-dc", ["oleksandriya", "oleksandria"]),
  r("15", 1, 100, "ukraine-persha", "team-over15", ["kulikiv"]),
  r("16", 1, 100, "ukraine-persha", "team-over15", ["probiy horodenka", "probiy"]),
  r("17", 1, 100, "ukraine-premier", "fade-dc", ["obolon"]),
  r("18", 1, 100, "ukraine-premier", "fade-dc", ["kudrivka"]),
  r("19", 1, 100, "ukraine-premier", "team-under25", ["livyi bereg", "livyj bereh"]),
  r("20", 1, 100, "ukraine-premier", "team-over15", ["karpaty lviv", "karpaty"]),
  r("21", 1, 100, "turkey-1-lig", "fade-dc", ["boluspor"]),
  r("22", 1, 100, "turkey-1-lig", "team-over15", ["batman petrolspor", "batman"]),
  r("23", 1, 100, "turkey-1-lig", "team-over15", ["fatih karagumruk", "karagumruk"]),
  r("24", 1, 100, "turkey-1-lig", "team-over15", ["sariyer"]),
  r("25", 1, 100, "turkey-1-lig", "team-over15", ["vanspor fk", "vanspor"]),
  r("26", 1, 100, "turkey-1-lig", "team-over15", ["keciorengucu"]),
  r("27", 1, 100, "turkey-1-lig", "team-over15", ["istanbulspor"]),
  r("28", 1, 100, "turkey-1-lig", "team-over15", ["boluspor"]),
  r("29", 1, 100, "austria-2", "team-over25", ["liefering"]),
  r("30", 1, 100, "belgium-vv", "league-over15"),
  r("31", 1, 100, "denmark-1", "team-dc", ["vejle boldklub", "vejle"]),
  r("32", 1, 100, "denmark-1", "team-dc", ["hvidovre if", "hvidovre"]),
  r("33", 1, 100, "denmark-1", "team-over25", ["vejle boldklub", "vejle"], { venue: "home" }),
  r("34a", 1, 100, "championship", "team-btts", ["southampton"]),
  r("34b", 1, 100, "championship", "team-over15", ["southampton"]),
  r("35", 1, 100, "belgium-acff", "team-ml", ["rwdm brussels", "rwdm"]),
  r("36", 1, 100, "belgium-vv", "team-ml", ["kvc houtvenne", "houtvenne"]),
  r("37", 1, 100, "jupiler", "team-dc", ["royale union sg", "union sg", "union saint gilloise", "union st gilloise"]),
  r("38", 1, 100, "austria-bundesliga", "team-ml", ["lask linz", "lask"]),
  r("39", 1, 100, "austria-bundesliga", "team-dc", ["salzburg", "red bull salzburg", "rb salzburg"]),
  r("40", 1, 100, "austria-bundesliga", "home-fav-dc", [], { homeMax: 1.65 }),
  r("41", 1, 100, "fa-cup", "gap-fav-ml", [], { gapMin: 0.4 }),
  r("42a", 1, 100, "epl", "team-ml", ["arsenal"]),
  r("42b", 1, 100, "epl", "team-ml", ["manchester city", "man city"]),
  r("43a", 1, 100, "epl", "team-over25", ["chelsea"]),
  r("43b", 1, 100, "epl", "team-btts", ["chelsea"]),
  r("44a", 1, 100, "eredivisie", "team-over25", ["psv eindhoven", "psv"]),
  r("44b", 1, 100, "eredivisie", "team-btts", ["psv eindhoven", "psv"]),
  r("45a", 1, 100, "ligue-1", "team-over25", ["paris saint germain", "paris sg", "psg"]),
  r("45b", 1, 100, "ligue-1", "team-btts", ["paris saint germain", "paris sg", "psg"]),
  r("46", 1, 100, "epl", "team-dc", ["liverpool"]),
  r("47", 1, 100, "epl", "home-fav-dc", [], { homeMax: 1.5 }),
  r("48", 1, 100, "serbia", "named-fav-ml", ["crvena zvezda", "red star belgrade", "red star"], { favMax: 1.4 }),
  r("49", 1, 100, "costa-rica-ascenso", "team-dc", ["adr jicaral", "jicaral"]),
  r("50", 1, 100, "qatar", "named-fav-ml", ["al sadd", "al-sadd"], { favMax: 1.5 }),
  r("51", 1, 100, "greece", "big-home-ml", ["olympiacos", "olympiakos", "paok thessaloniki", "paok", "aek athens", "aek", "panathinaikos"], { homeMax: 1.35 }),
  r("53a", 1, 100, "laliga", "named-fav-ml", ["real madrid"], { favMax: 1.4 }),
  r("53b", 1, 100, "laliga", "named-fav-ml", ["barcelona"], { favMax: 1.4 }),
  r("54", 1, 100, "finland-ykkos", "heavy-fav-ml", [], { favMax: 1.35 }),
  r("55", 2, 96.6, "esiliiga-b", "team-over15", ["parnu jk vaprus u21", "parnu vaprus u21", "vaprus u21"]),
  r("56", 2, 96.4, "esiliiga-b", "team-over15", ["tallinna kalev u21", "kalev u21"]),
  r("57", 2, 96.4, "esiliiga-b", "team-over15", ["jk tabasalu", "tabasalu"]),
  r("58", 2, 96.3, "esiliiga", "team-over15", ["tallinna kalev", "kalev"]),
  r("59", 2, 95.2, "uzbekistan", "team-dc", ["pakhtakor tashkent", "pakhtakor"]),
  r("60", 2, 95.0, "sweden-sodra", "team-over15", ["ifk haninge", "haninge"]),
  r("61", 2, 95.0, "allsvenskan", "team-over15", ["hammarby"]),
  r("62", 2, 95.0, "allsvenskan", "team-over15", ["brommapojkarna"]),
  r("63", 2, 94.7, "eliteserien", "team-over15", ["aalesund"]),
  r("64", 2, 94.4, "eliteserien", "team-over15", ["rosenborg"]),
  r("65", 2, 94.1, "eliteserien", "team-over15", ["ik start", "start"]),
  r("66", 2, 93.3, "eredivisie", "league-over15"),
  r("67", 2, 93.1, "esiliiga", "team-over15", ["flora u21"]),
  r("68", 2, 92.9, "esiliiga", "team-over15", ["tartu welco", "welco"]),
  r("69", 2, 92.3, "brazil-a", "team-over15", ["flamengo"]),
  r("70", 2, 92.1, "iran", "league-under25", [], { drawMax: 2.95 }),
  r("71", 2, 92.0, "csl", "team-over15", ["zhejiang professional", "zhejiang"]),
  r("72", 2, 91.7, "chile-ascenso", "team-dc", ["cobreloa"], { venue: "home" }),
  r("73", 2, 91.7, "brazil-b", "home-fav-dnb", [], { homeMax: 1.55 }),
  r("74", 2, 90.9, "china-league-one", "team-dc", ["guangdong gz power", "guangdong gz-power", "gz power"]),
  r("75", 2, 90.5, "eerste", "league-over15", [], { drawMin: 3.7 }),
  r("76", 2, 90.5, "sweden-sodra", "team-over15", ["smedby ais", "smedby"]),
  r("77", 2, 90.5, "china-league-one", "team-over15", ["dingnan ganlian", "dingnan"]),
  r("78", 2, 90.5, "allsvenskan", "team-over15", ["orgryte"]),
  r("79", 2, 90.4, "allsvenskan", "league-over15", [], { drawMin: 4.0 }),
  r("80", 2, 90.0, "esiliiga-b", "league-over15"),
  r("81", 2, 90.0, "ligue-1", "away-dc", [], { awayMax: 2.6 }),
  r("82", 2, 90.0, "allsvenskan", "team-over15", ["sirius"]),
  r("83", 3, 89.7, "esiliiga-b", "team-over25", ["parnu jk vaprus u21", "parnu vaprus u21", "vaprus u21"]),
  r("84", 3, 89.7, "turkey-1-lig", "league-over15", [], { drawMin: 3.4 }),
  r("85", 3, 89.7, "esiliiga", "team-over25", ["flora u21"]),
  r("86", 3, 89.7, "esiliiga", "team-over15", ["fc tallinn"]),
  r("87", 3, 89.6, "esiliiga-b", "league-over15", [], { drawMin: 4.0 }),
  r("88", 3, 89.3, "esiliiga-b", "team-over25", ["tammeka u21"]),
  r("89", 3, 89.3, "esiliiga-b", "team-over15", ["tammeka u21"]),
  r("90", 3, 89.3, "esiliiga-b", "team-over15", ["levadia u19"]),
  r("91", 3, 89.3, "esiliiga-b", "team-over15", ["johvi phoenix"]),
  r("92", 3, 89.3, "esiliiga-b", "team-over15", ["tulevik"]),
  r("93", 3, 89.3, "brazil-a", "home-fav-dc", [], { homeMax: 1.75 }),
  r("94", 3, 89.3, "esiliiga", "team-over15", ["nomme kalju u21", "kalju u21"]),
  r("95", 3, 88.9, "eliteserien", "team-over15", ["viking fk", "viking"]),
  r("96", 3, 88.9, "eliteserien", "team-over15", ["lillestrom sk", "lillestrom"]),
  r("97", 3, 88.9, "eliteserien", "team-over15", ["kfum oslo"]),
  r("98", 3, 88.9, "eliteserien", "team-over15", ["hamkam"]),
  r("99", 3, 88.9, "esiliiga-b", "fade-dc", ["tjk legion", "legion"]),
  r("100", 3, 88.9, "esiliiga-b", "team-over15", ["tjk legion", "legion"]),
  r("101", 3, 88.9, "austria-bundesliga", "home-fav-ml", [], { homeMax: 1.65 }),
  r("102", 3, 88.5, "csl", "team-over15", ["yunnan yukun", "yukun"]),
  r("103", 3, 88.5, "csl", "team-over15", ["shanghai shenhua", "shenhua"]),
  r("104", 3, 88.5, "brazil-a", "team-dc", ["palmeiras"]),
  r("105", 3, 88.2, "eliteserien", "team-over15", ["bodo glimt", "bodo/glimt"]),
  r("106", 3, 88.2, "eliteserien", "team-over15", ["sk brann", "brann"]),
  r("107", 3, 88.2, "eliteserien", "team-dc", ["bodo glimt", "bodo/glimt"]),
  r("108", 3, 88.0, "brazil-a", "team-over15", ["chapecoense"]),
  r("109", 3, 87.8, "esiliiga", "league-over15", [], { drawMin: 3.8 }),
  r("110", 3, 87.5, "uzbekistan", "heavy-fav-ml", [], { favMax: 1.4 }),
  r("111", 3, 87.1, "eerste", "league-over15"),
  r("112", 3, 87.1, "league-two", "home-fav-dc"),
  r("113", 3, 87.0, "csl", "heavy-fav-dc", [], { favMax: 1.4 }),
  r("114", 3, 86.8, "latvia", "named-fav-ml", ["fk rfs", "rfs", "riga fc"], { favMax: 1.25 }),
  r("115", 3, 86.8, "iraq", "league-home-dc", [], { drawMax: 3.15 }),
  r("116", 3, 86.7, "turkey-1-lig", "league-under25", [], { drawMax: 3.15 }),
  r("117", 3, 86.7, "portugal", "named-fav-ml", ["benfica", "porto", "sporting cp", "sporting lisbon", "sporting"], { favMax: 1.35, avoid: ["benfica", "porto", "sporting cp", "sporting lisbon", "sporting"] }),
  r("118", 3, 86.6, "esiliiga", "league-over15"),
  r("119", 3, 86.4, "league-one", "league-over15"),
  r("120", 3, 86.2, "esiliiga-b", "team-over15", ["tartu kalev"]),
  r("121", 3, 86.2, "esiliiga", "team-over15", ["levadia u21"]),
  r("122", 3, 86.0, "eliteserien", "league-over15", [], { drawMin: 3.7 }),
  r("123", 3, 85.7, "esiliiga-b", "team-over25", ["tallinna kalev u21", "kalev u21"]),
  r("124", 3, 85.7, "esiliiga-b", "team-btts", ["tallinna kalev u21", "kalev u21"]),
  r("125", 3, 85.7, "esiliiga-b", "team-btts", ["tammeka u21"]),
  r("126", 3, 85.7, "esiliiga-b", "team-btts", ["johvi phoenix"]),
  r("127", 3, 85.7, "esiliiga-b", "team-over25", ["tulevik"]),
  r("128", 3, 85.7, "eerste", "team-over15", ["jong az"]),
  r("129", 3, 85.7, "eerste", "team-over25", ["jong az"]),
  r("130", 3, 85.7, "eerste", "team-over15", ["jong psv"]),
  r("131", 3, 85.7, "eerste", "team-btts", ["jong psv"]),
  r("132", 3, 85.7, "eerste", "team-over15", ["jong ajax"]),
  r("133", 3, 85.7, "eerste", "team-over15", ["jong utrecht"]),
  r("134", 3, 85.7, "eerste", "team-btts", ["jong utrecht"]),
  r("135", 3, 85.7, "esiliiga", "team-over15", ["nomme utd u21", "nomme united u21"]),
  r("136", 3, 85.7, "sweden-sodra", "team-over15", ["ik sleipner", "sleipner"]),
  r("137", 3, 85.7, "sweden-sodra", "team-over15", ["foc farsta", "farsta"]),
  r("138", 3, 85.7, "sweden-sodra", "team-over15", ["bk forward", "forward"]),
  r("139", 3, 85.7, "sweden-sodra", "team-over15", ["eker orebro"]),
  r("140", 3, 85.7, "ukraine-persha", "team-dc", ["kulikiv"]),
  r("141", 3, 85.7, "ukraine-persha", "team-dc", ["sc poltava", "poltava"]),
  r("142", 3, 85.7, "ukraine-persha", "team-over15", ["fenix mariupol"]),
  r("143", 3, 85.7, "turkey-1-lig", "team-dc", ["bursaspor"]),
  r("144", 3, 85.7, "turkey-1-lig", "team-dc", ["batman petrolspor", "batman"]),
  r("145", 3, 85.7, "turkey-1-lig", "team-dc", ["mardin 1969", "mardin"]),
  r("146", 3, 85.7, "turkey-1-lig", "team-dc", ["keciorengucu"]),
  r("147", 3, 85.7, "turkey-1-lig", "team-dc", ["bandirmaspor"]),
  r("148", 3, 85.7, "turkey-1-lig", "team-dc", ["muglaspor"]),
  r("149", 3, 85.7, "turkey-1-lig", "team-over15", ["antalyaspor"]),
  r("150", 3, 85.7, "turkey-1-lig", "team-over15", ["sivasspor"]),
  r("151", 3, 85.7, "turkey-1-lig", "team-over15", ["manisa fk", "manisa"]),
  r("152", 3, 85.7, "turkey-1-lig", "team-over15", ["pendikspor"]),
  r("153", 3, 85.7, "egypt-pl", "league-under25", [], { drawMax: 2.75 }),
  r("154", 3, 85.7, "championship", "team-over25", ["west ham", "west ham united"]),
  r("155", 3, 85.4, "league-two", "league-home-dc"),
  r("156", 3, 85.2, "eliteserien", "league-over15"),
  r("157", 3, 85.0, "sweden-sodra", "team-over25", ["syrianska fc", "syrianska"]),
  r("158", 3, 85.0, "sweden-sodra", "team-over15", ["ragsveds if", "ragsved"]),
  r("159", 3, 85.0, "sweden-sodra", "team-over15", ["lindo ff"]),
  r("160", 4, 84.6, "csl", "team-over25", ["yunnan yukun", "yukun"]),
  r("161", 4, 84.6, "brazil-a", "team-dc", ["flamengo"]),
  r("162", 4, 84.2, "bundesliga", "league-over15"),
  r("163", 4, 83.7, "allsvenskan", "league-over15", [], { drawMin: 3.6 }),
  r("164", 4, 83.3, "eerste", "team-over25", ["nac breda"]),
  r("165", 4, 83.3, "eerste", "team-over25", ["vvv venlo", "vvv"]),
  r("166", 4, 83.3, "eerste", "team-over25", ["de graafschap", "graafschap"]),
  r("167", 4, 83.3, "eerste", "team-over25", ["fc emmen", "emmen"]),
  r("168", 4, 83.3, "eerste", "team-over15", ["fc emmen", "emmen"]),
  r("169", 4, 83.3, "eerste", "team-over25", ["dordrecht"]),
  r("170", 4, 83.3, "eerste", "team-over15", ["dordrecht"]),
  r("171", 4, 83.3, "eerste", "team-btts", ["dordrecht"]),
  r("172", 4, 83.3, "eerste", "team-btts", ["fc den bosch", "den bosch"]),
  r("173", 4, 83.3, "eerste", "team-btts", ["rkc waalwijk", "waalwijk"]),
  r("174", 4, 83.3, "eerste", "team-dc", ["mvv maastricht", "maastricht"]),
  r("175", 4, 83.3, "eerste", "team-dc", ["almere city"]),
  r("176", 4, 83.3, "eerste", "team-dc", ["roda jc"]),
  r("177", 4, 83.3, "eerste", "team-over15", ["vitesse arnhem", "vitesse"]),
  r("178", 4, 83.3, "eerste", "team-over15", ["fc volendam", "volendam"]),
  r("179", 4, 83.3, "eerste", "team-over15", ["top oss"]),
  r("180", 4, 83.3, "eerste", "fade-dc", ["de graafschap", "graafschap"]),
  r("181", 4, 83.3, "ligue-1", "league-over15", [], { drawMin: 3.3 }),
  r("182", 4, 83.3, "mls", "home-fav-ml", [], { homeMax: 1.5 }),
  r("183", 4, 83.3, "egypt-div2", "league-under25", [], { drawMax: 2.85 }),
  r("184a", 4, 83.3, "turkey-super-lig", "named-fav-ml", ["galatasaray"], { favMax: 1.45 }),
  r("184b", 4, 83.3, "turkey-super-lig", "named-fav-ml", ["fenerbahce"], { favMax: 1.45 }),
  r("185", 4, 83.3, "turkey-1-lig", "team-over15", ["kayserispor"]),
  r("186", 4, 83.3, "turkey-1-lig", "team-dc", ["kayserispor"]),
  r("187", 4, 83.3, "ukraine-premier", "team-dc", ["karpaty lviv", "karpaty"]),
  r("188", 4, 83.3, "ukraine-premier", "team-dc", ["polissya zhytomyr", "polissya"]),
  r("189", 4, 83.3, "ukraine-premier", "team-over15", ["polissya zhytomyr", "polissya"]),
  r("190", 4, 83.3, "ukraine-persha", "team-over15", ["ahrobiznes volochysk", "ahrobiznes"]),
  r("191", 4, 83.3, "ukraine-persha", "team-over15", ["zhytomyr 2"]),
  r("192", 4, 83.3, "eliteserien", "team-dc", ["viking fk", "viking"]),
  r("193", 4, 83.3, "eliteserien", "team-over15", ["molde fk", "molde"]),
  r("194", 4, 83.3, "eliteserien", "team-over15", ["valerenga"]),
  r("195", 4, 83.3, "eliteserien", "team-over15", ["kristiansund"]),
  r("196", 4, 83.3, "regionalliga-east", "team-over25", ["marchfeld"]),
  r("197", 4, 83.0, "regionalliga-ne", "league-over15"),
  r("198", 4, 82.9, "sweden-sodra", "league-over15", [], { drawMin: 3.6 }),
  r("199", 4, 82.9, "championship", "league-over15"),
  r("200", 4, 82.8, "georgia", "away-fav-dnb", [], { awayMin: 1.65, awayMax: 2.15 }),
  r("201", 4, 82.4, "eliteserien", "team-over25", ["sk brann", "brann"]),
  r("202", 4, 82.4, "eliteserien", "team-over15", ["tromso il", "tromso"]),
  r("203", 4, 82.4, "regionalliga-east", "league-over15", [], { drawMin: 3.6 }),
  r("204", 4, 82.4, "csl", "league-over15", [], { drawMin: 3.6 }),
  r("205", 4, 82.2, "eredivisie", "league-over25"),
  r("206", 4, 82.1, "esiliiga-b", "team-over25", ["jk tabasalu", "tabasalu"]),
  r("207", 4, 82.1, "esiliiga-b", "team-over25", ["johvi phoenix"]),
  r("208", 4, 82.1, "esiliiga", "team-over15", ["maardu lm", "maardu"]),
  r("209", 4, 82.1, "sweden-sodra", "league-over15"),
  r("210", 4, 81.8, "china-league-one", "team-over15", ["guangdong gz power", "guangdong gz-power", "gz power"]),
  r("211", 4, 81.8, "youth-league", "league-over25"),
  r("212", 4, 81.6, "superettan", "fade-home-fav-x2", [], { homeMin: 1.75, homeMax: 2.05 }),
  r("213", 4, 81.4, "esiliiga-b", "league-over25"),
  r("214", 4, 81.3, "brazil-a", "league-over15", [], { drawMin: 3.6 }),
  r("215", 4, 81.2, "colombia-b", "league-under25", [], { drawMax: 3.0 }),
  r("216", 4, 81.0, "sweden-sodra", "team-dc", ["ik sleipner", "sleipner"]),
  r("217", 4, 81.0, "sweden-sodra", "fade-dc", ["eker orebro"]),
  r("218", 4, 81.0, "pl-cup-u21", "league-over25", [], { drawMin: 3.8 }),
  r("219", 4, 81.0, "allsvenskan", "team-over15", ["hacken"]),
  r("220", 4, 80.7, "allsvenskan", "league-over15"),
  r("221", 4, 80.6, "esiliiga-b", "league-over25", [], { drawMin: 4.0 }),
  r("222", 4, 80.6, "austria-bundesliga", "league-over15"),
  r("223", 4, 80.0, "ukraine-premier", "team-over15", ["shakhtar donetsk", "shakhtar"]),
  r("224", 4, 80.0, "ukraine-premier", "team-dc", ["shakhtar donetsk", "shakhtar"]),
  r("225", 4, 80.0, "csl", "league-over15"),
  r("226", 4, 80.0, "challenger", "team-ml", ["beerschot va", "beerschot"])
];

function dcForSide(side) {
  if (side === "home") return { key: "dc-1x", selection: "Home DC 1X", market: "Double Chance" };
  return { key: "dc-x2", selection: "Away DC X2", market: "Double Chance" };
}
function mlForSide(side, name) {
  return {
    key: side,
    selection: `${name} Win`,
    market: "1X2"
  };
}

function clashTeam(fixture, rule) {
  if (!rule.teams?.length) return false;
  const oppName = namesMatch(fixture.home, rule.teams) ? fixture.away : fixture.home;
  return GOLDIE_RULES.some((other) =>
    other.id !== rule.id &&
    other.comp === rule.comp &&
    other.type === rule.type &&
    namesMatch(oppName, other.teams)
  );
}

function built(rule, fixture, spec) {
  if (!spec) return null;
  if (isBanned(spec.key, spec.selection)) return null;
  const odd = priceOf(fixture, spec.key);
  const optional = spec.key === "over-15" || spec.key === "over-25" || spec.key === "under-25" || spec.key === "btts-yes";
  if (!(odd > 1) && !optional) return null;
  if (optional && spec.key !== "over-15" && !(odd > 1)) return null;
  return {
    fixtureId: fixture.id,
    home: fixture.home,
    away: fixture.away,
    country: fixture.country,
    league: fixture.league,
    kickoff: fixture.kickoff,
    url: fixture.url,
    market: spec.market,
    selection: spec.selection,
    key: spec.key,
    odds: odd > 1 ? odd : 0,
    homeOdd: clampOdd(fixture.odds?.home),
    drawOdd: clampOdd(fixture.odds?.draw),
    awayOdd: clampOdd(fixture.odds?.away),
    confidence: rule.hitRate,
    strike: rule.hitRate,
    hitRate: rule.hitRate,
    tier: rule.tier,
    ruleId: rule.id,
    why: `${spec.selection} is the Goldie banker for ${fixture.home} vs ${fixture.away}.`,
    note: spec.trigger || `Goldie ${rule.id}`
  };
}

function applyRule(rule, fixture) {
  if (rule.hitRate < GOLDIE_MIN_HIT_RATE) return null;
  const homeOdd = clampOdd(fixture.odds?.home);
  const drawOdd = clampOdd(fixture.odds?.draw);
  const awayOdd = clampOdd(fixture.odds?.away);
  if (!(homeOdd && drawOdd && awayOdd)) return null;
  if (rule.drawMin != null && !(drawOdd >= rule.drawMin)) return null;
  if (rule.drawMax != null && !(drawOdd <= rule.drawMax)) return null;
  const fav = favorite(fixture);
  const side = rule.teams?.length ? sideOf(fixture, rule.teams) : null;
  const venueOk = !rule.venue || (rule.venue === "home" && side === "home") || (rule.venue === "away" && side === "away");

  switch (rule.type) {
    case "team-ml": {
      if (!side || !venueOk) return null;
      if (clashTeam(fixture, rule)) return null;
      const name = side === "home" ? fixture.home : fixture.away;
      return built(rule, fixture, { ...mlForSide(side, name), trigger: `${name} ML` });
    }
    case "team-dc": {
      if (!side || !venueOk) return null;
      if (clashTeam(fixture, rule)) return null;
      const name = side === "home" ? fixture.home : fixture.away;
      const dc = dcForSide(side);
      return built(rule, fixture, { ...dc, selection: `${name} DC`, trigger: `${name} DC` });
    }
    case "fade-dc": {
      if (!side) return null;
      const opp = side === "home" ? "away" : "home";
      const dc = dcForSide(opp);
      return built(rule, fixture, { ...dc, trigger: `Fade ${side === "home" ? fixture.home : fixture.away}` });
    }
    case "team-over15":
      if (!side || !venueOk) return null;
      return built(rule, fixture, { key: "over-15", market: "Over 1.5", selection: "Over 1.5", trigger: "Over 1.5" });
    case "team-over25":
      if (!side || !venueOk) return null;
      return built(rule, fixture, { key: "over-25", market: "Over 2.5", selection: "Over 2.5", trigger: "Over 2.5" });
    case "team-under25":
      if (!side || !venueOk) return null;
      return built(rule, fixture, { key: "under-25", market: "Under 2.5", selection: "Under 2.5", trigger: "Under 2.5" });
    case "team-btts":
      if (!side || !venueOk) return null;
      return built(rule, fixture, { key: "btts-yes", market: "BTTS", selection: "BTTS Yes", trigger: "BTTS Yes" });
    case "league-over15":
      return built(rule, fixture, { key: "over-15", market: "Over 1.5", selection: "Over 1.5", trigger: "League Over 1.5" });
    case "league-over25":
      return built(rule, fixture, { key: "over-25", market: "Over 2.5", selection: "Over 2.5", trigger: "League Over 2.5" });
    case "league-under25":
      return built(rule, fixture, { key: "under-25", market: "Under 2.5", selection: "Under 2.5", trigger: "League Under 2.5" });
    case "league-home-dc":
      return built(rule, fixture, { ...dcForSide("home"), trigger: "Home DC" });
    case "home-fav-dc": {
      if (!fav || fav.side !== "home") return null;
      if (rule.homeMax != null && !(homeOdd <= rule.homeMax)) return null;
      return built(rule, fixture, { ...dcForSide("home"), trigger: "Home favourite DC" });
    }
    case "home-fav-ml": {
      if (!fav || fav.side !== "home") return null;
      if (rule.homeMax != null && !(homeOdd <= rule.homeMax)) return null;
      return built(rule, fixture, { ...mlForSide("home", fixture.home), trigger: "Home favourite ML" });
    }
    case "home-fav-dnb": {
      if (!fav || fav.side !== "home") return null;
      if (rule.homeMax != null && !(homeOdd <= rule.homeMax)) return null;
      return built(rule, fixture, { key: "dnb-home", market: "Draw No Bet", selection: `${fixture.home} DNB`, trigger: "Home favourite DNB" });
    }
    case "away-dc": {
      if (!(awayOdd && awayOdd <= (rule.awayMax || 99))) return null;
      return built(rule, fixture, { ...dcForSide("away"), trigger: "Away DC" });
    }
    case "heavy-fav-ml": {
      if (!fav) return null;
      if (rule.favMax != null && !(fav.odd <= rule.favMax)) return null;
      return built(rule, fixture, { ...mlForSide(fav.side, fav.name), trigger: "Heavy favourite ML" });
    }
    case "heavy-fav-dc": {
      if (!fav) return null;
      if (rule.favMax != null && !(fav.odd <= rule.favMax)) return null;
      const dc = dcForSide(fav.side);
      return built(rule, fixture, { ...dc, selection: `${fav.name} DC`, trigger: "Heavy favourite DC" });
    }
    case "named-fav-ml": {
      if (!side) return null;
      if (rule.avoid) {
        const opp = side === "home" ? fixture.away : fixture.home;
        if (namesMatch(opp, rule.avoid)) return null;
      }
      const name = side === "home" ? fixture.home : fixture.away;
      const odd = side === "home" ? homeOdd : awayOdd;
      if (rule.favMax != null && !(odd <= rule.favMax)) return null;
      if (fav && fav.side !== side) return null;
      return built(rule, fixture, { ...mlForSide(side, name), trigger: `${name} ML` });
    }
    case "big-home-ml": {
      if (side !== "home") return null;
      if (rule.homeMax != null && !(homeOdd <= rule.homeMax)) return null;
      return built(rule, fixture, { ...mlForSide("home", fixture.home), trigger: "Big club home ML" });
    }
    case "gap-fav-ml": {
      if (!fav) return null;
      if (impliedGap(fixture) < (rule.gapMin || 0)) return null;
      return built(rule, fixture, { ...mlForSide(fav.side, fav.name), trigger: "Heavy favourite ML" });
    }
    case "away-fav-dnb": {
      if (!fav || fav.side !== "away") return null;
      if (rule.awayMin != null && !(awayOdd >= rule.awayMin)) return null;
      if (rule.awayMax != null && !(awayOdd <= rule.awayMax)) return null;
      return built(rule, fixture, { key: "dnb-away", market: "Draw No Bet", selection: `${fixture.away} DNB`, trigger: "Away favourite DNB" });
    }
    case "fade-home-fav-x2": {
      if (!fav || fav.side !== "home") return null;
      if (rule.homeMin != null && !(homeOdd >= rule.homeMin)) return null;
      if (rule.homeMax != null && !(homeOdd <= rule.homeMax)) return null;
      return built(rule, fixture, { ...dcForSide("away"), trigger: "Fade home favourite" });
    }
    default:
      return null;
  }
}

export function selectGoldiePicks(fixture) {
  if (!(clampOdd(fixture?.odds?.home) && clampOdd(fixture?.odds?.draw) && clampOdd(fixture?.odds?.away))) return [];
  const comp = matchCompetition(fixture);
  if (!comp) return [];
  const hits = [];
  for (const rule of GOLDIE_RULES) {
    if (rule.comp !== comp) continue;
    const pick = applyRule(rule, fixture);
    if (pick) hits.push(pick);
  }
  const best = new Map();
  for (const pick of hits) {
    const key = `${pick.fixtureId}|${pick.key}|${pick.selection}`;
    const prev = best.get(key);
    if (!prev || pick.hitRate > prev.hitRate) best.set(key, pick);
  }
  return [...best.values()]
    .filter((pick) => pick.hitRate >= GOLDIE_MIN_HIT_RATE && !isBanned(pick.key, pick.selection))
    .sort((a, b) => b.hitRate - a.hitRate || a.ruleId.localeCompare(b.ruleId));
}

export function runGoldie(fixtures) {
  const picks = [];
  for (const fixture of fixtures || []) {
    picks.push(...selectGoldiePicks(fixture));
  }
  return picks.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || b.hitRate - a.hitRate);
}

export { isBanned };
