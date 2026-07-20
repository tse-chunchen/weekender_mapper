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

function stripMarkdownLinks(text){
  return (text || '').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1').replace(/[*_`~]/g, '').trim();
}

function parseMarkdownWeekender(markdown, sourceUrl){
  const events = [];
  const lines = (markdown || '').split(/\r?\n/);
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^#{1,6}\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (headingMatch) {
      if (current) events.push(current);
      current = {
        title: headingMatch[1].trim(),
        url: headingMatch[2],
        date: '',
        cost: '',
        loc: '',
        mapsHref: '',
        desc: ''
      };
      continue;
    }

    if (!current) continue;

    const dateMatch = line.match(/^\*\*Date:\*\*\s*(.+)$/i);
    if (dateMatch) {
      current.date = dateMatch[1].trim();
      continue;
    }

    const costMatch = line.match(/^\*\*Cost:\*\*\s*(.+)$/i);
    if (costMatch) {
      current.cost = costMatch[1].trim();
      continue;
    }

    const locationMatch = line.match(/^\*\*Location:\*\*\s*(.+)$/i);
    if (locationMatch) {
      const rawLocation = locationMatch[1].trim();
      current.loc = stripMarkdownLinks(rawLocation);
      const mapsHrefMatch = rawLocation.match(/(https?:\/\/[^)]+)\)/);
      if (mapsHrefMatch) current.mapsHref = mapsHrefMatch[1];
      continue;
    }

    if (line.length > 40) current.desc = current.desc || line;
  }

  if (current) events.push(current);
  return events;
}

async function fetchWeekenderHtml(sourceUrl){
  const urls = [sourceUrl];
  if (!sourceUrl.startsWith('https://r.jina.ai/')) {
    const mirrorUrl = `https://r.jina.ai/http://${sourceUrl.replace(/^https?:\/\//, '')}`;
    urls.push(mirrorUrl);
    urls.push(`https://r.jina.ai/http://https://${sourceUrl.replace(/^https?:\/\//, '')}`);
  }

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'WeekenderMap/1.0 (+personal use)' } });
      if (!res.ok) continue;
      const html = await res.text();
      if (html && /<(html|body|p|h[1-6])/i.test(html)) return html;
    } catch (err) {
      // Keep trying the next source.
    }
  }

  return '';
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

  const headingSelector = 'h1, h2, h3, h4, h5, h6';
  $(headingSelector).each((_, el) => {
    const $h = $(el);
    const headingText = $h.text().replace(/\s+/g, ' ').trim();
    const containsCalendar = $h.find('a[href*="/calendar/"]').length > 0 || /\/calendar\//i.test($h.html() || '');
    const numbered = headingText.match(/^(\d+)\.\s*(.+)$/);

    if (!containsCalendar && !numbered) return;

    const a = $h.find('a[href*="/calendar/"]').first();
    const url = a.attr('href') || sourceUrl;
    const title = (a.text().trim() || (numbered ? numbered[2] : headingText)).replace(/^\d+\.\s*/, '').trim();

    if (!title) return;

    // Collect everything between this heading and the next heading of the same or higher level.
    let date = '', cost = '', locText = '', mapsHref = '';
    const descParas = [];
    let node = $h.next();
    while (node.length) {
      const nodeName = node[0] && node[0].name ? node[0].name : '';
      if (/^h[1-6]$/i.test(nodeName)) break;

      const txt = node.text().replace(/\s+/g, ' ').trim();
      const strongText = node.find('strong').map((_, s) => $(s).text().trim()).get().join(' ');
      const dM = txt.match(/Date:\s*(.+?)(?:\s*Cost:|\s*Location:|$)/i) || strongText.match(/Date:\s*(.+?)(?:\s*Cost:|\s*Location:|$)/i);
      const cM = txt.match(/Cost:\s*(.+?)(?:\s*Date:|\s*Location:|$)/i) || strongText.match(/Cost:\s*(.+?)(?:\s*Date:|\s*Location:|$)/i);
      const lM = txt.match(/Location:\s*(.+?)$/i) || strongText.match(/Location:\s*(.+?)$/i);
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

    const locCandidates = [locText, title].filter(Boolean).join(' ');
    const region = inferRegion(locCandidates);
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

  if (events.length) return events;

  const markdownEvents = parseMarkdownWeekender(html, sourceUrl);
  return markdownEvents.map((event, index) => {
    const locCandidates = [event.loc, event.title].filter(Boolean).join(' ');
    const region = inferRegion(locCandidates);
    let coords = extractCoords(event.mapsHref);
    const approx = !coords || /various|throughout|locations/i.test(event.loc);
    if (!coords) coords = REGION_FALLBACK[region] || REGION_FALLBACK['Seattle Area'];
    const costType = /^\s*free/i.test(event.cost) ? 'free' : (/\$/.test(event.cost) ? 'paid' : 'free');

    return {
      n: index + 1,
      title: event.title,
      date: event.date,
      cost: event.cost,
      costType,
      region,
      loc: event.loc || 'See event page for location',
      lat: coords.lat,
      lng: coords.lng,
      approx,
      url: event.url || sourceUrl,
      desc: event.desc || ''
    };
  });
}

module.exports = { parseWeekender, parseMarkdownWeekender, fetchWeekenderHtml, extractCoords, inferRegion };
