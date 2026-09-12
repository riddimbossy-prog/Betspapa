const MONIKA_ENGINE_NAME = "Monika";
const MONIKA_ENGINE_VERSION = "monika-v1.0.0";
function clampOdd(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 1 ? v : 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function normName(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}
function compact(value) {
  return normName(value).replace(/\s+/g, "");
}
function namesMatch(name, aliases) {
  const hay = compact(name);
  if (!hay) return false;
  return aliases.some((alias) => {
    const needle = compact(alias);
    if (!needle) return false;
    return hay === needle || hay.includes(needle) || needle.includes(hay);
  });
}
function sideOf(fixture, aliases) {
  if (namesMatch(fixture.home, aliases)) return "home";
  if (namesMatch(fixture.away, aliases)) return "away";
  return null;
}
function blob(fixture) {
  return `${normName(fixture.country)} ${normName(fixture.league)}`;
}
function matchCompetition(fixture) {
  const b = blob(fixture);
  const league = normName(fixture.league);
  const compactLeague = compact(fixture.league);
  if (/uefa youth|youth league/.test(b)) return "youth-league";
  if (/champions league/.test(b) && !/caf|women|youth|africa/.test(b)) return "ucl";
  if (/\bwomen\b|\bwsl\b|\bnwsl\b/.test(b)) return null;
  if (/china/.test(b) && /league one|jia b|china league 1/.test(b)) return "china-league-one";
  if (/china/.test(b) && /super league/.test(b)) return "csl";
  if (/brazil/.test(b) && /serie a|serie a betano|brasileiro/.test(b) && !/serie b|serie c|copa|u20/.test(b)) return "brazil-a";
  if (/brazil/.test(b) && /serie b/.test(b)) return "brazil-b";
  if (/austria/.test(b) && /2 liga|2\. liga|second league/.test(b)) return "austria-2";
  if (/austria/.test(b) && /regionalliga/.test(b) && /east|ost/.test(b)) return "regionalliga-east";
  if (/germany/.test(b) && /regionalliga/.test(b) && /nordost|northeast|north east|nord ost/.test(b)) return "regionalliga-ne";
  if (/denmark/.test(b) && /1st division|1 division|first division/.test(b)) return "denmark-1";
  if (/england/.test(b) && /championship/.test(league) && !/women/.test(b)) return "championship";
  if (/england/.test(b) && /league one/.test(league) && !/women/.test(b)) return "league-one";
  if (/england/.test(b) && /league two/.test(league)) return "league-two";
  if (/england/.test(b) && /fa cup/.test(b) && !/trophy/.test(b)) return "fa-cup";
  if (/england/.test(b) && /premier league 2|pl cup|u21/.test(b)) return "pl-cup-u21";
  if (/england/.test(b) && /premier league/.test(league) && !/2|women|u21/.test(league)) return "epl";
  if (/belgium/.test(b) && /acff/.test(b)) return "belgium-acff";
  if (/belgium/.test(b) && (/national division 1|nationale 1/.test(b) && /vv/.test(b) || /division 1 vv/.test(b))) return "belgium-vv";
  if (/belgium/.test(b) && /jupiler|pro league/.test(b) && !/challenger|women|u21/.test(b)) return "jupiler";
  if (/belgium/.test(b) && /challenger/.test(b)) return "challenger";
  if (/austria/.test(b) && /bundesliga/.test(b) && !/2/.test(league)) return "austria-bundesliga";
  if (/netherlands/.test(b) && /eredivisie/.test(b) && !/vrouw|women/.test(b)) return "eredivisie";
  if (/france/.test(b) && /ligue 1/.test(b) && !/women/.test(b)) return "ligue-1";
  if (/uzbekistan/.test(b) && /super/.test(b)) return "uzbekistan";
  if (/chile/.test(b) && /ascenso|primera b/.test(b)) return "chile-ascenso";
  if (/costa rica/.test(b) && /ascenso/.test(b)) return "costa-rica-ascenso";
  if (/serbia/.test(b) && /super/.test(b)) return "serbia";
  if (/spain/.test(b) && (/laliga/.test(compactLeague) || /primera division/.test(league)) && !/2|laliga2|rfef/.test(compactLeague)) return "laliga";
  if (/greece/.test(b) && /super league/.test(b)) return "greece";
  if (/finland/.test(b) && /ykkosliiga/.test(b)) return "finland-ykkos";
  if (/italy/.test(b) && /serie a/.test(league) && !/b|c|women|cup/.test(league)) return "serie-a";
  if (/latvia/.test(b) && /virsliga/.test(b)) return "latvia";
  if (/portugal/.test(b) && /liga portugal|primeira/.test(b) && !/2|3/.test(league)) return "portugal";
  if (/qatar/.test(b) && /stars|qsl/.test(b)) return "qatar";
  if (/oman/.test(b) && /professional|pro league|oman league/.test(b)) return "oman";
  if (/iran/.test(b) && /pro league|persian/.test(b)) return "iran";
  if (/egypt/.test(b) && /premier/.test(b)) return "egypt-pl";
  if (/egypt/.test(b) && /division 2|second division/.test(b)) return "egypt-div2";
  if (/colombia/.test(b) && /primera b/.test(b)) return "colombia-b";
  if (/argentina/.test(b) && /reserve|reserva/.test(b)) return "argentina-reserves";
  if (/iraq/.test(b) && /stars/.test(b)) return "iraq";
  if (/israel/.test(b) && /leumit/.test(b)) return "israel-leumit";
  if (/estonia/.test(b) && /esiliiga b/.test(b)) return "esiliiga-b";
  if (/estonia/.test(b) && /esiliiga/.test(b) && !/\bb\b/.test(league)) return "esiliiga";
  if (/germany/.test(b) && /bundesliga/.test(league) && !/2|3/.test(league)) return "bundesliga";
  if (/sweden/.test(b) && /superettan/.test(b)) return "superettan";
  if (/usa|united states/.test(b) && (/\bmls\b/.test(b) || /major league soccer/.test(b)) && !/next/.test(b)) return "mls";
  if (/georgia/.test(b) && /erovnuli/.test(b)) return "georgia";
  if (/turkey/.test(b) && /super lig/.test(b)) return "turkey";
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
function priceOf(fixture, key) {
  const o = fixture.odds;
  const line = Number(o.ouLine) || 0;
  switch (key) {
    case "home":
      return clampOdd(o.home);
    case "away":
      return clampOdd(o.away);
    case "dc-1x":
      return clampOdd(o.dc1x) || clampOdd(deriveDc(o.home, o.draw, o.away).dc1x);
    case "dc-12":
      return clampOdd(o.dc12) || clampOdd(deriveDc(o.home, o.draw, o.away).dc12);
    case "dc-x2":
      return clampOdd(o.dcx2) || clampOdd(deriveDc(o.home, o.draw, o.away).dcx2);
    case "dnb-home":
      return clampOdd(deriveDnb(o.home, o.away, "home"));
    case "dnb-away":
      return clampOdd(deriveDnb(o.home, o.away, "away"));
    case "over-15":
      if (line === 1.5) return clampOdd(o.over);
      return 0;
    case "over-25":
      if (line === 2.5) return clampOdd(o.over);
      return 0;
    case "under-25":
      if (line === 2.5) return clampOdd(o.under);
      return 0;
    case "btts-yes":
      return clampOdd(o.bttsYes);
    default:
      return 0;
  }
}
function totalsKey(fixture, want) {
  const direct = priceOf(fixture, want);
  if (direct > 1) return want;
  if (want === "over-15" && priceOf(fixture, "over-25") > 1) return "over-25";
  return direct > 1 ? want : null;
}
function emit(fixture, step, built) {
  if (!built) return null;
  const odd = priceOf(fixture, built.key);
  if (!(odd > 1)) return null;
  return {
    fixtureId: fixture.id,
    home: fixture.home,
    away: fixture.away,
    country: fixture.country,
    league: fixture.league,
    kickoff: fixture.kickoff,
    url: fixture.url,
    market: built.market,
    selection: built.selection,
    key: built.key,
    odds: odd,
    homeOdd: clampOdd(fixture.odds.home),
    drawOdd: clampOdd(fixture.odds.draw),
    awayOdd: clampOdd(fixture.odds.away),
    confidence: built.confidence,
    strike: built.confidence,
    step,
    trigger: built.trigger,
    note: `Step ${step} \xB7 ${built.trigger}`
  };
}
function clubPick(side, name, kind, confidence, trigger) {
  if (kind === "ml") {
    return {
      key: side,
      market: "1X2",
      selection: `${name} Win`,
      confidence,
      trigger
    };
  }
  if (kind === "dnb") {
    return {
      key: side === "home" ? "dnb-home" : "dnb-away",
      market: "Draw No Bet",
      selection: `${name} DNB`,
      confidence,
      trigger
    };
  }
  return {
    key: side === "home" ? "dc-1x" : "dc-x2",
    market: "Double Chance",
    selection: `${name} DC`,
    confidence,
    trigger
  };
}
function firstPriced(fixture, options) {
  return options.find((row) => priceOf(fixture, row.key) > 1) || null;
}
function favorite(fixture) {
  const h = clampOdd(fixture.odds.home);
  const a = clampOdd(fixture.odds.away);
  if (!h || !a) return null;
  if (h <= a) return { side: "home", odd: h, name: fixture.home };
  return { side: "away", odd: a, name: fixture.away };
}
function step1(fixture, comp) {
  if (comp === "ucl") {
    return { key: "dc-12", market: "Double Chance", selection: "DC 12", confidence: 100, trigger: "UCL league phase" };
  }
  const gz = sideOf(fixture, ["guangdong gz power", "guangdong gz-power", "gz power", "guangdong"]);
  if (comp === "china-league-one" && gz) {
    return clubPick(gz, gz === "home" ? fixture.home : fixture.away, "dc", 90.9, "Guangdong GZ-Power DC");
  }
  if (comp === "china-league-one" && sideOf(fixture, ["dingnan ganlian", "dingnan"])) {
    const key = totalsKey(fixture, "over-15");
    if (key) {
      return {
        key,
        market: key === "over-25" ? "Over 2.5" : "Over 1.5",
        selection: key === "over-25" ? "Over 2.5" : "Over 1.5",
        confidence: 90.5,
        trigger: "Dingnan Ganlian Over 1.5"
      };
    }
  }
  const zhejiang = sideOf(fixture, ["zhejiang"]);
  if (comp === "csl" && zhejiang) {
    const key = totalsKey(fixture, "over-15");
    if (key) return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 92, trigger: "Zhejiang Over 1.5" };
  }
  if (comp === "csl" && sideOf(fixture, ["yunnan yukun", "yukun", "yunnan"])) {
    const key = totalsKey(fixture, "over-25") || totalsKey(fixture, "over-15");
    if (key) return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 84.6, trigger: "Yunnan Yukun Over 2.5" };
  }
  if (comp === "csl" && sideOf(fixture, ["shanghai shenhua", "shenhua"])) {
    const key = totalsKey(fixture, "over-15");
    if (key) return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 88.5, trigger: "Shanghai Shenhua Over 1.5" };
  }
  const flamengo = sideOf(fixture, ["flamengo"]);
  if (comp === "brazil-a" && flamengo) {
    const key = totalsKey(fixture, "over-15");
    if (key) return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 92.3, trigger: "Flamengo Over 1.5" };
  }
  const palmeiras = sideOf(fixture, ["palmeiras"]);
  if (comp === "brazil-a" && palmeiras) return clubPick(palmeiras, palmeiras === "home" ? fixture.home : fixture.away, "dc", 88.5, "Palmeiras DC");
  if (comp === "brazil-a" && sideOf(fixture, ["chapecoense", "chape"])) {
    const key = totalsKey(fixture, "over-15");
    if (key) return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 88, trigger: "Chapecoense Over 1.5" };
  }
  if (comp === "austria-2" && sideOf(fixture, ["liefering"])) {
    const key = totalsKey(fixture, "over-25") || totalsKey(fixture, "over-15");
    if (key) return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 100, trigger: "Liefering Over 2.5" };
  }
  if (comp === "regionalliga-east" && sideOf(fixture, ["marchfeld"])) {
    const key = totalsKey(fixture, "over-25") || totalsKey(fixture, "over-15");
    if (key) return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 83.3, trigger: "Marchfeld Over 2.5" };
  }
  const vejle = sideOf(fixture, ["vejle"]);
  if (comp === "denmark-1" && vejle) return clubPick(vejle, vejle === "home" ? fixture.home : fixture.away, "dc", 100, "Vejle DC");
  const hvidovre = sideOf(fixture, ["hvidovre"]);
  if (comp === "denmark-1" && hvidovre) return clubPick(hvidovre, hvidovre === "home" ? fixture.home : fixture.away, "dc", 100, "Hvidovre DC");
  if (comp === "championship" && sideOf(fixture, ["southampton"])) {
    return firstPriced(fixture, [
      { key: "btts-yes", market: "BTTS", selection: "BTTS Yes", confidence: 100, trigger: "Southampton BTTS" },
      { key: totalsKey(fixture, "over-15") || "over-15", market: "Over 1.5", selection: "Over 1.5", confidence: 100, trigger: "Southampton Over 1.5" }
    ]);
  }
  const rwdm = sideOf(fixture, ["rwdm", "rwdm brussels"]);
  if (comp === "belgium-acff" && rwdm) return clubPick(rwdm, rwdm === "home" ? fixture.home : fixture.away, "ml", 100, "RWDM Brussels ML");
  const hout = sideOf(fixture, ["houtvenne"]);
  if (comp === "belgium-vv" && hout) return clubPick(hout, hout === "home" ? fixture.home : fixture.away, "ml", 100, "Houtvenne ML");
  const union = sideOf(fixture, ["royale union sg", "union sg", "union saint gilloise", "union st gilloise"]);
  if (comp === "jupiler" && union) return clubPick(union, union === "home" ? fixture.home : fixture.away, "dc", 100, "Royale Union SG DC");
  const lask = sideOf(fixture, ["lask"]);
  if (comp === "austria-bundesliga" && lask) return clubPick(lask, lask === "home" ? fixture.home : fixture.away, "ml", 100, "LASK ML");
  const salzburg = sideOf(fixture, ["salzburg", "red bull salzburg", "rb salzburg"]);
  if (comp === "austria-bundesliga" && salzburg) return clubPick(salzburg, salzburg === "home" ? fixture.home : fixture.away, "dc", 100, "Salzburg DC");
  const arsenal = sideOf(fixture, ["arsenal"]);
  const city = sideOf(fixture, ["manchester city", "man city"]);
  if (comp === "epl" && (arsenal || city)) {
    const side = arsenal || city;
    const name = side === "home" ? fixture.home : fixture.away;
    return clubPick(side, name, "ml", 100, `${name} ML`);
  }
  if (comp === "epl" && sideOf(fixture, ["chelsea"])) {
    const key = totalsKey(fixture, "over-25");
    return firstPriced(fixture, [
      key ? { key, market: "Over 2.5", selection: "Over 2.5", confidence: 100, trigger: "Chelsea Over 2.5" } : null,
      { key: "btts-yes", market: "BTTS", selection: "BTTS Yes", confidence: 100, trigger: "Chelsea BTTS" }
    ].filter(Boolean));
  }
  const liverpool = sideOf(fixture, ["liverpool"]);
  if (comp === "epl" && liverpool) return clubPick(liverpool, liverpool === "home" ? fixture.home : fixture.away, "dc", 100, "Liverpool DC");
  if (comp === "eredivisie" && sideOf(fixture, ["psv", "psv eindhoven"])) {
    const key = totalsKey(fixture, "over-25");
    return firstPriced(fixture, [
      key ? { key, market: "Over 2.5", selection: "Over 2.5", confidence: 100, trigger: "PSV Over 2.5" } : null,
      { key: "btts-yes", market: "BTTS", selection: "BTTS Yes", confidence: 100, trigger: "PSV BTTS" }
    ].filter(Boolean));
  }
  if (comp === "ligue-1" && sideOf(fixture, ["psg", "paris saint germain", "paris sg"])) {
    const key = totalsKey(fixture, "over-25");
    return firstPriced(fixture, [
      key ? { key, market: "Over 2.5", selection: "Over 2.5", confidence: 100, trigger: "PSG Over 2.5" } : null,
      { key: "btts-yes", market: "BTTS", selection: "BTTS Yes", confidence: 100, trigger: "PSG BTTS" }
    ].filter(Boolean));
  }
  const pak = sideOf(fixture, ["pakhtakor"]);
  if (comp === "uzbekistan" && pak) return clubPick(pak, pak === "home" ? fixture.home : fixture.away, "dc", 95.2, "Pakhtakor DC");
  if (comp === "chile-ascenso" && namesMatch(fixture.home, ["cobreloa"])) {
    return clubPick("home", fixture.home, "dc", 91.7, "Cobreloa home DC");
  }
  const jicaral = sideOf(fixture, ["adr jicaral", "jicaral"]);
  if (comp === "costa-rica-ascenso" && jicaral) return clubPick(jicaral, jicaral === "home" ? fixture.home : fixture.away, "dc", 100, "ADR Jicaral DC");
  const westHam = sideOf(fixture, ["west ham", "west ham united"]);
  if (comp === "championship" && westHam) {
    const key = totalsKey(fixture, "over-25") || totalsKey(fixture, "over-15");
    if (key) return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 85.7, trigger: "West Ham Over 2.5" };
  }
  return null;
}
function step2(fixture, comp) {
  const fav = favorite(fixture);
  const homeOdd = clampOdd(fixture.odds.home);
  const awayOdd = clampOdd(fixture.odds.away);
  if (comp === "csl" && fav && fav.odd <= 1.4) {
    return clubPick(fav.side, fav.name, "dc", 87, "CSL heavy fav DC (fade ML)");
  }
  if (comp === "brazil-a" && homeOdd && homeOdd <= 1.75 && homeOdd <= (awayOdd || 99)) {
    return clubPick("home", fixture.home, "dc", 89.3, "Brazil A home fav DC");
  }
  if (comp === "austria-bundesliga" && homeOdd && homeOdd <= 1.65 && homeOdd <= (awayOdd || 99)) {
    return clubPick("home", fixture.home, "dc", 100, "Austria Bundesliga home fav DC");
  }
  if (comp === "epl" && homeOdd && homeOdd <= 1.5 && homeOdd <= (awayOdd || 99)) {
    return clubPick("home", fixture.home, "dc", 100, "EPL home heavy fav DC");
  }
  if (comp === "ligue-1" && awayOdd && awayOdd <= 2.6 && awayOdd < homeOdd) {
    return clubPick("away", fixture.away, "dc", 90, "Ligue 1 road DC");
  }
  if (fav && fav.odd <= 1.4 && (comp === "serbia" || comp === "laliga" || comp === "greece" || comp === "finland-ykkos")) {
    return clubPick(fav.side, fav.name, "ml", 100, `${comp} heavy fav ML`);
  }
  if (comp === "serie-a" && fav && fav.odd <= 1.55) {
    return clubPick(fav.side, fav.name, "ml", 100, "Serie A elite fav ML");
  }
  if (comp === "uzbekistan" && fav && fav.odd <= 1.4) {
    return clubPick(fav.side, fav.name, "ml", 87.5, "Uzbekistan heavy fav ML");
  }
  if (comp === "latvia" && fav && namesMatch(fav.name, ["rfs", "riga", "riga fc"])) {
    return clubPick(fav.side, fav.name, "ml", 86.8, "Virsliga duopoly ML");
  }
  if (comp === "portugal" && fav && namesMatch(fav.name, ["benfica", "porto", "sporting", "sporting cp"])) {
    return clubPick(fav.side, fav.name, "ml", 86.7, "Portugal Big 3 ML");
  }
  if (comp === "qatar" && fav && namesMatch(fav.name, ["al sadd", "al-sadd"]) && fav.odd <= 1.5) {
    return clubPick(fav.side, fav.name, "ml", 100, "Al-Sadd ML");
  }
  if (comp === "turkey" && fav && namesMatch(fav.name, ["galatasaray", "fenerbahce", "fenerbahce"]) && fav.odd <= 1.45) {
    return clubPick(fav.side, fav.name, "ml", 83.3, "Istanbul fav ML");
  }
  if (comp === "league-two" && awayOdd && awayOdd < homeOdd) {
    return clubPick("home", fixture.home, "dc", 85.4, "League Two fade away fav");
  }
  if (comp === "epl" && awayOdd >= 1.7 && awayOdd <= 2.05 && awayOdd < homeOdd) {
    return clubPick("home", fixture.home, "dc", 75, "EPL fade road fav");
  }
  if (comp === "superettan" && homeOdd >= 1.75 && homeOdd <= 2.05 && homeOdd <= awayOdd) {
    return clubPick("away", fixture.away, "dc", 81.6, "Superettan fade home fav");
  }
  if (comp === "mls" && awayOdd >= 1.7 && awayOdd <= 2.15 && awayOdd < homeOdd) {
    return clubPick("home", fixture.home, "dc", 61.9, "MLS fade road fav");
  }
  if (comp === "georgia" && awayOdd >= 1.65 && awayOdd <= 2.15 && awayOdd < homeOdd) {
    return clubPick("away", fixture.away, "dnb", 82.8, "Erovnuli away DNB");
  }
  if (comp === "regionalliga-east" && fav && fav.odd <= 1.4) return null;
  if (comp === "austria-2" && fav && fav.odd <= 1.5) return null;
  if (comp === "eredivisie" && fav && fav.odd <= 1.25) return null;
  if (comp === "ligue-1" && fav) return null;
  return null;
}
function step3(fixture, comp) {
  const draw = clampOdd(fixture.odds.draw);
  const over15 = totalsKey(fixture, "over-15");
  const over25 = totalsKey(fixture, "over-25");
  const under25 = totalsKey(fixture, "under-25");
  if (comp === "iran" && draw && draw <= 2.95 && under25) {
    return { key: under25, market: "Under 2.5", selection: "Under 2.5", confidence: 92.1, trigger: "Iran compressed draw Under 2.5" };
  }
  if (comp === "egypt-pl" && draw && draw <= 2.75 && under25) {
    return { key: under25, market: "Under 2.5", selection: "Under 2.5", confidence: 85.7, trigger: "Egypt PL Under 2.5" };
  }
  if (comp === "egypt-div2" && draw && draw <= 2.85 && under25) {
    return { key: under25, market: "Under 2.5", selection: "Under 2.5", confidence: 83.3, trigger: "Egypt Div 2 Under 2.5" };
  }
  if (comp === "colombia-b" && draw && draw <= 3 && under25) {
    return { key: under25, market: "Under 2.5", selection: "Under 2.5", confidence: 81.2, trigger: "Colombia B Under 2.5" };
  }
  if (comp === "china-league-one" && draw && draw <= 3 && under25) {
    return { key: under25, market: "Under 2.5", selection: "Under 2.5", confidence: 76.2, trigger: "China League One Under 2.5" };
  }
  if (comp === "argentina-reserves" && draw && draw <= 2.95 && under25) {
    return { key: under25, market: "Under 2.5", selection: "Under 2.5", confidence: 73.7, trigger: "Argentina Reserves Under 2.5" };
  }
  if (comp === "belgium-vv" && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 100, trigger: "Belgium VV Over 1.5" };
  }
  if (comp === "eredivisie" && draw && draw >= 3.6 && over25) {
    return { key: over25, market: "Over 2.5", selection: "Over 2.5", confidence: 82.2, trigger: "Eredivisie inflated draw Over 2.5" };
  }
  if (comp === "eredivisie" && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 93.3, trigger: "Eredivisie Over 1.5" };
  }
  if (comp === "austria-2" && draw && draw >= 3.6) {
    return { key: "dc-12", market: "Double Chance", selection: "DC 12", confidence: 90.9, trigger: "Austria 2. Liga DC 12" };
  }
  if (comp === "csl" && draw && draw >= 3.6 && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 82.4, trigger: "CSL inflated draw Over 1.5" };
  }
  if (comp === "regionalliga-east" && draw && draw >= 3.6 && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 82.4, trigger: "Regionalliga East Over 1.5" };
  }
  if (comp === "brazil-a" && draw && draw >= 3.6 && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 81.3, trigger: "Brazil A inflated draw Over 1.5" };
  }
  if (comp === "bundesliga" && draw && draw >= 3.6 && over25) {
    return { key: over25, market: "Over 2.5", selection: "Over 2.5", confidence: 78.9, trigger: "Bundesliga Over 2.5" };
  }
  if (comp === "china-league-one" && draw && draw >= 3.4 && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 78, trigger: "China League One Over 1.5" };
  }
  if (comp === "championship" && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 82.9, trigger: "Championship Over 1.5" };
  }
  if (comp === "ligue-1" && draw && draw >= 3.3 && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 83.3, trigger: "Ligue 1 Over 1.5" };
  }
  if (comp === "pl-cup-u21" && draw && draw >= 3.8 && over25) {
    return { key: over25, market: "Over 2.5", selection: "Over 2.5", confidence: 81, trigger: "PL Cup U21 Over 2.5" };
  }
  if (comp === "esiliiga" && draw && draw >= 3.75 && (over25 || over15)) {
    const key = over25 || over15;
    return { key, market: key === "over-25" ? "Over 2.5" : "Over 1.5", selection: key === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 76.9, trigger: "Esiliiga Over" };
  }
  return null;
}
function step4(fixture, comp) {
  const over15 = totalsKey(fixture, "over-15");
  const over25 = totalsKey(fixture, "over-25");
  const homeOdd = clampOdd(fixture.odds.home);
  const awayOdd = clampOdd(fixture.odds.away);
  const dc12 = [
    "oman",
    "challenger",
    "belgium-acff",
    "esiliiga-b",
    "israel-leumit",
    "austria-2",
    "bundesliga",
    "regionalliga-east",
    "austria-bundesliga",
    "jupiler"
  ];
  if (comp && dc12.includes(comp)) {
    return { key: "dc-12", market: "Double Chance", selection: "DC 12", confidence: 80, trigger: `${comp} DC 12 floor` };
  }
  if (comp === "brazil-b" && homeOdd && homeOdd <= 1.55 && homeOdd <= (awayOdd || 99)) {
    return clubPick("home", fixture.home, "dnb", 91.7, "Serie B home DNB");
  }
  if (comp === "league-two") {
    return clubPick("home", fixture.home, "dc", 85.4, "League Two home DC");
  }
  if (comp === "iraq") {
    return clubPick("home", fixture.home, "dc", 86.8, "Iraq Stars home DC");
  }
  if ((comp === "csl" || comp === "league-one" || comp === "regionalliga-ne") && over15) {
    return { key: over15, market: over15 === "over-25" ? "Over 2.5" : "Over 1.5", selection: over15 === "over-25" ? "Over 2.5" : "Over 1.5", confidence: 80, trigger: `${comp} Over 1.5 floor` };
  }
  if (comp === "youth-league" && over25) {
    return { key: over25, market: "Over 2.5", selection: "Over 2.5", confidence: 81.8, trigger: "UEFA Youth League Over 2.5" };
  }
  return null;
}
function selectMonikaPick(fixture) {
  if (!(clampOdd(fixture.odds.home) && clampOdd(fixture.odds.draw) && clampOdd(fixture.odds.away))) return null;
  const comp = matchCompetition(fixture);
  const one = emit(fixture, 1, step1(fixture, comp));
  if (one) return one;
  const two = emit(fixture, 2, step2(fixture, comp));
  if (two) return two;
  const three = emit(fixture, 3, step3(fixture, comp));
  if (three) return three;
  return emit(fixture, 4, step4(fixture, comp));
}
function runMonika(fixtures) {
  const picks = [];
  for (const fixture of fixtures) {
    const pick = selectMonikaPick(fixture);
    if (pick) picks.push(pick);
  }
  return picks.sort((a, b) => b.confidence - a.confidence || a.kickoff.localeCompare(b.kickoff));
}
export {
  MONIKA_ENGINE_NAME,
  MONIKA_ENGINE_VERSION,
  matchCompetition,
  namesMatch,
  normName,
  priceOf,
  runMonika,
  selectMonikaPick,
  sideOf
};
