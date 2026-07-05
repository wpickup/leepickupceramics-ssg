#!/usr/bin/env bash
# golive.sh — flip the docroot `current` symlink on the server.
#
# httpd serves /var/www/htdocs/leepickupceramics.com/current, a symlink. This
# is the same swap the old Node project's maintenance toggle used:
#   current -> site         → the Ruby SSG build is live
#   current -> maintenance  → the site shows the maintenance/holding page
#
# Deploys (deploy.sh / CI) only ever write into the `site/` release dir; going
# live or offline is this deliberate, separate flip.
#
# Usage:
#   REMOTE=will@67.219.101.93 ./golive.sh live         # current -> site
#   REMOTE=will@67.219.101.93 ./golive.sh maintenance   # current -> maintenance
#
# The flip needs write access to the docroot (owned by ceramics:www, symlink by
# root) — adjust the ssh user / add `doas` to match how you manage the box.

set -euo pipefail

REMOTE="${REMOTE:-}"
DOCROOT="${DOCROOT:-/var/www/htdocs/leepickupceramics.com}"
target="${1:-}"

if [ -z "$REMOTE" ] || { [ "$target" != "live" ] && [ "$target" != "maintenance" ]; }; then
  echo "Usage: REMOTE=user@host ./golive.sh {live|maintenance}"
  exit 1
fi

link_target="site"
[ "$target" = "maintenance" ] && link_target="maintenance"

echo "==> Pointing ${DOCROOT}/current -> ${link_target} on ${REMOTE}"
ssh "$REMOTE" "ln -sfn '${link_target}' '${DOCROOT}/current' && ls -l '${DOCROOT}/current'"
echo "==> Done. (No httpd reload needed — the symlink is resolved per request.)"
