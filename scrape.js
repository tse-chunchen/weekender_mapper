// Standalone scraper: fetches the ParentMap Weekender and writes events.json.
// Run locally:  node scrape.js
// Or on a schedule via the included GitHub Action (.github/workflows/refresh.yml).
// Requires Node 18+ (uses built-in fetch) and `npm install`.

const fs = require('fs');
const path = require('path');
const { parseWeekender } = require('./lib/parse');

const SOURCE = 'https://www.parentmap.com/things-to-do/the-weekender/';

(async () => {
  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'WeekenderMap/1.0 (+personal use)' } });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const events = parseWeekender(html, SOURCE);
  if (!events.length) {
    throw new Error('Parsed 0 events — ParentMap markup may have changed. Check lib/parse.js selectors.');
  }

  const out = {
    updated: new Date().toISOString(),
    source: SOURCE,
    events
  };
  fs.writeFileSync(path.join(__dirname, 'events.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${events.length} events to events.json (updated ${out.updated}).`);
})().catch(err => {
  console.error('Scrape failed:', err.message);
  process.exit(1);
});
