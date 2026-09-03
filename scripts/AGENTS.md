# AGENTS.md — `scripts/`（数据同步、灌库与部署脚本）

均为 Node `>=24` 下运行的 `.mjs` / `.sh` 脚本，通过根目录 `pnpm` 别名调用。它们只读写仓库内文件或调用远端，不改前端运行时代码。

> 改动本目录（含根 `package.json` 的脚本别名）后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」同步更新本文件（脚本一览表、命令名）与根 `AGENTS.md` 的「技术栈与命令」「数据更新流程」、`README.md` 的命令与项目结构，**同一提交内完成**。

## 脚本一览

| 脚本                            | 命令                  | 作用                                                                           | 数据来源 → 写入                                                                                                                        |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `sync-hsr-units.mjs`            | `pnpm sync:units`     | 同步角色/光锥元数据 + 专武映射                                                 | 远程 `static.nanoka.cc/hsr/<ver>/character.json`、`lightcone.json`、`zh/character/<sourceId>.json` → `src/data/seed/hsr-units.json` + `lightcone-pairs.json`（并更新 `config.json` 的 `units`） |
| `sync-hsr-monsters.mjs`         | `pnpm sync:monsters`  | 同步怪物元数据（名称/弱点/图片 id）                                            | 远程 `static.nanoka.cc/hsr/<ver>/monster.json` → `src/data/seed/hsr-monsters.json`                                                     |
| `seed-archive-tables.mjs`       | `pnpm seed:archive`   | 把 `src/data/seed/config.json` upsert 进 Neon                                  | `config.json` → Postgres（`seasons/stages/characters/lightcones/articles`）                                                            |
| `sync-stages-from-snapshot.mjs` | `pnpm sync:stages`    | 从远程 `static.nanoka.cc` 拉所有赛季的 `BossStage`，批量 upsert 进 `stages` 表 | 远程 `manifest.json` + 各模式详情 → Postgres（`stages`）                                                                               |
| `deploy-netlify.sh`             | `pnpm deploy:netlify` | 先 `pnpm build` 再发布 `dist/` + `netlify/functions/` 到 Netlify               | —                                                                                                                                      |
| `reference-inventory.mjs`       | （手动）              | 仅生成参考站观察清单，不下载/不复制/不作为运行时依赖                           | —                                                                                                                                      |

## 关键注意点

- **数据版本**由环境变量 `HSR_DATA_VERSION` 控制，默认 `4.5`。同步不同版本时显式传入。
- `sync:monsters` 与 `sync:units` 均直连 `static.nanoka.cc` 抓取，可独立运行；抓取失败会抛出带数据地址的错误。两者都只写 `src/data/seed/*.json`，不落盘图片。
- **`sync:units` 会为每个五星限定角色额外抓一次 `zh/character/<sourceId>.json`** 来生成专武映射（约 57 次请求，串行执行）；单个角色抓取失败或命途对不上时只跳过该条目并在末尾 `console.warn`，不影响 units 落库。`lightcone-pairs.json` 是唯一被前端运行时 import 的脚本产物（见 `src/data/signatureLightcones.ts`）。
- **同步脚本只更新 seed 数据，不下载图片**；图片由前端经 `dataSource.ts` 直连，勿把图片落盘。
- `seed:archive` 连接顺序与 `netlify/functions/_shared.ts` 一致：`NETLIFY_DATABASE_URL ?? DATABASE_URL ?? POSTGRES_URL`。支持 `-- --dry-run`、`-- --table=seasons,stages`、`-- --id=<id>`。
- **`stages` 表来自 `config.json` 的 `bosses`**（不是独立的 `stages` 字段）。当前 seed 的 `bosses` 为空数组，敌方阶段由前端 `staticArchiveConfig.ts` 从远程快照合并生成，因此 `seed:archive` 实际只会写入 `seasons / characters / lightcones / articles`。若要让 DB 里也有 `stages`，需先往 `bosses` 补条目（见根 `AGENTS.md`「数据架构」）。
- **`sync:stages`**：从 `static.nanoka.cc` 直接拉 `manifest.json` + 所有赛季的 `BossStage`（与 Netlify Function `admin-sync-stages` 共用 `staticBossSnapshot.ts`），批量 upsert 到 `stages` 表。需 Node 24 的 `--experimental-strip-types` 支持以解析 `.ts` import。**用法**：`NETLIFY_DATABASE_URL=... pnpm sync:stages`，加 `-- --dry-run` 只打印不入库，加 `-- --season=4.5` 只同步指定赛季。**适用场景**：新赛季上线、远程快照数值更新、或 Netlify `admin-sync-stages` 端点不可用时的本地补全（端点走的是同一份纯计算模块，本质等价）。

## 部署

- `deploy-netlify.sh`：`set -eu`，站点名默认 `NETLIFY_SITE_NAME=hsr-endgame-archive-cn`，登录态在已忽略的 `.netlify-config/`（先 `pnpm netlify:login`）。
- 发布前脚本会自动完整跑 `pnpm build`（`run-p` **并行**执行 typecheck / test:unit / lint / vite build）。Netlify 构建环境固定 Node 24（见 `netlify.toml`）。
- 不要为了发布而把数据源 JSON/图片拷进 `dist` 或 `public`；直连改造的目的就是省带宽。
