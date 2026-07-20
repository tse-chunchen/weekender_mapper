# The Weekender — Seattle-Area Family Fun Map

An interactive map of ParentMap's weekly "Weekender" family events, with filters,
a synced sidebar list, clickable pins, and an **auto-scraper** that keeps the data fresh.

## Files

| File | What it does |
|------|--------------|
| `index.html` | The app. Loads its data from `events.json` (or a live endpoint), renders the map. |
| `events.json` | The event data the app reads. A scraper keeps this current. |
| `lib/parse.js` | Shared parser: ParentMap article HTML → structured events. |
| `scrape.js` | Standalone scraper. Run `npm run scrape` to rewrite `events.json`. |
| `api/events.js` | Serverless endpoint that scrapes ParentMap **on every request** (live refresh). |
| `.github/workflows/refresh.yml` | Scheduled GitHub Action that re-scrapes weekly and commits `events.json`. |
| `package.json` | Dependencies (`cheerio`) and the `scrape` script. |

## The one constraint to understand

A web page **cannot** scrape parentmap.com directly from the visitor's browser — browsers
block cross-site requests (CORS). So the scraping must happen **on a server**, never in the
browser. There are two ways to do that, and this project includes both:

### Option A — Live refresh on every launch (serverless)
1. Deploy this folder to **Vercel** (free): `npx vercel` from this directory, or connect the repo at vercel.com.
2. The function becomes available at `/api/events`.
3. In `index.html`, set `const LIVE_ENDPOINT = "/api/events";`
4. Now the app re-scrapes ParentMap every time it loads. `events.json` stays as a fallback.

### Option B — Scheduled refresh, no server (GitHub Action)
1. Push this folder to a GitHub repo and enable GitHub Pages (Settings → Pages).
2. The included workflow runs every Thursday (when the Weekender updates) and on demand,
   re-scrapes, and commits a fresh `events.json`.
3. The app loads the latest `events.json` on each launch. Leave `LIVE_ENDPOINT = ""`.

Option A is "fresh every single visit." Option B is "fresh every week, free, no server."
You can use both — A as primary, B keeps the fallback current.

## Run the scraper locally
```bash
npm install      # installs cheerio
npm run scrape   # rewrites events.json from the live article
```
Requires Node 18+.

## Add it to your iPhone as an app
1. Host it (Vercel, GitHub Pages, Netlify, or Cloudflare Pages — all have free tiers).
2. Open the URL in **Safari**.
3. Share button → **Add to Home Screen** → **Add**.
It launches full-screen with its own icon. (Hosting also fixes any map-tile blocking you
may see inside an in-app preview.)

## Heads-up: scrapers are brittle
The parser keys off ParentMap's current page structure (numbered `h3` headings, `Date:` /
`Cost:` / `Location:` labels, and Google Maps links for coordinates). If they redesign the
article, parsing may return fewer/odd events — the app then falls back to the last good
`events.json`. If that happens, the selectors in `lib/parse.js` need a small update.
Events listed as "various"/"throughout" get an approximate pin and are flagged in the app.
