// Standalone scraper: fetches the ParentMap Weekender and writes events.json.
// Run locally:  npm run scrape     (Node 18+; no dependencies needed)
// Or on a schedule via the included GitHub Action (.github/workflows/refresh.yml).

const fs = require('fs');
const path = require('path');
const { parseWeekender, diagnose } = require('./lib/parse');

const SOURCE = 'https://www.parentmap.com/things-to-do/the-weekender/';

(async () => {
  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'WeekenderMap/1.0 (+personal use)' } });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const events = parseWeekender(html, SOURCE);
  if (!events.length) {
    console.error('Parsed 0 events — ParentMap markup may have changed. Diagnostics:');
    console.error(JSON.stringify(diagnose(html), null, 2));
    throw new Error('No events parsed. See diagnostics above; lib/parse.js likely needs updating.');
  }

  const out = {
    updated: new Date().toISOString(),
    source: SOURCE,
    events
  };
  fs.writeFileSync(path.join(__dirname, 'events.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${events.length} events to events.json (updated ${out.updated}).`);
  events.forEach(e => console.log(`  ${e.n}. ${e.title} [${e.costType}, ${e.region}${e.approx ? ', approx' : ''}]`));
})().catch(err => {
  console.error('Scrape failed:', err.message);
  process.exit(1);
});
