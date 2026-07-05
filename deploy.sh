#!/usr/bin/env bash
# deploy.sh — build and deploy leepickupceramics.com
# Usage: DEPLOY_DEST=user@67.219.101.93:/var/www/htdocs/leepickupceramics.com/site/ ./deploy.sh
#
# Same shape as williampickup-ssg's deploy.sh, minus pagefind/webmentions
# (this site has neither). Galleries load live client-side via the
# lpc-gallery-proxy Worker, so no photos are shipped in _out/.
#
# Symlink-swap model: this rsyncs the build into a RELEASE dir (e.g. .../site/),
# it does NOT touch the docroot symlink. httpd serves `.../current`, which is a
# symlink you flip with golive.sh (current -> site to go live, current ->
# maintenance to take the site offline). Once current -> site, every deploy is
# immediately live. Note the path is the real /var/www/... path (OpenBSD httpd
# is chrooted to /var/www, so its `root .../current` = /var/www/htdocs/...).

set -euo pipefail

DEPLOY_DEST="${DEPLOY_DEST:-}"
OUT_DIR="${SSG_OUT_DIR:-_out}"

echo "==> Building site..."
ruby build.rb

if [ -z "$DEPLOY_DEST" ]; then
  echo ""
  echo "Build complete. To deploy, set DEPLOY_DEST and re-run:"
  echo "  DEPLOY_DEST=user@host:/path/to/webroot/ ./deploy.sh"
  exit 0
fi

echo ""
echo "==> Deploying to ${DEPLOY_DEST}..."
rsync -avz --delete \
  --omit-dir-times \
  --no-perms \
  --exclude '.DS_Store' \
  "$OUT_DIR/" "${DEPLOY_DEST}"

echo ""
echo "==> Done."
