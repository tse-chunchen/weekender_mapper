// lib/parse.js — dependency-free parser for ParentMap's "The Weekender".
//
// Strategy (rewritten July 2026 after ParentMap moved to WordPress):
//   Pass 1: find every link to an event page (/calendar/... or /series/...),
//           and decide which ones are real event listings (a "Date:" plus at
//           least one more labeled field follows them). This filters out nav
//           links, signup blocks, and event links inside descriptions.
//   Pass 2: slice the HTML between consecutive REAL events and pull each
//           event's Date/Cost/Location lines, the first Google Maps link
//           (for coordinates), and a description paragraph from its slice.
//
// No cheerio / no dependencies — plain string + regex work, so the exact same
// code runs in the offline tests (test/run-tests.js).

const BASE = 'https://www.parentmap.com';
const LABELS = ['Dates?', 'When', 'Costs?', 'Price', 'Admission', 'Location', 'Where', 'Venue'];

const CITY_REGION = {
  duvall:'Eastside', woodinville:'Eastside', kirkland:'Eastside', redmond:'Eastside',
  bellevue:'Eastside', issaquah:'Eastside', kenmore:'Eastside', bothell:'Eastside', sammamish:'Eastside',
  everett:'North Sound', snohomish:'North Sound', lynnwood:'North Sound', edmonds:'North Sound',
  mukilteo:'North Sound', 'mill creek':'North Sound', arlington:'North Sound', marysville:'North Sound',
  seattle:'Seattle Area', renton:'Seattle Area', seatac:'Seattle Area', burien:'Seattle Area',
  tukwila:'Seattle Area', shoreline:'Seattle Area', kent:'Seattle Area',
  tacoma:'South Sound', fircrest:'South Sound', puyallup:'South Sound', eatonville:'South Sound',
  lakewood:'South Sound', olympia:'South Sound', auburn:'South Sound', 'federal way':'South Sound', pierce:'South Sound'
};

const REGION_FALLBACK = {
  'Various':      { lat:47.36, lng:-122.00 },
  'South Sound':  { lat:47.05, lng:-122.15 },
  'Seattle Area': { lat:47.60, lng:-122.33 },
  'Eastside':     { lat:47.62, lng:-122.12 },
  'North Sound':  { lat:47.95, lng:-122.20 }
};

const NAMED_ENTITIES = { amp:'&', quot:'"', apos:"'", nbsp:' ', rsquo:'\u2019', lsquo:'\u2018',
  rdquo:'\u201d', ldquo:'\u201c', ndash:'\u2013', mdash:'\u2014', hellip:'\u2026', eacute:'\u00e9' };

function decodeEntities(s){
  return (s || '')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ' '; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ' '; } })
    .replace(/&([a-z]+);/gi, (m, name) => Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name.toLowerCase())
      ? NAMED_ENTITIES[name.toLowerCase()] : m);
}

// HTML fragment -> plain text; block-level tags become newlines so labeled
// fields land on separate lines.
function stripTags(frag){
  return decodeEntities(
    String(frag || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(\/)?(p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|figure|figcaption|form)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// Pull lat/lng from a Google Maps URL: prefer precise place coords (!3d..!4d..),
// fall back to map-center (@lat,lng). Short links (maps.app.goo.gl) carry none.
function extractCoords(href){
  if (!href) return null;
  const h = String(href).replace(/&amp;/g, '&');
  const place = [...h.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  if (place.length){ const m = place[place.length - 1]; return { lat:+m[1], lng:+m[2] }; }
  const at = h.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat:+at[1], lng:+at[2] };
  return null;
}

function inferRegion(text){
  const t = (text || '').toLowerCase();
  if (/various|statewide/.test(t)) return 'Various';
  for (const k in CITY_REGION) if (t.includes(k)) return CITY_REGION[k];
  return 'Seattle Area';
}

// Read one labeled field ("Date: ...") from slice text. Tolerates "Cost :"
// (colon outside the bold tag) and several labels sharing one line.
function fieldFrom(text, names){
  const stop = LABELS.join('|');
  const re = new RegExp('(?:^|\\n)\\s*(?:' + names.join('|') + ')\\s*:\\s*(.+?)(?=\\s*(?:' + stop + ')\\s*:|\\n|$)', 'i');
  const m = text.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

const EVENT_ANCHOR_RE = /<a\b[^>]*href=["']([^"']*\/(?:calendar|series)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const JUNK_LINE_RE = /sign up|enews|inbox|newsletter|validation purposes|captcha|choose your region|this field/i;

function findOccurrences(html){
  const out = [];
  let m;
  EVENT_ANCHOR_RE.lastIndex = 0;
  while ((m = EVENT_ANCHOR_RE.exec(html))){
    let href = m[1];
    if (!/^https?:/i.test(href)) href = BASE + (href.startsWith('/') ? '' : '/') + href;
    out.push({
      start: m.index,
      end: EVENT_ANCHOR_RE.lastIndex,
      href: href.split('?')[0].replace(/\/+$/, ''),
      title: stripTags(m[2]).replace(/\n/g, ' ').replace(/^\s*\d+[.)]\s*/, '').trim()
    });
  }
  return out;
}

function extractFromSlice(slice){
  const text = stripTags(slice);
  const date = fieldFrom(text, ['Dates?', 'When']);
  const cost = fieldFrom(text, ['Costs?', 'Price', 'Admission']);
  const loc  = fieldFrom(text, ['Location', 'Where', 'Venue']);
  const mapsMatch = slice.match(/href=["']([^"']*(?:google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)[^"']*)["']/i);
  const mapsHref = mapsMatch ? mapsMatch[1] : '';

  let desc = '';
  const labelLine = new RegExp('^(?:' + LABELS.join('|') + ')\\s*:', 'i');
  for (const ln of text.split('\n')){
    const t = ln.trim();
    if (t.length < 60) continue;
    if (labelLine.test(t)) continue;
    if (JUNK_LINE_RE.test(t)) continue;
    desc = t.length > 400 ? t.slice(0, 397) + '\u2026' : t;
    break;
  }
  return { date, cost, loc, mapsHref, desc };
}

function parseWeekender(html /*, sourceUrl (unused, kept for compatibility) */){
  html = String(html || '');
  const occurrences = findOccurrences(html);

  // Pass 1: which occurrences are real event listings? (Slices between ALL
  // occurrences; a real listing has its Date/etc. immediately after the link.)
  const realIdx = [];
  for (let i = 0; i < occurrences.length; i++){
    const o = occurrences[i];
    const end = i + 1 < occurrences.length ? occurrences[i + 1].start
                                           : Math.min(html.length, o.end + 6000);
    const f = extractFromSlice(html.slice(o.end, end));
    if (f.date && (f.cost || f.loc || f.mapsHref) && o.title && o.title.length >= 4){
      realIdx.push(i);
    }
  }

  // Pass 2: slice between consecutive REAL events, so event links that appear
  // inside a description can't truncate it.
  const seen = new Set();
  const events = [];
  for (let j = 0; j < realIdx.length; j++){
    const o = occurrences[realIdx[j]];
    if (seen.has(o.href)) continue;
    seen.add(o.href);

    const end = j + 1 < realIdx.length ? occurrences[realIdx[j + 1]].start
                                       : Math.min(html.length, o.end + 6000);
    const f = extractFromSlice(html.slice(o.end, end));

    const region = inferRegion((f.loc || '') + ' ' + o.title);
    let coords = extractCoords(f.mapsHref);
    const approx = !coords || /various|throughout|statewide|multiple locations/i.test(f.loc || '');
    if (!coords) coords = REGION_FALLBACK[region] || REGION_FALLBACK['Seattle Area'];
    const cost = f.cost || 'See event page';
    const costType = /^\s*free/i.test(cost) ? 'free'
                   : (/[$]|admission|ticket/i.test(cost) ? 'paid' : 'free');

    events.push({
      n: events.length + 1,
      title: o.title,
      date: f.date,
      cost, costType, region,
      loc: f.loc || 'See event page for location',
      lat: coords.lat, lng: coords.lng,
      approx: !!approx,
      url: o.href,
      desc: f.desc || ''
    });
    if (events.length >= 14) break;
  }
  return events;
}

// When parsing fails, this tells us what the scraper actually saw.
function diagnose(html){
  html = String(html || '');
  const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const anchors = findOccurrences(html).slice(0, 5).map(o => o.title.slice(0, 60));
  const eventLinkCount = (html.match(/\/(?:calendar|series)\//g) || []).length;
  const dateLabelCount = (stripTags(html).match(/\bDate\s*:/gi) || []).length;
  return {
    htmlLength: html.length,
    pageTitle: stripTags(titleTag).slice(0, 120),
    eventLinkCount,
    dateLabelCount,
    sampleAnchorTitles: anchors
  };
}

module.exports = { parseWeekender, extractCoords, inferRegion, diagnose };
