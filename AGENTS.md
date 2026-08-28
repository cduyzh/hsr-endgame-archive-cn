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

2. HSR 终局静态数据（远程直连）  
   所有 JSON 数据和图片资源均直连 `https://static.nanoka.cc`（已开放 CORS），不随构建发布。配置集中在 `src/services/dataSource.ts`。前端在运行时通过 `dataSourceUrl()` 读取远程数据，静态读取失败时 seed/API 配置仍作为 fallback。

修改竞速记录、角色、光锥或历史业务筛选 id 时，优先改 `src/data/seed` 或数据库迁移/导入逻辑。当前赛季和敌方阶段展示标签从远程数据源实时推导，`seasonId`、`bossId` 仍应保持业务数据中的稳定 id。

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

投稿审核页位于 `/admin/submissions`。生产环境优先通过 `ADMIN_REVIEW_USERNAME` 和 `ADMIN_REVIEW_PASSWORD` 配置管理员账号；为兼容旧部署，`ADMIN_REVIEW_TOKEN` 仍可作为密码 fallback。审核通过会把投稿同步为公开 `runs` 记录，改为驳回或退回待审会从公开列表隐藏。

## 静态数据维护约束

- 数据源详情 JSON 应保持上游原始结构，不要写入本项目聚合后的 UI 数据。
- 不要随意重命名索引文件或详情目录。
- HP 相关逻辑必须考虑 `monstervalue.json` 的 `PhaseList.phase_max_hp_ratio`，不能只用单段 `HPBase`。
- 怪物图片统一通过 `src/services/dataSource.ts` 的 `monsterImageUrl()` 生成，9 位实例怪物 id 自动回退到基础 id。
- 新增或调整数据源消费逻辑时，需要同时补测试或最小验证说明，并确认静态读取失败时 seed/API fallback 仍可用。
- 不要把数据源 JSON 重新下载到 `public/` 发布；这会抵消直连改造带来的带宽收益。

## 远程数据源使用说明

统一数据源：`https://static.nanoka.cc`（已开放跨域）。所有数据与图片直连读取，仓库不再保留本地副本，也不随构建发布。

### 路径协议

前端访问的都是数据源绝对地址（无 `/local-cache` 前缀）。

```text
https://static.nanoka.cc/
├── manifest.json
├── assets/hsr/
│   ├── avatarshopicon/{sourceId}.webp          # 角色头像
│   ├── lightconemediumicon/{sourceId}.webp     # 光锥图片
│   ├── monstermiddleicon/Monster_{id}.webp     # 怪物中图
│   └── pathicon/{id}.webp                      # 命途图标
└── hsr/<ver>/
    ├── monster.json
    ├── monstervalue.json
    ├── HardLevelGroup.json
    ├── EliteGroup.json
    ├── InfiniteEliteGroup.json
    ├── maze.json / maze_extra.json / maze_boss.json / maze_peak.json
    └── <locale>/
        ├── maze/<id>.json
        ├── story/<id>.json
        ├── boss/<id>.json
        └── peak/<id>.json
```

模式映射：

- `moc`：索引 `maze.json`，详情 `<locale>/maze/<id>.json`
- `fiction`：索引 `maze_extra.json`，详情 `<locale>/story/<id>.json`
- `doom`：索引 `maze_boss.json`，详情 `<locale>/boss/<id>.json`
- `peak`：索引 `maze_peak.json`，详情 `<locale>/peak/<id>.json`

当前赛季由各模式索引文件中的最大 seasonId 实时推导（不依赖 `cache-plan.json`）。

## 数据更新流程

同步脚本仅更新 seed 数据，不下载图片：

```bash
# 同步怪物元数据（名称、弱点、图片 id 等）
pnpm sync:monsters

# 同步角色/光锥元数据
pnpm sync:units

# 填充 archive 表
pnpm seed:archive
```

更新后检查：

```bash
pnpm build
```

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

## 分层文档

各关键目录另有模块级 `AGENTS.md`，进入对应目录工作时优先参考：

- [`src/AGENTS.md`](src/AGENTS.md)：前端应用结构、类型/状态流、组件约定。
- [`src/services/AGENTS.md`](src/services/AGENTS.md)：数据访问与纯函数层、两条数据线、回退约定。
- [`netlify/AGENTS.md`](netlify/AGENTS.md)：Functions、`_shared`、鉴权、无库 fallback、schema。
- [`scripts/AGENTS.md`](scripts/AGENTS.md)：同步/灌库/部署脚本与已知注意点。
- [`tests/AGENTS.md`](tests/AGENTS.md)：Vitest 约定、覆盖范围、何时补测试。
