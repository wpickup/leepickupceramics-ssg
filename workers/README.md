# Cloudflare Workers

The two Cloudflare Workers the site depends on, kept here so everything
leepickupceramics.com needs lives in one repo. Both run on the
`williampickup.workers.dev` account, alongside williampickup.org's
`wp-feed-proxy` (whose source lives in the `williampickup-ssg` repo).

| Folder | Worker | Used by | What it does |
|---|---|---|---|
| `gallery-proxy/` | [`lpc-gallery-proxy`](https://lpc-gallery-proxy.williampickup.workers.dev) | `assets/gallery.js` | Fetches a photo list from an Apple shared album (Apple's API isn't CORS-open, so the browser can't ask it directly) |
| `contact/` | [`lpc-contact-worker`](https://lpc-contact-worker.williampickup.workers.dev) | `assets/contact.js` | Receives the contact form and delivers the message |

The Workers are deployed **by hand** with Wrangler, not by the site's
GitHub Actions workflow, which only builds and publishes the static site
(and ignores changes under `workers/`).

## Setup

Wrangler is pinned in `package.json`, so every machine and Node version
uses the same one — no global install, and no "command not found" after
nodenv switches Node versions (Node 22+ required):

```sh
cd workers
npm install
npx wrangler whoami     # check you're logged in to the williampickup account
npx wrangler login      # if not
```

## Deploying

```sh
cd workers
npm run deploy:gallery   # lpc-gallery-proxy
npm run deploy:contact   # lpc-contact-worker
```

`npm run dev:gallery` / `npm run dev:contact` run one locally with
`wrangler dev`.

Each Worker's config file (`wrangler.toml` or `wrangler.jsonc`) sets its
`name`, and deploying **replaces the live Worker of that name** — so only
deploy code that came from, or was checked against, what's live.

## Secrets

Never commit secrets — this repo is public. Anything sensitive (an email
service API key, a spam-check secret, …) is stored in Cloudflare:

```sh
npx wrangler secret list --name lpc-contact-worker    # names only, never values
npx wrangler secret put SOME_NAME --name lpc-contact-worker
```

For `wrangler dev`, put local values in a `.dev.vars` file inside the
Worker's folder (gitignored).

## What each Worker must keep doing

The site's JavaScript depends on these request/response shapes — change
them together with `assets/gallery.js` / `assets/contact.js`.

**`lpc-gallery-proxy`** — `GET /?album=<token>`, where `<token>` is the
shared-album token from a gallery page's `data-album` attribute. Returns
JSON:

```json
{ "photos": [ { "preview": "https://…", "preview_w": 800, "preview_h": 600,
                "full": "https://…", "caption": "…" } ] }
```

`preview_w`/`preview_h` and `caption` are optional. Apple's image URLs
expire after about a day, which is why the site fetches fresh on every
visit rather than building photos in.

**`lpc-contact-worker`** — `POST /` with a JSON body:

```json
{ "name": "…", "email": "…", "phone": "…", "inquiryType": "general",
  "message": "…", "website": "", "loadedAt": 1727150000000 }
```

`website` is a honeypot field (a hidden input real visitors leave empty)
and `loadedAt` is when the page loaded (for a too-fast-to-be-human check).
Responds `{ "ok": true }` on success, or `{ "ok": false, "error": "…" }`
(whose message is shown to the visitor) with a non-2xx status on failure.
Must send CORS headers allowing `https://leepickupceramics.com`.

## Bringing the source in (one-time)

Until this is done, the `gallery-proxy/` and `contact/` folders don't exist
and the npm scripts above fail harmlessly.

**Gallery proxy** — its source is in a local folder,
`leepickupceramics-gallery-worker`, next to where this repo used to live
on the Mac:

```sh
cd workers
mkdir gallery-proxy
cp -R ~/path/to/leepickupceramics-gallery-worker/. gallery-proxy/
rm -rf gallery-proxy/.git gallery-proxy/node_modules gallery-proxy/.wrangler
```

Then delete its own `package.json`/`package-lock.json` if it has them
(Wrangler comes from `workers/package.json`). To confirm the local copy
matches what's actually deployed, download the live version and compare:

```sh
npx wrangler init live-gallery --from-dash lpc-gallery-proxy
diff -r live-gallery/src gallery-proxy/src    # adjust paths to match
rm -rf live-gallery
```

**Contact worker** — no local copy is known, so download it from
Cloudflare (or copy it from the dashboard's code editor):

```sh
cd workers
npx wrangler init contact --from-dash lpc-contact-worker
```

`wrangler init` may ask a few questions (say **no** to git and to
deploying). Then trim it to the source and config: keep `src/` and
`wrangler.jsonc` (or `wrangler.toml`), delete the generated
`package.json`, lockfile, `node_modules/`, `.git/` and any test setup.

**Before committing either one**, check for secrets written directly into
the code or config:

```sh
grep -rniE "key|token|secret|password|api" gallery-proxy contact
```

Anything real belongs in `wrangler secret put`, not in the repo.
