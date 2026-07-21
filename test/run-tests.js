// Offline test: runs the real parser against test/fixture.html, a replica of
// ParentMap's live WordPress markup (July 2026) including known traps.
const fs = require('fs');
const path = require('path');
const { parseWeekender, extractCoords, diagnose } = require('../lib/parse');

const html = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');
const events = parseWeekender(html);

let failures = 0;
function check(name, cond, extra){
  if (cond) { console.log('  ok  ' + name); }
  else { failures++; console.error('FAIL  ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); }
}

console.log('Parsed ' + events.length + ' events:');
events.forEach(e => console.log('  ' + e.n + '. ' + e.title + ' [' + e.costType + ', ' + e.region + ', approx=' + e.approx + ']'));
console.log('');

check('finds exactly the 4 real events', events.length === 4, events.map(e => e.title));
check('titles are clean', events[0] && events[0].title === 'Take a Spin at LeMay', events[0]);
check('series links accepted', events.some(e => e.url.includes('/series/46697')), null);
check('signup block excluded', !events.some(e => /inbox/i.test(e.title)), null);
check('Sequim link inside a description excluded', !events.some(e => /sequim/i.test(e.url)), null);
check('related-article heading excluded', !events.some(e => /perseids/i.test(e.title)), null);
check('nav /calendar (no slash) excluded', !events.some(e => /calendar$/.test(e.url)), null);
check('coords from !3d!4d', events[0] && Math.abs(events[0].lat - 47.2357021) < 1e-6 && Math.abs(events[0].lng + 122.4303289) < 1e-6, events[0]);
check('"Cost</strong>:" colon-outside-bold parsed', events[1] && events[1].cost === 'Free' && events[1].costType === 'free', events[1]);
check('paid admission classified paid', events[0] && events[0].costType === 'paid', events[0] && events[0].cost);
check('$9 classified paid', events[2] && events[2].costType === 'paid', events[2] && events[2].cost);
check('regions inferred', events[0].region === 'South Sound' && events[2].region === 'Eastside', events.map(e => e.region));
check('short goo.gl link -> approx with region fallback', events[3] && events[3].approx === true && typeof events[3].lat === 'number', events[3]);
check('dates captured', events.every(e => /July/.test(e.date)), events.map(e => e.date));
check('locations captured', events[0].loc.includes('Tacoma'), events[0].loc);
check('descriptions captured, junk skipped', events.every(e => e.desc.length > 40) && !events.some(e => /sign up|captcha/i.test(e.desc)), events.map(e => e.desc.slice(0,40)));
check('entities decoded in text', events[0].loc.includes('America\u2019s'), events[0].loc);
check('coords helper: @lat,lng fallback', (() => { const c = extractCoords('https://www.google.com/maps/@47.1,-122.2,12z'); return c && c.lat === 47.1; })(), null);
check('diagnose returns counts', (() => { const d = diagnose(html); return d.eventLinkCount > 0 && d.pageTitle.length > 0; })(), null);

console.log('');
if (failures){ console.error(failures + ' test(s) FAILED'); process.exit(1); }
console.log('All tests passed.');
