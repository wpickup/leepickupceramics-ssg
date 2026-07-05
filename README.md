# leepickupceramics-ssg

Static site generator for **leepickupceramics.com**, replacing the old
(unsupported) RapidWeaver build. Same proven `build.rb` / ERB / kramdown
plumbing as [williampickup-ssg](../williampickup-ssg) and
[gaiayoga-ssg](../gaiayoga-ssg), with its own small content model and a
distinct gallery-forward visual identity.

## Structure

```
_pages/     markdown pages (home, gallery landing + 2 detail pages, contact)
_posts/     news posts (front matter + body)
_templates/ ERB page templates
_partials/  ERB head/header/footer
css/        site.css
assets/     hero image, gallery.js
build.rb    the generator  →  _out/
```

## Build & preview

```bash
bundle install
ruby build.rb            # → _out/
# preview:
python3 -m http.server 8902 --directory _out
```

## Galleries

Photos are **not** built in. The two gallery pages are `.gallery[data-album]`
mount points; `assets/gallery.js` fetches a live JSON feed from the
[lpc-gallery-proxy](../leepickupceramics-gallery-worker) Cloudflare Worker
(`https://lpc-gallery-proxy.williampickup.workers.dev`), which does Apple's
shared-album handshake server-side. New/removed photos in Lee's shared albums
appear with no rebuild.

## Deploy — symlink-swap model

Hosted on the OpenBSD VPS (`67.219.101.93`), served by `httpd` behind `relayd`
(see [server-config](../server-config)). OpenBSD's `httpd` is chrooted to
`/var/www`, so its `root ".../current"` is the real path
`/var/www/htdocs/leepickupceramics.com/current` — a **symlink** you flip:

```
current -> site         → the Ruby SSG build is live
current -> maintenance  → holding page (site offline)
```

Deploys only ever write into the **`site/` release dir**; going live/offline is
a separate, deliberate `current` flip (`golive.sh`). This reuses the exact
symlink mechanism the old Node project (`../leepickupceramics.site`, now parked)
used for its maintenance toggle, and keeps that parked project's files in the
docroot but web-invisible (httpd only serves `current`).

**Locally:**

```bash
DEPLOY_DEST=user@67.219.101.93:/var/www/htdocs/leepickupceramics.com/site/ ./deploy.sh
REMOTE=user@67.219.101.93 ./golive.sh live    # flip current -> site (go live)
REMOTE=user@67.219.101.93 ./golive.sh maintenance   # take offline
```

**Via CI:** `.github/workflows/deploy.yml` runs on manual dispatch
(Actions tab → *Deploy* → *Run workflow*), rsyncing the build into `site/`.
Four repository secrets — same values as williampickup-ssg except `DEPLOY_PATH`:

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | the deploy private key (same one williampickup-ssg uses) |
| `DEPLOY_HOST` | `67.219.101.93` |
| `DEPLOY_USER` | the deploy user on the box |
| `DEPLOY_PATH` | `/var/www/htdocs/leepickupceramics.com/site/` |

**Go-live sequence (one-time cutover):**

1. Run the workflow (or `deploy.sh`) once to populate `.../site/`.
2. Check it, then `./golive.sh live` to flip `current -> site`.
3. From then on, every deploy rsyncs into `site/` and is immediately live;
   `./golive.sh maintenance` takes it offline again.

> The `--delete` rsync is safe here because it targets the dedicated `site/`
> dir, not the docroot (so it can't clobber the parked Node project or the
> `current`/`maintenance` symlinks).

## Still to do

- `assets/hero.jpg` is a placeholder (first Current-Work photo) — swap for one
  Lee chooses.
- Contact form has no handler yet.

## On the parked Node project (`../leepickupceramics.site`)

A more complex earlier build (Node SSG + git-backed CMS with a pieces/collections
model) is **parked, not deleted** — reachable via its own preview but offline in
prod behind the `maintenance` symlink. Decision (2026-07): ship this simpler Ruby
SSG to get off RapidWeaver now; **Lee's page content is maintained by Will for
now** (no self-service CMS), revisit the richer site later if wanted.

Ideas worth borrowing from it later:

- **Dark-mode toggle** (system preference + manual switch) — cheap to add here.
- **Pieces/collections model + individual piece pages** — if the flat iCloud
  galleries ever need real catalog structure (titles, prices, a shop).
- **Responsive image variants / WebP** for local images (the galleries already
  get sized previews from the Worker).

> ⚠️ Its `scratch.txt` contains the **production CMS password in cleartext** —
> rotate it and remove it from the file regardless of this project's fate.
