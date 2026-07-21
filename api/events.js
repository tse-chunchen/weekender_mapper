// Serverless endpoint (Vercel / Netlify Functions style).
// Scrapes ParentMap on EACH request and returns fresh JSON — this is what gives
// the app "refresh on every launch." Runs server-side, so there's no CORS problem.
//
// Deploy this folder on Vercel and the function appears at /api/events.
// Then set LIVE_ENDPOINT = "/api/events" in index.html.

const { parseWeekender, diagnose } = require('../lib/parse');

const SOURCE = 'https://www.parentmap.com/things-to-do/the-weekender/';

module.exports = async (req, res) => {
  try {
    const r = await fetch(SOURCE, { headers: { 'User-Agent': 'WeekenderMap/1.0 (+personal use)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const events = parseWeekender(html, SOURCE);
    if (!events.length) throw new Error('No events parsed: ' + JSON.stringify(diagnose(html)));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.end(JSON.stringify({ updated: new Date().toISOString(), source: SOURCE, events }));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: String(err.message || err).slice(0, 500) }));
  }
};
