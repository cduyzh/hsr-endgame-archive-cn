# AGENTS.md — `scripts/`（数据同步、灌库与部署脚本）

均为 Node `>=24` 下运行的 `.mjs` / `.sh` 脚本，通过根目录 `pnpm` 别名调用。它们只读写仓库内文件或调用远端，不改前端运行时代码。

> 改动本目录（含根 `package.json` 的脚本别名）后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」同步更新本文件（脚本一览表、命令名）与根 `AGENTS.md` 的「技术栈与命令」「数据更新流程」、`README.md` 的命令与项目结构，**同一提交内完成**。

## 脚本一览

| 脚本                      | 命令                  | 作用                                                             | 数据来源 → 写入                                                                                                                        |
| ------------------------- | --------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `sync-hsr-units.mjs`      | `pnpm sync:units`     | 同步角色/光锥元数据                                              | 远程 `static.nanoka.cc/hsr/<ver>/character.json`、`lightcone.json` → `src/data/seed/hsr-units.json`（并更新 `config.json` 的 `units`） |
| `sync-hsr-monsters.mjs`   | `pnpm sync:monsters`  | 同步怪物元数据（名称/弱点/图片 id）                              | 远程 `static.nanoka.cc/hsr/<ver>/monster.json` → `src/data/seed/hsr-monsters.json`                                                     |
| `seed-archive-tables.mjs` | `pnpm seed:archive`   | 把 `src/data/seed/config.json` upsert 进 Neon                    | `config.json` → Postgres（`seasons/stages/characters/lightcones/articles`）                                                            |
| `deploy-netlify.sh`       | `pnpm deploy:netlify` | 先 `pnpm build` 再发布 `dist/` + `netlify/functions/` 到 Netlify | —                                                                                                                                      |
| `reference-inventory.mjs` | （手动）              | 仅生成参考站观察清单，不下载/不复制/不作为运行时依赖             | —                                                                                                                                      |

## 关键注意点

- **数据版本**由环境变量 `HSR_DATA_VERSION` 控制，默认 `4.5`。同步不同版本时显式传入。
- `sync:monsters` 与 `sync:units` 均直连 `static.nanoka.cc` 抓取，可独立运行；抓取失败会抛出带数据地址的错误。两者都只写 `src/data/seed/*.json`，不落盘图片。
- **同步脚本只更新 seed 数据，不下载图片**；图片由前端经 `dataSource.ts` 直连，勿把图片落盘。
- `seed:archive` 连接顺序与 `netlify/functions/_shared.ts` 一致：`NETLIFY_DATABASE_URL ?? DATABASE_URL ?? POSTGRES_URL`。支持 `-- --dry-run`、`-- --table=seasons,stages`、`-- --id=<id>`。
- **`stages` 表来自 `config.json` 的 `bosses`**（不是独立的 `stages` 字段）。当前 seed 的 `bosses` 为空数组，敌方阶段由前端 `staticArchiveConfig.ts` 从远程快照合并生成，因此 `seed:archive` 实际只会写入 `seasons / characters / lightcones / articles`。若要让 DB 里也有 `stages`，需先往 `bosses` 补条目（见根 `AGENTS.md`「数据架构」）。

## 部署

- `deploy-netlify.sh`：`set -eu`，站点名默认 `NETLIFY_SITE_NAME=hsr-endgame-archive-cn`，登录态在已忽略的 `.netlify-config/`（先 `pnpm netlify:login`）。
- 发布前脚本会自动完整跑 `pnpm build`（`run-p` **并行**执行 typecheck / test:unit / lint / vite build）。Netlify 构建环境固定 Node 24（见 `netlify.toml`）。
- 不要为了发布而把数据源 JSON/图片拷进 `dist` 或 `public`；直连改造的目的就是省带宽。
