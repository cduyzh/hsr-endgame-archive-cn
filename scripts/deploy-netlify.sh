#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SITE_NAME="${NETLIFY_SITE_NAME:-hsr-endgame-archive-cn}"
CONFIG_DIR="$ROOT_DIR/.netlify-config"

# shellcheck source=lib/netlify-cli.sh
. "$ROOT_DIR/scripts/lib/netlify-cli.sh"

if [ "${1:-}" = "--" ]; then
  shift
fi

DEPLOY_MESSAGE="${1:-manual deploy}"

cd "$ROOT_DIR"

mkdir -p "$CONFIG_DIR"
ensure_netlify_cli "$ROOT_DIR"

pnpm build

# 发布结果单独判：调用方常把输出接 `| tail`，管道退出码是 tail 的，
# 失败会被读成 exit 0（2026-09-12 就这样把一次没发出去的部署当成了成功）。
set +e
XDG_CONFIG_HOME="$CONFIG_DIR" \
  "$NETLIFY_CLI_BIN" deploy \
  --prod \
  --dir=dist \
  --functions=netlify/functions \
  --no-build \
  --site "$SITE_NAME" \
  --message "$DEPLOY_MESSAGE"
DEPLOY_EXIT=$?
set -e

if [ "$DEPLOY_EXIT" -ne 0 ]; then
  echo "deploy exit=$DEPLOY_EXIT —— 线上资产未更新；判发布是否生效只看线上包哈希与版本徽章，不要信管道退出码" >&2
  exit "$DEPLOY_EXIT"
fi

echo "deploy exit=0 —— 请再核一次线上包哈希与 changelog 版本号，确认确实是这次构建"
