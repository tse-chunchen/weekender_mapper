const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWeekender } = require('../lib/parse');

test('parses current ParentMap markdown-style event headings', () => {
  const html = `
    <html>
      <body>
        <h3><a href="https://www.parentmap.com/calendar/take-a-spin-at-lemay/">Take a Spin at LeMay</a></h3>
        <p><strong>Date:</strong> Friday, July 17</p>
        <p><strong>Cost:</strong> Included with admission ($17.50–$24.50) or membership</p>
        <p><strong>Location:</strong><a href="https://www.google.com/maps/place/LeMay+-+America%E2%80%99s+Car+Museum/@47.2357057,-122.4329038,641m/data=!3m2!1e3!4b1!4m6!3m5!1s0x5490557c4c901f59:0xf7938232555b2d91!8m2!3d47.2357021!4d-122.4303289!16zL20vMGJtcXcz!5m1!1e1?entry=ttu&g_ep=EgoyMDI2MDcxMy4wIKXMDSoASAFQAw%3D%3D">LeMay – America’s Car Museum</a>, 2702 E. D St., Tacoma</p>

        <h3><a href="https://www.parentmap.com/calendar/family-fun-day-highline-seatac-botanical-garden/">Family Fun Day at Highline SeaTac Botanical Garden</a></h3>
        <p><strong>Date:</strong> Saturday, July 18</p>
        <p><strong>Cost:</strong> Free</p>
        <p><strong>Location:</strong><a href="https://www.google.com/maps/place/Highline+SeaTac+Botanical+Garden/@47.4795885,-122.3063131,638m/data=!3m2!1e3!4b1!4m6!3m5!1s0x5490430e070a5387:0xe087db2efbc35b62!8m2!3d47.4795849!4d-122.307382!16zL20vMDl2NDh2!5m1!1e1?entry=ttu&g_ep=EgoyMDI2MDcxMy4wIKXMDSoASAFQAw%3D%3D">Highline SeaTac Botanical Garden</a>, 13735 24th Ave. S., SeaTac</p>
      </body>
    </html>
  `;

  const events = parseWeekender(html, 'https://example.com');

  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'Take a Spin at LeMay');
  assert.equal(events[0].date, 'Friday, July 17');
  assert.equal(events[0].cost, 'Included with admission ($17.50–$24.50) or membership');
  assert.equal(events[0].region, 'South Sound');
  assert.equal(events[0].loc, 'LeMay – America’s Car Museum, 2702 E. D St., Tacoma');
  assert.equal(events[0].url, 'https://www.parentmap.com/calendar/take-a-spin-at-lemay/');
  assert.equal(events[1].title, 'Family Fun Day at Highline SeaTac Botanical Garden');
});

test('falls back to markdown-style event blocks when the mirror returns plain text', () => {
  const markdown = `
### [Take a Spin at LeMay](https://www.parentmap.com/calendar/take-a-spin-at-lemay/)
**Date:** Friday, July 17
**Cost:** Included with admission ($17.50–$24.50) or membership
**Location:**[LeMay – America’s Car Museum](https://www.google.com/maps/place/LeMay+-+America%E2%80%99s+Car+Museum/@47.2357057,-122.4329038,641m/data=!3m2!1e3!4b1!4m6!3m5!1s0x5490557c4c901f59:0xf7938232555b2d91!8m2!3d47.2357021!4d-122.4303289!16zL20vMGJtcXcz!5m1!1e1?entry=ttu&g_ep=EgoyMDI2MDcxMy4wIKXMDSoASAFQAw%3D%3D), 2702 E. D St., Tacoma

### [Family Fun Day at Highline SeaTac Botanical Garden](https://www.parentmap.com/calendar/family-fun-day-highline-seatac-botanical-garden/)
**Date:** Saturday, July 18
**Cost:** Free
**Location:**[Highline SeaTac Botanical Garden](https://www.google.com/maps/place/Highline+SeaTac+Botanical+Garden/@47.4795885,-122.3063131,638m/data=!3m2!1e3!4b1!4m6!3m5!1s0x5490430e070a5387:0xe087db2efbc35b62!8m2!3d47.4795849!4d-122.307382!16zL20vMDl2NDh2!5m1!1e1?entry=ttu&g_ep=EgoyMDI2MDcxMy4wIKXMDSoASAFQAw%3D%3D), 13735 24th Ave. S., SeaTac
`;

  const events = parseWeekender(markdown, 'https://example.com');

  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'Take a Spin at LeMay');
  assert.equal(events[0].date, 'Friday, July 17');
  assert.equal(events[0].region, 'South Sound');
  assert.equal(events[0].loc, 'LeMay – America’s Car Museum, 2702 E. D St., Tacoma');
  assert.equal(events[1].title, 'Family Fun Day at Highline SeaTac Botanical Garden');
});
