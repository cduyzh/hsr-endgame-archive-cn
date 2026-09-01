# 竞速档案站

中文《崩坏：星穹铁道》终局竞速档案 SPA。项目以 Vue 3、Vite、TypeScript、Pinia 和 Netlify Functions 为基础，用于收录、筛选和展示不同终局模式下的竞速记录、队伍配置、成本、轮次、分数与环境统计。

项目参考 The Genius Archive 的信息架构，但不复制其代码、样式或未确认授权的资源。

## 功能范围

- **档案工作台**：按赛季、终局模式、敌方阶段、记录分类、队伍人数、成本、角色/光锥和标签筛选竞速记录。
- **记录展示**：按队伍组合分组展示作者、角色命座、轮次、分数、成本和视频链接。
- **环境统计**：统计角色使用率、光锥使用率、常见组合与成本分布。
- **投稿审核**：右上角「提交记录」打开站内弹窗，按「基础信息 → 队伍配置 → 成绩与预览」三步填写，字段级校验与限定/常驻统计实时反馈，提交到 `/api/submissions` 进入待审核队列；`/submit` 深链仍会打开同一弹窗。
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

`pnpm build` 通过 `npm-run-all2` 的 `run-p` **并行**执行 `typecheck`、`test:unit`、`lint` 和 `vite build`（任一失败即整体失败）。只想产出 `dist/` 用 `pnpm build:only`，本地预览构建产物用 `pnpm preview`（`http://localhost:39201/`）。

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
   前端通过 `src/services/archiveService.ts` 请求 `/api/archive/config`、`/api/archive/runs`、`/api/archive/stats`、`/api/submissions` 以及 `/api/admin/submissions*`。Netlify Functions 若配置了 `NETLIFY_DATABASE_URL`、`DATABASE_URL` 或 `POSTGRES_URL`，会读取 Postgres；否则使用 `src/data/seed/` 中的种子数据。读取类请求失败时前端静默回退 seed，保证无数据库环境不白屏；投稿与管理端请求失败则直接报错（审核台会提示）。

2. **HSR 终局静态数据（远程直连）**  
   所有游戏 JSON 与图片均直连 `https://static.nanoka.cc`（已开放 CORS），仓库不落盘、不随构建发布。地址与图片路径集中在 `src/services/dataSource.ts`；`src/services/staticArchiveConfig.ts` 在运行时读取 `manifest.json`，按代码里硬编码的 `STATIC_SEASON_IDS` 拉取 `monster.json`、`monstervalue.json`、`HardLevelGroup.json`、`EliteGroup.json`、`InfiniteEliteGroup.json` 与各模式单期详情，生成敌方阶段（血量/速度/韧性/弱点/记忆祝福/敌方图），再合并进 `/api/archive/config`（或 seed）的结果。静态读取失败时保留业务配置，不会白屏。

数据库表结构见 `netlify/schema.sql`。访问 `/admin/submissions` 会先显示管理员登录弹框，生产环境建议配置：

```bash
ADMIN_REVIEW_USERNAME=admin
ADMIN_REVIEW_PASSWORD=请替换为强密码
```

为兼容旧部署，未配置 `ADMIN_REVIEW_PASSWORD` 时仍会把 `ADMIN_REVIEW_TOKEN` 当作管理员密码；未配置 `ADMIN_REVIEW_USERNAME` 时账号默认为 `admin`。审核台支持待审核、已通过、已驳回和全部记录筛选。投稿通过后会写入公开档案，之后改为驳回或退回待审会从公开档案隐藏。

> ⚠️ 未配置任何管理员密码环境变量时，服务端 `requireAdmin` 不会拦截。生产务必设置 `ADMIN_REVIEW_PASSWORD`。

## API 路由

`netlify.toml` 将业务 API 转发到 Netlify Functions：

| 前端路径                     | Function               | 说明                                       |
| ---------------------------- | ---------------------- | ------------------------------------------ |
| `/api/archive/config`        | `archive-config`       | 赛季、模式、敌方阶段、角色、光锥、文章配置 |
| `/api/archive/runs`          | `archive-runs`         | 已审核竞速记录，支持筛选                   |
| `/api/archive/stats`         | `archive-stats`        | 使用率、组合、成本区间统计                 |
| `/api/submissions`           | `submissions`          | 投稿入口                                   |
| `/api/admin/submissions`     | `admin-submissions`    | 管理员读取投稿审核列表                     |
| `/api/admin/submissions/:id` | `admin-submissions-id` | 审核入口                                   |

## 静态数据源（远程直连）

统一数据源 `https://static.nanoka.cc`（已开放跨域）。所有数据与图片直连读取，仓库不保留本地副本，也不随构建发布。前端访问的都是数据源绝对地址（无 `/local-cache` 前缀）。

```text
https://static.nanoka.cc/
├── manifest.json                               # hsr.{latest,live,available,new}
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
    ├── character.json / lightcone.json         # 仅同步脚本读取
    └── <locale>/{maze,story,boss,peak}/<id>.json   # 各模式单期详情（locale 固定 zh）
```

业务终局模式 `EndgameMode` 为 `moc / pf / as / aa`（混沌回忆 / 虚构叙事 / 末日幻影 / 异相仲裁），与静态数据源的模式映射如下：

| 业务模式 | 静态模式  | 单期详情目录               | 阶段 `stageKey`                   |
| -------- | --------- | -------------------------- | --------------------------------- |
| `moc`    | `moc`     | `<locale>/maze/<id>.json`  | `top` / `bottom` / `starward`     |
| `pf`     | `fiction` | `<locale>/story/<id>.json` | `top` / `bottom` / `starward`     |
| `as`     | `doom`    | `<locale>/boss/<id>.json`  | `top` / `bottom` / `starward`     |
| `aa`     | `peak`    | `<locale>/peak/<id>.json`  | `k1..kN` / `checkmate` / `plight` |

赛季与版本的解析方式：`src/services/staticArchiveConfig.ts` 里的 `STATIC_SEASON_IDS` 为每个大版本（当前 `4.4`、`4.5`）硬编码四个模式的详情 id；运行时用 `manifest.hsr.available` 选出该大版本的最新数据目录（如 `4.5.51`），用 `manifest.hsr.live` 判定当前赛季。**不读取**上游 `maze.json / maze_extra.json / maze_boss.json / maze_peak.json` 索引，也不依赖 `cache-plan.json`。因此新赛季上线需要先在 `STATIC_SEASON_IDS` 补一条（步骤见 [AGENTS.md](./AGENTS.md) 的「新赛季上线清单」）。

合并语义：远程快照**只补充业务配置里没有的敌方阶段 id**，并为缺失赛季追加 `<seasonId> 归档` 条目，不会覆盖 seed 或数据库中已有的赛季 label 与阶段字段。记录筛选用的 `seasonId`、`bossId` 始终是稳定 id。

怪物图片统一经 `dataSource.ts` 的 `monsterImageUrl()` 生成，9 位实例怪物 id（`>= 1e8`）自动回退到基础 id 并对齐整十。血量口径为 `HPBase × HPModifyRatio × HardLevelGroup.HPRatio × (EliteGroup|InfiniteEliteGroup).HPRatio`，多阶段怪物追加 ` x<阶段数>`；虚构叙事（`pf`）因上游未公开每季缩放系数而跳过血量展示。

## 数据更新流程

同步脚本仅更新 `src/data/seed/` 下的种子数据，直连远程抓取，不下载图片：

```bash
# 同步怪物元数据（名称、弱点、图片 id 等）
pnpm sync:monsters

# 同步角色/光锥元数据
pnpm sync:units
```

数据版本由环境变量 `HSR_DATA_VERSION` 控制（默认 `4.5`）。把 `config.json` 灌入/同步到数据库：

```bash
pnpm seed:archive            # 实际写入
pnpm seed:archive:dry        # 空跑（等价于 seed:archive -- --dry-run）
```

更新后检查：

```bash
pnpm build
```

## 项目结构

```text
src/
├── App.vue
├── main.ts
├── router/
├── assets/
├── components/
│   ├── PromoSlot.vue
│   ├── admin/
│   │   ├── AdminLoginDialog.vue
│   │   └── AdminSubmissionCard.vue
│   └── archive/
│       ├── ArchiveDispatchPanel.vue
│       ├── ArchiveWorkbench.vue
│       ├── BossPanel.vue
│       ├── MetaReportPanel.vue
│       ├── ModeSeasonFilter.vue
│       ├── RunGroupList.vue
│       ├── SubmissionTeamSlot.vue
│       ├── SubmitRunDialog.vue
│       ├── SubmitRunForm.vue
│       ├── UnitPickerDrawer.vue
│       └── UnitSearchSelect.vue
├── composables/
│   ├── useAdminSubmissions.ts
│   ├── useArchiveFilters.ts
│   ├── useMetaStats.ts
│   ├── useRunsQuery.ts
│   └── useSubmissionDialog.ts
├── data/
│   ├── seed/                          # config.json / runs.json / index.ts（+ 同步产物 hsr-*.json）
│   ├── unitAssets.ts
│   └── unitPaths.ts
├── services/
│   ├── archiveService.ts
│   ├── dataSource.ts
│   ├── runUtils.ts
│   ├── staticArchiveConfig.ts
│   ├── submissionUtils.ts
│   ├── submissionValidation.ts
│   └── unitCost.ts
├── stores/
├── types/
└── views/
    ├── AdminSubmissionsView.vue
    ├── ArchiveView.vue
    ├── ArticlesView.vue
    ├── FaqView.vue
    └── SubmitView.vue
```

## 资源策略

`scripts/reference-inventory.mjs` 只生成参考观察清单，不下载 The Genius Archive 资源。角色、光锥、怪物与命途图片均直连 `static.nanoka.cc`（如 `https://static.nanoka.cc/hsr/4.5/character.json`、`lightcone.json` 提供 `sourceId` 映射，见 `src/data/unitAssets.ts`），不再把图片落盘到 `public/`。补充角色图、光锥图、boss 图或文章封面前，必须确认来源和授权，不能直接复制未确认授权的参考站文件。

更多协作约定见 [AGENTS.md](./AGENTS.md)。其中「文档同步契约」给出了**代码改动点 → 必改文档**的映射表和提交前检查清单：改完代码必须在同一次提交里同步本文档与对应模块的 `AGENTS.md`。
