# 竞速档案站

中文《崩坏：星穹铁道》终局竞速档案 SPA。项目以 Vue 3、Vite、TypeScript、Pinia 和 Netlify Functions 为基础，用于收录、筛选和展示不同终局模式下的竞速记录、队伍配置、成本、轮次、分数与环境统计。

项目参考 The Genius Archive 的信息架构，但不复制其代码、样式或未确认授权的资源。

## 功能范围

- **档案工作台**：按赛季、终局模式、敌方阶段、记录分类、队伍人数、成本、角色/光锥和标签筛选竞速记录。
- **记录展示**：按队伍组合分组展示作者、角色命座、轮次、分数、成本和视频链接。
- **环境统计**：统计角色使用率、光锥使用率、常见组合与成本分布。
- **投稿审核**：前端提交记录到 `/api/submissions`，进入待审核队列。
- **文章与规则页**：展示站内说明、规则和文章摘要。

## 技术栈

| 类别      | 选型                                  |
| --------- | ------------------------------------- |
| 前端      | Vue 3 + `<script setup>` + TypeScript |
| 路由/状态 | Vue Router 4 + Pinia                  |
| 构建      | Vite                                  |
| 图标      | lucide-vue-next                       |
| 单测      | Vitest + Vue Test Utils + jsdom       |
| 服务端    | Netlify Functions                     |
| 数据库    | Neon/Postgres，可回退到本地 seed      |
| 包管理    | pnpm，Node >= 24                      |

## 本地运行

```bash
pnpm install
pnpm dev
```

默认开发地址为 `http://localhost:32200/`。`vite.config.ts` 中也固定了 `server.port = 32200`。

## 验证命令

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
```

`pnpm build` 会依次执行 `typecheck`、`test:unit`、`lint` 和 `vite build`。

## Netlify 部署

首次在本机发布时，先登录 Netlify：

```bash
pnpm netlify:login
```

登录态会保存在已忽略的 `.netlify-config/` 目录。随后执行生产发布：

```bash
pnpm deploy:netlify
```

`scripts/deploy-netlify.sh` 会先运行完整的 `pnpm build`，再将 `dist/` 和 `netlify/functions/` 发布到默认站点 `hsr-endgame-archive-cn`。可以传入发布说明：

```bash
pnpm deploy:netlify -- "update archive data"
```

如果 Netlify 中的实际站点名不同，可在命令前覆盖：

```bash
NETLIFY_SITE_NAME=your-site-name pnpm deploy:netlify
```

Netlify 构建环境固定使用 Node 24；业务 API redirects、Functions 目录和 SPA fallback 继续由 `netlify.toml` 管理。

## 数据层

项目目前有两条数据线，需要分开理解：

1. **竞速档案业务数据**  
   前端通过 `src/services/archiveService.ts` 请求 `/api/archive/config`、`/api/archive/runs`、`/api/archive/stats` 和 `/api/submissions`。Netlify Functions 若配置了 `NETLIFY_DATABASE_URL`、`DATABASE_URL` 或 `POSTGRES_URL`，会读取 Postgres；否则使用 `src/data/seed/` 中的种子数据。

2. **HSR 终局静态镜像数据**  
   `public/local-cache/` 是从 `/Users/hobby/gitlab-source/hsr-endgame-膨胀变化` 同步来的 HSR 终局静态 JSON 快照。档案工作台会在读取 `/api/archive/config` 或 seed fallback 后，用 `manifest.json`、`cache-plan.json` 和当前期详情补全当前赛季与敌方阶段标签；静态镜像读取失败时仍保留原业务配置。其他页面也可以通过 `/local-cache/*` 读取这批数据。

数据库表结构见 `netlify/schema.sql`。投稿审核接口可使用 `ADMIN_REVIEW_TOKEN` 保护管理端审核操作。

## API 路由

`netlify.toml` 将业务 API 转发到 Netlify Functions：

| 前端路径                     | Function               | 说明                                       |
| ---------------------------- | ---------------------- | ------------------------------------------ |
| `/api/archive/config`        | `archive-config`       | 赛季、模式、敌方阶段、角色、光锥、文章配置 |
| `/api/archive/runs`          | `archive-runs`         | 已审核竞速记录，支持筛选                   |
| `/api/archive/stats`         | `archive-stats`        | 使用率、组合、成本区间统计                 |
| `/api/submissions`           | `submissions`          | 投稿入口                                   |
| `/api/admin/submissions/:id` | `admin-submissions-id` | 审核入口                                   |

## `public/local-cache` 如何使用

`public/` 下的文件会被 Vite 原样复制到构建产物根目录。源码中的 `public/local-cache/...` 部署后可通过 `/local-cache/...` 访问。

当前快照版本为 `4.3.56`，共 110 个 JSON 文件，与参考项目 `/Users/hobby/gitlab-source/hsr-endgame-膨胀变化/public/local-cache` 一致。

```text
public/local-cache/
├── manifest.json
└── hsr/<ver>/
    ├── monster.json
    ├── monstervalue.json
    ├── HardLevelGroup.json
    ├── EliteGroup.json
    ├── InfiniteEliteGroup.json
    ├── maze.json
    ├── maze_extra.json
    ├── maze_boss.json
    ├── maze_peak.json
    ├── cache-plan.json
    ├── moc-phase-hp-audit.json
    └── <locale>/
        ├── maze/<id>.json
        ├── story/<id>.json
        ├── boss/<id>.json
        └── peak/<id>.json
```

核心入口：

- `manifest.json`：上游版本索引；HSR 默认版本读取 `manifest.hsr.latest`。
- `cache-plan.json`：本次落盘计划，记录 `version`、`locale`、`currentSeasonIds`、`cachedSeasonIds` 和 `listFiles`。
- `maze.json`：忘却之庭期数索引。
- `maze_extra.json`：虚构叙事期数索引。
- `maze_boss.json`：末日幻影期数索引。
- `maze_peak.json`：异相仲裁期数索引。
- `monster.json`、`monstervalue.json`、`HardLevelGroup.json`、`EliteGroup.json`、`InfiniteEliteGroup.json`：复算怪物 HP 所需的基础表。
- `moc-phase-hp-audit.json`：忘却之庭多阶段 HP 命中审计。

模式与文件映射：

| 模式      | 期数索引          | 单期详情目录               | 中文名   |
| --------- | ----------------- | -------------------------- | -------- |
| `moc`     | `maze.json`       | `<locale>/maze/<id>.json`  | 忘却之庭 |
| `fiction` | `maze_extra.json` | `<locale>/story/<id>.json` | 虚构叙事 |
| `doom`    | `maze_boss.json`  | `<locale>/boss/<id>.json`  | 末日幻影 |
| `peak`    | `maze_peak.json`  | `<locale>/peak/<id>.json`  | 异相仲裁 |

示例读取：

```ts
const root = "/local-cache";
const manifest = await fetch(`${root}/manifest.json`).then((res) => res.json());
const version = manifest.hsr.latest;
const locale = "zh";

const plan = await fetch(`${root}/hsr/${version}/cache-plan.json`).then((res) =>
  res.json(),
);
const mocList = await fetch(`${root}/hsr/${version}/maze.json`).then((res) =>
  res.json(),
);
const latestMocId = plan.currentSeasonIds.moc;
const latestMocDetail = await fetch(
  `${root}/hsr/${version}/${locale}/maze/${latestMocId}.json`,
).then((res) => res.json());
```

档案工作台接入点：

- `src/services/archiveService.ts` 仍先读取 `/api/archive/config`，失败时回退 `src/data/seed/config.json`。
- `src/services/staticArchiveConfig.ts` 再读取 `/local-cache/manifest.json`、`/local-cache/hsr/<ver>/cache-plan.json`、`monster.json` 和 `currentSeasonIds` 指向的详情文件。
- 静态数据只覆盖当前赛季 label、当前敌方阶段 name/subtitle/weakness/memoryBuff；记录筛选使用的 `seasonId`、`bossId` 仍保持业务配置中的稳定 id，避免已有 seed 或数据库记录失配。

最小验证：

```bash
pnpm test:unit -- tests/staticArchiveConfig.test.ts
pnpm typecheck
```

页面验证可启动 `pnpm dev` 后打开 `http://localhost:32200/`，确认赛季下拉显示当前版本，敌方阶段按钮来自 `cache-plan.json` 当前期详情；临时移走或阻断 `public/local-cache` 时，工作台应继续显示 seed 配置而不是白屏。

## `public/local-cache` 如何更新

当前竞速项目没有内置 `sync:data` 脚本。更新这批文件时，优先以参考项目为数据生成源：

```bash
cd /Users/hobby/gitlab-source/hsr-endgame-膨胀变化
pnpm sync:data

# 可指定版本、语言和赛季 id
pnpm sync:data -- --ver 4.3.56 --moc 1033,1032 --peak 8

# 可单独重跑忘却之庭多阶段 HP 审计
pnpm audit:moc-phase-hp -- --ver 4.3.56
```

生成后，将参考项目的 `public/local-cache/` 同步到本项目同名目录，并确认目录结构和 `cache-plan.json` 一起更新。

```bash
rsync -a --delete \
  /Users/hobby/gitlab-source/hsr-endgame-膨胀变化/public/local-cache/ \
  /Users/hobby/Documents/hsr-endgame-竞速/public/local-cache/
```

更新约束：

- 不要手写或局部拼接上游详情 JSON；详情文件应保持 `static.nanoka.cc` 原始结构。
- 不要随意重命名索引文件和详情目录，路径可被下游按 `/local-cache/hsr/<ver>/...` 直接读取。
- 如果后续让竞速项目独立生成数据，应把参考项目的 `scripts/sync-local-cache.js` 与 `scripts/audit-moc-phase-hp.js` 成对迁移，并在 `package.json` 中补 `sync:data` / `audit:moc-phase-hp`。
- 多阶段敌人的真实 HP 需要考虑 `monstervalue.json` 中 `PhaseList.phase_max_hp_ratio` 的总和，不能只看单段 `HPBase`。

## 项目结构

```text
src/
├── App.vue
├── main.ts
├── router/
├── assets/
├── components/archive/
│   ├── ArchiveWorkbench.vue
│   ├── BossPanel.vue
│   ├── MetaReportPanel.vue
│   ├── ModeSeasonFilter.vue
│   ├── RunGroupList.vue
│   ├── SubmitRunForm.vue
│   └── UnitPickerDrawer.vue
├── composables/
│   ├── useArchiveFilters.ts
│   ├── useMetaStats.ts
│   └── useRunsQuery.ts
├── data/seed/
├── services/
├── stores/
├── types/
└── views/
```

## 资源策略

`scripts/reference-inventory.mjs` 只生成参考观察清单，不下载 The Genius Archive 资源。当前角色与光锥图片取自 nanoka HSR 数据站，来源接口为 `https://static.nanoka.cc/hsr/4.3.56/character.json` 与 `https://static.nanoka.cc/hsr/4.3.56/lightcone.json`，图片落在 `public/assets/hsr/units/`，映射见 `src/data/unitAssets.ts`。后续补图标、角色图、光锥图或 boss 图时，必须确认资源授权，不能直接复制未确认授权的参考站文件。

更多协作约定见 [AGENTS.md](./AGENTS.md)。
