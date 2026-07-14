# AGENTS.md

## 回复与协作

- 默认使用中文回复用户；总结优先简洁，必要时补验证结果和注意事项。
- 用户给出具体路径、文件、命令或参考项目时，先沿真实文件和调用链排查，再给结论。
- 修改前先确认现有代码结构和数据来源，避免把参考项目的业务逻辑直接套到本项目。

## 项目定位

本项目是中文《崩坏：星穹铁道》终局竞速档案站，重点是收录、筛选和展示竞速记录，而不是血量膨胀趋势看板。

主要功能：

- 档案工作台：筛选赛季、模式、敌方阶段、记录分类、队伍人数、成本、角色/光锥和标签。
- 记录列表：按队伍组合分组，展示作者、角色命座、轮次、分数、成本和视频链接。
- 环境统计：角色使用率、光锥使用率、常见队伍组合和成本区间。
- 投稿入口：提交记录到审核队列。
- 规则/文章页：展示站内说明与文章摘要。

## 技术栈与命令

- Vue 3 + `<script setup>` + TypeScript
- Vite
- Vue Router 4
- Pinia
- lucide-vue-next
- Netlify Functions
- Vitest + Vue Test Utils + jsdom
- pnpm，Node >= 24

常用命令：

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
```

本地开发端口固定为 `32200`，地址为 `http://localhost:32200/`。

## 代码结构

- `src/App.vue`：主壳和导航。
- `src/router/index.ts`：路由入口。
- `src/views/ArchiveView.vue`：档案工作台页面。
- `src/views/SubmitView.vue`：投稿页。
- `src/views/ArticlesView.vue` / `src/views/FaqView.vue`：内容页。
- `src/components/archive/`：档案业务组件。
- `src/composables/useArchiveFilters.ts`：筛选状态与可用敌方阶段计算。
- `src/composables/useRunsQuery.ts`：记录查询和分组。
- `src/composables/useMetaStats.ts`：统计查询。
- `src/services/archiveService.ts`：前端 API 请求与 seed fallback。
- `src/services/runUtils.ts`：筛选、排序和统计纯函数。
- `src/stores/archiveStore.ts`：档案配置缓存。
- `src/data/seed/`：无数据库时的本地种子数据。
- `netlify/functions/`：服务端 API。
- `netlify/schema.sql`：数据库表结构。

## 数据架构

本项目有两类数据，不能混用：

1. 竞速档案业务数据  
   由 `src/services/archiveService.ts` 请求 `/api/archive/*` 和 `/api/submissions`。Netlify Functions 有数据库 URL 时读取 Postgres；没有数据库 URL 时读取 `src/data/seed`。

2. HSR 终局静态镜像数据  
   位于 `public/local-cache/`。这批文件来自 `/Users/hobby/gitlab-source/hsr-endgame-膨胀变化/public/local-cache`，档案工作台会在业务配置加载后用它们补全当前赛季和敌方阶段标签；静态读取失败时必须保留 seed/API 配置 fallback。它们也可作为静态 JSON 对外暴露。

修改竞速记录、角色、光锥或历史业务筛选 id 时，优先改 `src/data/seed` 或数据库迁移/导入逻辑；不要误改 `public/local-cache` 以为会新增记录。当前赛季和敌方阶段展示标签可从 `public/local-cache` 派生，但 `seasonId`、`bossId` 仍应保持业务数据中的稳定 id。

## API 与数据库

`netlify.toml` 中配置了以下 API：

- `/api/archive/config` -> `netlify/functions/archive-config.ts`
- `/api/archive/runs` -> `netlify/functions/archive-runs.ts`
- `/api/archive/stats` -> `netlify/functions/archive-stats.ts`
- `/api/submissions` -> `netlify/functions/submissions.ts`
- `/api/admin/submissions/:id` -> `netlify/functions/admin-submissions-id.ts`

数据库 URL 读取顺序：

```text
NETLIFY_DATABASE_URL
DATABASE_URL
POSTGRES_URL
```

没有数据库 URL 时，Functions 和前端请求 fallback 都应保持可用。

投稿审核接口可通过 `ADMIN_REVIEW_TOKEN` 做 Bearer token 保护。

## `public/local-cache` 使用说明

`public/local-cache/` 会被 Vite 原样复制到构建产物，部署后可通过 `/local-cache/...` 访问。

当前快照与参考项目一致：

- 来源目录：`/Users/hobby/gitlab-source/hsr-endgame-膨胀变化/public/local-cache`
- 当前版本：`4.3.56`
- 当前文件数：110
- 生成时间可看 `public/local-cache/hsr/4.3.56/cache-plan.json`

目录协议：

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

模式映射：

- `moc`：忘却之庭，索引 `maze.json`，详情 `<locale>/maze/<id>.json`
- `fiction`：虚构叙事，索引 `maze_extra.json`，详情 `<locale>/story/<id>.json`
- `doom`：末日幻影，索引 `maze_boss.json`，详情 `<locale>/boss/<id>.json`
- `peak`：异相仲裁，索引 `maze_peak.json`，详情 `<locale>/peak/<id>.json`

读取最新赛季时，优先读 `cache-plan.json` 的 `currentSeasonIds`。遍历本地已有详情时，优先读 `cachedSeasonIds`。

## `public/local-cache` 更新流程

当前竞速仓库没有内置 `sync:data` 脚本。更新静态镜像时，先在参考项目生成，再同步到本项目。

```bash
cd /Users/hobby/gitlab-source/hsr-endgame-膨胀变化
pnpm sync:data
```

可指定版本与赛季：

```bash
pnpm sync:data -- --ver 4.3.56 --moc 1033,1032 --peak 8
```

可单独重跑忘却之庭多阶段 HP 审计：

```bash
pnpm audit:moc-phase-hp -- --ver 4.3.56
```

同步到本项目：

```bash
rsync -a --delete \
  /Users/hobby/gitlab-source/hsr-endgame-膨胀变化/public/local-cache/ \
  /Users/hobby/Documents/hsr-endgame-竞速/public/local-cache/
```

更新后至少检查：

```bash
diff -qr \
  /Users/hobby/Documents/hsr-endgame-竞速/public/local-cache \
  /Users/hobby/gitlab-source/hsr-endgame-膨胀变化/public/local-cache

pnpm build
```

如果后续希望本项目独立更新 `public/local-cache`，应从参考项目迁移并适配：

- `scripts/sync-local-cache.js`
- `scripts/audit-moc-phase-hp.js`
- `package.json` 中的 `sync:data` 和 `audit:moc-phase-hp`

不要只迁移一个脚本；`sync-local-cache.js` 会调用审计脚本生成 `moc-phase-hp-audit.json`。

## 静态数据维护约束

- `public/local-cache` 的详情 JSON 应保持上游原始结构，不要写入本项目聚合后的 UI 数据。
- 不要随意重命名索引文件、详情目录或 `cache-plan.json` 字段。
- HP 相关逻辑必须考虑 `monstervalue.json` 的 `PhaseList.phase_max_hp_ratio`，不能只用单段 `HPBase`。
- 怪物图片若后续接入，可按 `https://static.nanoka.cc/hsr/<ver>/monstermiddleicon/Monster_<id>.webp` 读取；9 位实例怪物 id 通常需要回退到基础怪物 id。
- 新增或调整 `public/local-cache` 消费逻辑时，需要同时补测试或最小验证说明，并确认静态读取失败时 seed/API fallback 仍可用。

## 前端实现约定

- 新增 Vue 代码优先使用 Composition API 和 `<script setup lang="ts">`。
- 使用现有 `Archive*` 类型，不要在组件里散落重复结构。
- 业务筛选和统计优先放在 `src/services/runUtils.ts` 或 composable，组件只负责组合状态和渲染。
- 新增 API 请求优先走 `src/services/archiveService.ts`，并保留 seed fallback，避免无数据库环境白屏。
- UI 保持当前工作台风格：高信息密度、清晰分组、按钮带图标、移动端不横向溢出。
- 使用 lucide 图标时优先通过 `lucide-vue-next` 引入，不手写 SVG 图标。

## 资源与授权

`scripts/reference-inventory.mjs` 只生成参考观察清单，不下载、不复制参考站资源，也不作为运行时依赖。

不要直接复制 The Genius Archive 或其他站点的未确认授权代码、样式、图片、图标和 JSON 配置。补充角色图、光锥图、boss 图或文章封面前，先确认来源和授权。

## 验证口径

文档或纯说明变更，至少运行：

```bash
pnpm build
```

涉及筛选、排序、统计、投稿表单或 API shape 时，优先运行：

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
```

涉及本地页面效果时，优先用 `http://localhost:32200/` 验证。若启动 dev server，使用 `pnpm dev`。
