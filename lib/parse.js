// Shared parser: turns the ParentMap "Weekender" article HTML into structured events.
// Used by both api/events.js (live, per-launch) and scrape.js (scheduled).
// NOTE: scrapers are brittle — if ParentMap changes its page markup, the selectors
// and field patterns below may need adjusting. The app falls back to events.json if so.

const cheerio = require('cheerio');

const CITY_REGION = {
  duvall:'Eastside', everett:'North Sound', snohomish:'North Sound',
  seattle:'Seattle Area', renton:'Seattle Area', kent:'Seattle Area',
  bellevue:'Eastside', redmond:'Eastside', kirkland:'Eastside', issaquah:'Eastside',
  eatonville:'South Sound', tacoma:'South Sound', pierce:'South Sound', puyallup:'South Sound',
};

const REGION_FALLBACK = {
  'Various':     { lat:47.36, lng:-122.00 },
  'South Sound': { lat:47.05, lng:-122.15 },
  'Seattle Area':{ lat:47.60, lng:-122.33 },
  'Eastside':    { lat:47.62, lng:-122.12 },
  'North Sound': { lat:47.95, lng:-122.20 },
};

function inferRegion(text){
  const t = (text || '').toLowerCase();
  if (/various|statewide/.test(t)) return 'Various';
  for (const k in CITY_REGION) if (t.includes(k)) return CITY_REGION[k];
  return 'Seattle Area';
}

// Pull lat/lng out of a Google Maps URL. Prefers the precise place coords (!3d!4d),
// then the map center (@lat,lng).
function extractCoords(href){
  if (!href) return null;
  const place = [...href.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  if (place.length){ const m = place[place.length-1]; return { lat:+m[1], lng:+m[2] }; }
  const at = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat:+at[1], lng:+at[2] };
  return null;
}

function parseWeekender(html, sourceUrl){
  const $ = cheerio.load(html);
  const events = [];
  let n = 0;

  $('h3').each((_, el) => {
    const $h = $(el);
    const headingText = $h.text().replace(/\s+/g, ' ').trim();
    const numbered = headingText.match(/^(\d+)\.\s*(.+)$/);   // "1. Duvall Days Festival"
    if (!numbered) return;

    const a = $h.find('a[href*="/calendar/"]').first();
    const url = a.attr('href') || sourceUrl;
    const title = (a.text().trim() || numbered[2]).replace(/^\d+\.\s*/, '').trim();

    // Collect everything between this heading and the next event heading.
    let date = '', cost = '', locText = '', mapsHref = '';
    const descParas = [];
    let node = $h.next();
    while (node.length && node[0].name !== 'h3'){
      const txt = node.text().replace(/\s+/g, ' ').trim();
      const dM = txt.match(/Date:\s*(.+?)(?:\s*Cost:|\s*Location:|$)/i);
      const cM = txt.match(/Cost:\s*(.+?)(?:\s*Date:|\s*Location:|$)/i);
      const lM = txt.match(/Location:\s*(.+?)$/i);
      if (dM && !date) date = dM[1].trim();
      if (cM && !cost) cost = cM[1].trim();
      if (lM && !locText) locText = lM[1].trim();
      if (!mapsHref){
        const ml = node.find('a[href*="google.com/maps"]').first().attr('href');
        if (ml) mapsHref = ml;
      }
      if (txt && !/Date:|Cost:|Location:/i.test(txt) && txt.length > 40) descParas.push(txt);
      node = node.next();
    }

    const region = inferRegion(locText + ' ' + title);
    let coords = extractCoords(mapsHref);
    const approx = !coords || /various|throughout|locations/i.test(locText);
    if (!coords) coords = REGION_FALLBACK[region] || REGION_FALLBACK['Seattle Area'];
    const costType = /^\s*free/i.test(cost) ? 'free' : (/\$/.test(cost) ? 'paid' : 'free');

    n += 1;
    events.push({
      n, title, date, cost, costType, region,
      loc: locText || 'See event page for location',
      lat: coords.lat, lng: coords.lng, approx,
      url, desc: descParas[0] || ''
    });
  });

  return events;
}

module.exports = { parseWeekender, extractCoords, inferRegion };
