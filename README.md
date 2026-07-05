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

## Deploy

Hosted on the OpenBSD VPS (`67.219.101.93`), docroot
`/htdocs/leepickupceramics.com/current`, served by `httpd` behind `relayd`
(see [server-config](../server-config)). Same rsync-over-SSH model as
williampickup-ssg.

**Locally:**

```bash
DEPLOY_DEST=user@67.219.101.93:/htdocs/leepickupceramics.com/current/ ./deploy.sh
```

**Via CI:** `.github/workflows/deploy.yml` runs on manual dispatch
(Actions tab → *Deploy* → *Run workflow*). It needs four repository secrets —
the same values as williampickup-ssg except `DEPLOY_PATH`:

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | the deploy private key (same one williampickup-ssg uses) |
| `DEPLOY_HOST` | `67.219.101.93` |
| `DEPLOY_USER` | the deploy user on the box |
| `DEPLOY_PATH` | `/htdocs/leepickupceramics.com/current/` |

> ⚠️ **First deploy = go-live.** The rsync uses `--delete`, so the first run
> replaces the existing RapidWeaver site at the docroot with this build. That's
> why the workflow is manual-trigger only. To stage first, point `DEPLOY_PATH`
> at a scratch dir (e.g. `.../next/`) and check it before switching the docroot.

## Still to do

- `assets/hero.jpg` is a placeholder (first Current-Work photo) — swap for one
  Lee chooses.
- Contact form has no handler yet.
- Content-editing story for Lee (`cms.leepickupceramics.com` backend) is a
  separate project.
