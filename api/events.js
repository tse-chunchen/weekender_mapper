// Serverless endpoint (Vercel / Netlify Functions style).
// Scrapes ParentMap on EACH request and returns fresh JSON — this is what gives the
// app "refresh on every launch." Runs server-side, so there's no CORS problem.
//
// Deploy: put this whole folder on Vercel (or adapt for your host). The function will
// be available at /api/events. Then set LIVE_ENDPOINT = "/api/events" in index.html.

const { parseWeekender, fetchWeekenderHtml } = require('../lib/parse');

const SOURCE = 'https://www.parentmap.com/things-to-do/the-weekender/';

module.exports = async (req, res) => {
  try {
    const html = await fetchWeekenderHtml(SOURCE);
    if (!html) throw new Error('Unable to retrieve ParentMap Weekender page');
    const events = parseWeekender(html, SOURCE);
    if (!events.length) throw new Error('No events parsed');

    res.setHeader('Content-Type', 'application/json');
    // Cache at the edge for an hour; serve stale while refreshing in the background.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.end(JSON.stringify({ updated: new Date().toISOString(), source: SOURCE, events }));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
};
