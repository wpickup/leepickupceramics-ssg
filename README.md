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

## Deploy — GitHub Pages

Part of the broader "Exit Vultr" migration — this site left the OpenBSD VPS
behind in favour of GitHub Pages (no server, no SSH keys, no symlink-swap).
`.github/workflows/deploy.yml` builds with Ruby and publishes `_out/`
straight to Pages via `actions/upload-pages-artifact` +
`actions/deploy-pages` on every push to `main` (or manual dispatch).

**One-time repo setup**, after the first push:

1. Settings → Pages → **Source: GitHub Actions** (not "Deploy from a branch").
2. That's it for secrets — this workflow uses the built-in `GITHUB_TOKEN`
   via OIDC (`id-token: write` in the workflow), no repository secrets to
   configure.

**Custom domain:** `build.rb` writes a `CNAME` file (`leepickupceramics.com`)
into `_out/` on every build, so the apex domain is set via the published
artifact itself rather than the Pages dashboard field — it survives even if
that setting is ever cleared. DNS still needs an apex record pointed at
GitHub Pages (A records to GitHub's IPs, or an ALIAS/ANAME if the DNS host
supports it) — see the DNS-to-Porkbun step of the Exit Vultr plan.

**Locally**, just build and preview — there's no separate deploy step to run:

```bash
ruby build.rb
python3 -m http.server 8902 --directory _out
```

## Still to do

- `assets/hero.jpg` is a placeholder (first Current-Work photo) — swap for one
  Lee chooses.
- DNS for leepickupceramics.com still needs to point at GitHub Pages (see
  Exit Vultr plan) — until then this deploys correctly but isn't reachable at
  the real domain.

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
