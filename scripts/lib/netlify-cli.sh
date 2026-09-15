#!/bin/sh
# netlify-cli 的定位与安装：供 deploy / login 两个入口共用。
#
# 为什么不用 `pnpm --package=netlify-cli dlx`：那条路每次都现装 CLI，而本机 pnpm/npm 的
# 全局 registry 指向 npmmirror，镜像上 `@netlify/serverless-functions-api` 缺新版本，
# dlx 必然失败（2026-09-12 实测）。改成「已装就复用，没装就从 npmjs.org 装进仓库内的
# 隔离前缀」，不动任何全局配置。
#
# 用法：`. "$ROOT_DIR/scripts/lib/netlify-cli.sh"` 后调用 `ensure_netlify_cli`，
# 成功后 CLI 路径在 `$NETLIFY_CLI_BIN`。

NETLIFY_CLI_VERSION="${NETLIFY_CLI_VERSION:-27.5.2}"
NETLIFY_CLI_REGISTRY="${NETLIFY_CLI_REGISTRY:-https://registry.npmjs.org}"

ensure_netlify_cli() {
  # $1 = 仓库根目录；CLI 装在仓库内已忽略的 .netlify-cli/，与 .netlify-config/ 同级。
  root_dir="$1"
  cli_dir="${NETLIFY_CLI_PREFIX:-$root_dir/.netlify-cli}"
  NETLIFY_CLI_BIN="$cli_dir/node_modules/.bin/netlify"

  if [ -x "$NETLIFY_CLI_BIN" ]; then
    echo "复用 netlify-cli：$NETLIFY_CLI_BIN"
    return 0
  fi

  echo "安装 netlify-cli@$NETLIFY_CLI_VERSION 到 $cli_dir（registry: $NETLIFY_CLI_REGISTRY）"
  mkdir -p "$cli_dir"
  npm install --no-save --prefix "$cli_dir" --registry="$NETLIFY_CLI_REGISTRY" \
    "netlify-cli@$NETLIFY_CLI_VERSION" >/dev/null

  if [ ! -x "$NETLIFY_CLI_BIN" ]; then
    echo "netlify-cli 安装失败：$NETLIFY_CLI_BIN 不存在" >&2
    return 1
  fi

  echo "已安装 netlify-cli：$("$NETLIFY_CLI_BIN" --version 2>/dev/null || echo unknown)"
}
