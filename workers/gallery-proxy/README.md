# lpc-gallery-proxy

A tiny Cloudflare Worker that lets leepickupceramics.com show its iCloud
shared-album galleries **live** — photos Lee adds to (or removes from) a shared
album from her phone appear on the site with no rebuild.

## Why it exists

A browser can't call Apple's shared-album API directly — it isn't CORS-open
(this is why the old RapidWeaver plugin needed a PHP hop, and why the site's
old news teaser died when its third-party CORS proxy went away). This Worker
does Apple's 3-step handshake server-side and returns clean, CORS-enabled JSON,
so the page's `gallery.js` stays a dumb consumer.

The Apple protocol is ported directly from the proven Ruby implementation in
`fetch_gallery.rb` from the RapidWeaver-migration project (kept outside this
repo, in `leepickupceramics-migration`).

## API

```
GET /?album=<token>
```

`<token>` is the part after `#` in a share link
(`https://www.icloud.com/sharedalbum/#B0YGY8gBYlHi31` → `B0YGY8gBYlHi31`).

Response:

```json
{
  "album": "B0YGY8gBYlHi31",
  "name": "Current Work",
  "count": 106,
  "photos": [
    {
      "guid": "...",
      "caption": "",
      "date": "2023-01-30T22:23:43Z",
      "width": 2305, "height": 1537,
      "preview": "https://cvws.icloud-content.com/...",   // ~385px, for the grid
      "preview_w": 385, "preview_h": 257,
      "full": "https://cvws.icloud-content.com/..."       // full-res, for the lightbox
    }
  ]
}
```

Photos are newest-first. Responses are edge-cached for 15 minutes (Apple's
signed image URLs live ~1 day, so a short TTL is safe and keeps it live).

Current album tokens:

| Gallery | Token |
|---|---|
| Current Work | `B0YGY8gBYlHi31` |
| Previous Work | `B0wG4Tcsmnr28i` |

## Deploy

Uses the existing `williampickup` Cloudflare account (same one as
`wp-feed-proxy`). No secrets or bindings — it only proxies public album data.

Wrangler is pinned in `workers/package.json`; run these from `workers/`
(see [`../README.md`](../README.md)):

```bash
npm install                # once
npx wrangler login         # first time only
npm run deploy:gallery
```

Deploys to `https://lpc-gallery-proxy.<subdomain>.workers.dev`. That URL is the
default `DEFAULT_ENDPOINT` in `assets/gallery.js` — update
it there if the deployed hostname differs.

## Notes / possible follow-ups

- **Removed photos** are handled for free (the album is the live source of truth
  each request), unlike the build-time `fetch_gallery.rb` approach.
- Consider restricting `Access-Control-Allow-Origin` from `*` to
  `https://leepickupceramics.com` once the domain is settled.
- Apple's preview derivative is only ~385px; fine for the grid but a touch soft
  on high-DPI screens. Apple offers no mid size for these albums, so the
  alternative would be generating our own sizes (not worth it for now).
