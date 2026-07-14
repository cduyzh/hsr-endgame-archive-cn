#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SITE_NAME="${NETLIFY_SITE_NAME:-hsr-endgame-archive-cn}"
CONFIG_DIR="$ROOT_DIR/.netlify-config"

if [ "${1:-}" = "--" ]; then
  shift
fi

DEPLOY_MESSAGE="${1:-manual deploy}"

cd "$ROOT_DIR"

mkdir -p "$CONFIG_DIR"

pnpm build

XDG_CONFIG_HOME="$CONFIG_DIR" \
  pnpm --package=netlify-cli dlx netlify deploy \
  --prod \
  --dir=dist \
  --functions=netlify/functions \
  --no-build \
  --site "$SITE_NAME" \
  --message "$DEPLOY_MESSAGE"
