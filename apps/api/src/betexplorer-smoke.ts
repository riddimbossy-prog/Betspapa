import { parseBetExplorerHtmlDetailed } from './betexplorer.js';

const html = `<!doctype html><html><head><title>Football fixtures</title></head><body>
<section class="wrap-section">
  <h2 class="wrap-section__header__title">England: Premier League</h2>
  <table>
    <tr class="table-main__row" data-event-id="abc123" data-date="2026-07-23" data-time="18:30">
      <td class="table-main__participant"><a href="/soccer/england/premier-league/match/abc123/">Alpha FC - Beta United</a></td>
      <td class="table-main__odds" data-odd="1.80">1.80</td>
      <td class="table-main__odds" data-odd="3.40">3.40</td>
      <td class="table-main__odds" data-odd="4.50">4.50</td>
    </tr>
  </table>
</section>
<script type="application/ld+json">{
  "@type":"SportsEvent",
  "identifier":"json-1",
  "startDate":"2026-07-24T20:00:00Z",
  "homeTeam":{"name":"Gamma"},
  "awayTeam":{"name":"Delta"},
  "competition":{"name":"Championship","country":"England"},
  "odds":{"home":2.1,"draw":3.2,"away":3.6}
}</script>
</body></html>`;

const parsed = parseBetExplorerHtmlDetailed(html, '2026-07-23', 'https://www.betexplorer.com/football/');
if (parsed.fixtures.length !== 2) throw new Error(`Expected 2 fixtures, got ${parsed.fixtures.length}`);
if (parsed.tableFixtures !== 1) throw new Error(`Expected 1 table fixture, got ${parsed.tableFixtures}`);
if (parsed.jsonFixtures !== 1) throw new Error(`Expected 1 JSON fixture, got ${parsed.jsonFixtures}`);
if (parsed.fixtures[0].odds.home == null || parsed.fixtures[0].odds.draw == null || parsed.fixtures[0].odds.away == null) {
  throw new Error('Expected complete 1X2 odds.');
}
console.log(JSON.stringify({ ok: true, fixtures: parsed.fixtures.length, tableFixtures: parsed.tableFixtures, jsonFixtures: parsed.jsonFixtures }, null, 2));
