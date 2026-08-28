# AGENTS.md — `scripts/`（数据同步、灌库与部署脚本）

均为 Node `>=24` 下运行的 `.mjs` / `.sh` 脚本，通过根目录 `pnpm` 别名调用。它们只读写仓库内文件或调用远端，不改前端运行时代码。

## 脚本一览

| 脚本 | 命令 | 作用 | 数据来源 → 写入 |
| --- | --- | --- | --- |
| `sync-hsr-units.mjs` | `pnpm sync:units` | 同步角色/光锥元数据 | 远程 `static.nanoka.cc/hsr/<ver>/character.json`、`lightcone.json` → `src/data/seed/hsr-units.json`（并更新 `config.json` 的 `units`） |
| `sync-hsr-monsters.mjs` | `pnpm sync:monsters` | 同步怪物元数据（名称/弱点/图片 id） | **读取本地** `public/local-cache/hsr/<ver>/monster.json` → `src/data/seed/hsr-monsters.json` |
| `seed-archive-tables.mjs` | `pnpm seed:archive` | 把 `src/data/seed/config.json` upsert 进 Neon | `config.json` → Postgres（`seasons/stages/characters/lightcones/articles`） |
| `deploy-netlify.sh` | `pnpm deploy:netlify` | 先 `pnpm build` 再发布 `dist/` + `netlify/functions/` 到 Netlify | — |
| `reference-inventory.mjs` | （手动） | 仅生成参考站观察清单，不下载/不复制/不作为运行时依赖 | — |

## 关键注意点

- **数据版本**由环境变量 `HSR_DATA_VERSION` 控制，默认 `4.5`。同步不同版本时显式传入。
- **`sync:monsters` 依赖 `public/local-cache/hsr/<ver>/monster.json`**，而仓库在远程直连改造后已不再保留 `public/local-cache`。直接跑可能因文件缺失失败：需要先从数据源生成/恢复该 `monster.json`，或改造成直连 `static.nanoka.cc` 拉取。改这个脚本前先确认输入文件存在。
- `sync:units` 走远程，能独立运行；它会保留 `config.json` 中已有单位的业务字段，只补/更新元数据与 `sourceId`。
- **同步脚本只更新 seed 数据，不下载图片**；图片由前端经 `dataSource.ts` 直连，勿把图片落盘。
- `seed:archive` 连接顺序与 `netlify/functions/_shared.ts` 一致：`NETLIFY_DATABASE_URL ?? DATABASE_URL ?? POSTGRES_URL`。支持 `-- --dry-run`、`-- --table=seasons,stages`、`-- --id=<id>`。

## 部署

- `deploy-netlify.sh`：`set -eu`，站点名默认 `NETLIFY_SITE_NAME=hsr-endgame-archive-cn`，登录态在已忽略的 `.netlify-config/`（先 `pnpm netlify:login`）。
- 发布前脚本会自动完整跑 `pnpm build`（typecheck + test + lint + vite build）。Netlify 构建环境固定 Node 24（见 `netlify.toml`）。
- 不要为了发布而把数据源 JSON/图片拷进 `dist` 或 `public`；直连改造的目的就是省带宽。
