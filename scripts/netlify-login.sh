#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CONFIG_DIR="$ROOT_DIR/.netlify-config"

# shellcheck source=lib/netlify-cli.sh
. "$ROOT_DIR/scripts/lib/netlify-cli.sh"

mkdir -p "$CONFIG_DIR"
ensure_netlify_cli "$ROOT_DIR"

XDG_CONFIG_HOME="$CONFIG_DIR" "$NETLIFY_CLI_BIN" login
