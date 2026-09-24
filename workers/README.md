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

Each Worker's `wrangler.toml` sets its `name`, and deploying **replaces the
live Worker of that name** — so deploy from this repo, and check first if
anything might have been edited in the dashboard (see below).

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
JSON (full example in [`gallery-proxy/README.md`](gallery-proxy/README.md)):

```json
{ "album": "…", "name": "…", "count": 1,
  "photos": [ { "guid": "…", "caption": "", "date": "…", "width": 2305, "height": 1537,
                "preview": "https://…", "preview_w": 385, "preview_h": 257,
                "full": "https://…" } ] }
```

`gallery.js` uses `photos[].preview`, `preview_w`/`preview_h`, `full` and
`caption`. Apple's image URLs expire after about a day, which is why the
site fetches fresh on every visit (the Worker caches for 15 minutes)
rather than building photos in.

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

## Checking a change before deploying

`npx wrangler deploy --dry-run` (run inside a Worker's folder) bundles it and
validates the config without uploading anything.

To see whether what's in this repo still matches what's live — e.g. after
an edit made in the Cloudflare dashboard — download the deployed version
and compare it with a bundle of the repo's copy. Cloudflare only stores the
*bundled* Worker (comments stripped, quotes normalised, `const` → `var`, …),
so comparing it with `src/index.js` directly always shows harmless noise;
bundling the repo's copy the same way first gives an exact comparison:

```sh
cd workers
npx wrangler init live-check --from-dash lpc-contact-worker   # say no to git and to deploying
cd contact && npx wrangler deploy --dry-run --outdir ../bundle-check && cd ..
diff bundle-check/index.js live-check/src/index.js && echo "identical"
rm -rf bundle-check live-check
```

(For the gallery Worker, use `lpc-gallery-proxy` and `cd gallery-proxy`.)
Answer **no** when `wrangler init` asks about git: inside this repo, yes
can make it commit the downloaded project onto your current branch.

Treat this repo as the source of truth: make changes here and deploy them,
rather than editing in the dashboard.
