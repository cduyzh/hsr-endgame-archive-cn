# AGENTS.md

## 回复与协作

- 默认使用中文回复用户；总结优先简洁，必要时补验证结果和注意事项。
- 用户给出具体路径、文件、命令或参考项目时，先沿真实文件和调用链排查，再给结论。
- 修改前先确认现有代码结构和数据来源，避免把参考项目的业务逻辑直接套到本项目。

## 项目定位

本项目是中文《崩坏：星穹铁道》终局竞速档案站，重点是收录、筛选和展示竞速记录，而不是血量膨胀趋势看板。

主要功能：

- 档案工作台：筛选赛季、模式、敌方阶段、记录分类（随模式与阶段变化）、队伍人数、成本、角色/光锥和标签。
- 记录列表：按队伍组合分组，展示作者、角色命座、轮次、分数、成本和视频链接。
- 环境统计：角色使用率、光锥使用率、常见队伍组合和成本区间。
- 投稿入口：右上角「提交记录」打开站内弹窗，按「基础信息 → 队伍配置 → 成绩与预览」三步提交到审核队列；草稿存在本地直到提交成功，视频只接受 B 站与 YouTube 链接。
- 配队预设：本机 localStorage 记忆作者名 + 最多 3 套队伍配置，提交时可一键载入。
- 投稿凭证：投稿成功后服务端下发 `ownerToken`（`own_<48 hex>`），写回本机 localStorage，**`/me` 页面**可按 token 反查该用户提过的所有 `submission_reviews` + `runs`，查看审核进度（pending/approved/rejected/withdrawn）、撤回已通过的记录、忘记某条凭证或一键清空。
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
pnpm dev              # vite --host 127.0.0.1 --port 32200
pnpm typecheck        # vue-tsc --noEmit
pnpm lint             # eslint .
pnpm test:unit        # vitest run
pnpm build            # run-p typecheck test:unit lint build:only
pnpm build:only       # 只跑 vite build
pnpm preview          # vite preview --host 127.0.0.1 --port 39201
```

部署与数据脚本：

```bash
pnpm netlify:login       # 登录态写入被忽略的 .netlify-config/
pnpm deploy:netlify      # 先完整 pnpm build，再发布 dist/ + netlify/functions/
pnpm sync:units          # 角色/光锥元数据 -> seed
pnpm sync:monsters       # 怪物元数据 -> seed
pnpm sync:stages         # 从远程 static.nanoka.cc 拉所有 BossStage，批量 upsert 到 stages 表
pnpm sync:stages:dry     # 同上但只打印不入库
pnpm seed:archive        # config.json 灌库
pnpm seed:archive:dry    # 灌库空跑
```

注意：`pnpm build` 用 `npm-run-all2` 的 `run-p` **并行**执行 `typecheck / test:unit / lint / build:only`，不是依次执行；任一失败即整体失败。

本地开发端口固定为 `32200`，地址为 `http://localhost:32200/`。

## 代码结构

- `src/App.vue`：主壳和导航（档案 / 文章 / 规则 / **我的投稿** / 审核 + 「提交记录」按钮与全局 `SubmitRunDialog` + `PromoSlot`）。
- `src/router/index.ts`：6 条路由 `/`、`/submit`、`/me`（按本机 token 列出 / 撤回自己的投稿）、`/admin/submissions`、`/articles`、`/faq`；仅首页同步引入。
- `src/views/`：`ArchiveView.vue`（只组合 `ArchiveWorkbench`）、`SubmitView.vue`（`/submit` 深链转发：打开投稿弹窗后回到首页）、`MySubmissionsView.vue`（`/me`，本机凭证反查 + 撤回 + 清理）、`AdminSubmissionsView.vue`、`ArticlesView.vue`、`FaqView.vue`。
- `src/components/archive/`：档案业务组件，含投稿弹窗 `SubmitRunDialog.vue` 与其内部三步向导 `SubmitRunForm.vue`；`src/components/admin/`：审核台弹框与卡片；`src/components/PromoSlot.vue`：站务推广位。
- `src/composables/`：`useArchiveFilters.ts`（筛选状态 + 路由 query 双向同步）、`useRunsQuery.ts`、`useMetaStats.ts`、`useAdminSubmissions.ts`、`useSubmissionDialog.ts`（投稿弹窗全局开关）、`useSubmissionDraft.ts`（投稿草稿 localStorage 缓存）、`useSubmissionMemory.ts`（作者名 / 配队预设 / 投稿 token 三合一 localStorage 记忆）。
- `src/types/archive.ts`：所有 `Archive*` 类型的唯一来源。
- `src/services/`：`archiveService.ts`（API + seed fallback + 管理员会话 + `listMySubmissions`/`withdrawSubmission`）、`staticArchiveConfig.ts`（远程静态快照）、`dataSource.ts`（远程地址与图片）、`runUtils.ts`、`unitCost.ts`、`submissionUtils.ts`、`submissionValidation.ts`（投稿校验与预览纯函数）。
- `src/data/`：`unitAssets.ts`（`sourceId` -> 远程图）、`unitPaths.ts`（命途图标）、`seed/`。
- `src/stores/archiveStore.ts`：档案配置缓存。
- `src/data/seed/`：无数据库时的本地种子数据。当前 `config.json` 中 `bosses` 为空数组、`runs.json` 为空数组，敌方阶段完全由静态快照生成；`hsr-units.json` / `hsr-monsters.json` 只是同步脚本产物，运行时代码不 import（`seed/index.ts` 仅导出 `config.json` 与 `runs.json`）。
- `netlify/functions/`：服务端 API。
- `netlify/schema.sql`：数据库表结构。

## 数据架构

本项目有两类数据，不能混用：

1. 竞速档案业务数据  
   由 `src/services/archiveService.ts` 请求 `/api/archive/*`、`/api/submissions`、`/api/admin/submissions*`。Netlify Functions 有数据库 URL 时读取 Postgres；没有数据库 URL 时读取 `src/data/seed`。前端 `requestJson()` 在请求失败或非 2xx 时静默回退 seed。

2. HSR 终局静态数据（远程直连）  
   所有 JSON 数据和图片资源均直连 `https://static.nanoka.cc`（已开放 CORS），不落盘、不代理、不随构建发布。地址集中在 `src/services/dataSource.ts`；`src/services/staticArchiveConfig.ts` 在运行时生成“静态快照”，由 `archiveService.fetchArchiveConfig()` 合并进业务配置。任何一步静态读取失败都返回 `null`，业务配置原样保留。

合并语义（以代码为准）：`mergeStaticArchiveConfig()` **只补充 `config.bosses` 中不存在的阶段 id**，并为缺失的赛季追加 `{ id, label: "<seasonId> 归档", isCurrent: seasonId === manifest.hsr.live }`；**从不覆盖**业务配置里已有的赛季 label 或敌方阶段字段。因此当前赛季的展示字段完全来自远程快照，而 seed/库里已有的历史阶段保持原值。

阶段 id 规则为 `${seasonId}-${mode}-${stageKey}`（`mode` 取业务模式 `moc/pf/as/aa`；`stageKey` 为 `top`/`bottom`/`starward`，`aa` 为 `k1..kN`/`checkmate`/`plight`），是业务筛选与投稿记录引用的稳定 id，不要改动格式。

记录分类（`category`）口径：库里 `runs.category` 是**开放 text、无枚举约束**，新增取值不需要迁移。可用集合随模式与敌方阶段变化，唯一来源是 `src/services/runUtils.ts` 的 `categoryOptionsFor(mode, bossId)` 与 `categoryLabels`：

- `moc` / `pf` / 非绝境的 `aa` → `zeroCycle`（0 轮竞速）、`fullStars`（满星记录）。
- `aa` 且阶段键为 `plight` → `plightZeroCycle` / `plightFullStars`，绝境记录单独归档。
- `as` → 按剩余行动值分数分四档：`asScore3400`(3400-3650) / `asScore3650`(3650-3850) / `asScore3850`(3850-3899) / `asScore4000`(4000 满分)；边界归高一档，3900-3999 与 3400 以下不单独归档（`categoryOfAsScore()` 返回 `null`）。

服务端 `filterArchiveRuns()` 与前端 `matchesCategory()` 都只做等值比较、不校验枚举；「分类是否属于当前模式与阶段」在投稿侧由 `submissionValidation.ts` 拦下，主页侧由 `useArchiveFilters` 的 `normalizeCategory()` 在不匹配时回落为 `all`。

## API 与数据库

`netlify.toml` 中配置了以下 API：

- `/api/archive/config` -> `netlify/functions/archive-config.ts`
- `/api/archive/runs` -> `netlify/functions/archive-runs.ts`
- `/api/archive/stats` -> `netlify/functions/archive-stats.ts`
- `/api/submissions` -> `netlify/functions/submissions.ts`（POST 投稿；**响应体返回 `ownerToken`（`own_<48 hex>`），前端写本地记忆**）
- `/api/submissions/me` -> `netlify/functions/submissions-me.ts`（POST `{tokens:string[]}`，按本机凭证反查 `submission_reviews` + `runs`，最多 50 token / 200 条）
- `/api/submissions/:id/withdraw` -> `netlify/functions/submissions-withdraw.ts`（PATCH `{token}`，校验 `owner_token` 后把对应 `submission_reviews.status` 与同名 token 的 `runs.status` 一起改 `withdrawn`）
- `/api/admin/submissions` -> `netlify/functions/admin-submissions.ts`
- `/api/admin/submissions/:id` -> `netlify/functions/admin-submissions-id.ts`（`netlify.toml` 中目标写作 `/.netlify/functions/admin-submissions-id/:id`；**通过时把 `owner_token` 一并写入 `runs`**，让用户能通过 token 找到自己已通过的作品）
- `/api/admin/sync-stages` -> `netlify/functions/admin-sync-stages.ts`（POST，管理员手动批量同步 `stages` 表）

数据库 URL 读取顺序：

```text
NETLIFY_DATABASE_URL
DATABASE_URL
POSTGRES_URL
```

没有数据库 URL 时，Functions 和前端请求 fallback 都应保持可用。

投稿审核页位于 `/admin/submissions`。生产环境优先通过 `ADMIN_REVIEW_USERNAME` 和 `ADMIN_REVIEW_PASSWORD` 配置管理员账号；为兼容旧部署，`ADMIN_REVIEW_TOKEN` 仍可作为密码 fallback。审核通过会把投稿同步为公开 `runs` 记录，改为驳回或退回待审会从公开列表隐藏。

> ⚠️ 未配置任何管理员密码环境变量时，服务端 `requireAdmin` 直接返回“通过”，**不拦截**。生产务必设置 `ADMIN_REVIEW_PASSWORD`。
> 管理端接口（`fetchSubmissionReviews` / `reviewSubmission`）失败时**不回退 seed**，而是抛错由审核台提示，这是与业务读取接口的有意区别。

## 静态数据维护约束

- 数据源详情 JSON 应保持上游原始结构，不要写入本项目聚合后的 UI 数据。
- 不要随意重命名索引文件或详情目录。
- 每个大版本的赛季详情 id 硬编码在 `src/services/staticArchiveConfig.ts` 的 `STATIC_SEASON_IDS` 中（形如 `"4.5": { moc: 1035, fiction: 2026, doom: 3020, peak: 9 }`）。**上线新赛季必须在这里补一条**，否则该赛季不会出现在页面上；id 需对照线上 `hsr/<ver>/zh/` 目录下的详情文件名核实。
- HP/速度/韧性口径（`computeStageStats()`）：  
  `HP = monsterValue.HPBase × child.HPModifyRatio × HardLevelGroup.HPRatio × (EliteGroup|InfiniteEliteGroup).HPRatio`，  
  多阶段怪物（`MaxMonsterPhase > 1`）在展示值后追加 ` x<阶段数>`；速度只乘 `HardLevelGroup.SpeedRatio`，韧性再乘精英组 `StanceRatio`。上游 `monstervalue.json` **没有** `PhaseList.phase_max_hp_ratio` 字段，不要按旧文档实现。
- 虚构叙事（`pf`）的每季额外血量缩放未在数据源公开，代码显式 `skipHp`，因此该模式阶段不展示 HP，只展示速度与韧性。
- 怪物图片统一通过 `src/services/dataSource.ts` 的 `monsterImageUrl()` 生成，9 位实例怪物 id（`>= 1e8`）自动回退到基础 id 并对齐整十。
- 新增或调整数据源消费逻辑时，需要同时补测试或最小验证说明，并确认静态读取失败时 seed/API fallback 仍可用。
- 不要把数据源 JSON 重新下载到 `public/` 发布；这会抵消直连改造带来的带宽收益。

## 远程数据源使用说明

统一数据源：`https://static.nanoka.cc`（已开放跨域）。所有数据与图片直连读取，仓库不再保留本地副本，也不随构建发布。

### 路径协议

前端访问的都是数据源绝对地址（无 `/local-cache` 前缀）。

```text
https://static.nanoka.cc/
├── manifest.json                               # 多游戏清单：hsr.{latest,live,available,new}
├── assets/hsr/
│   ├── avatarshopicon/{sourceId}.webp          # 角色头像
│   ├── lightconemediumicon/{sourceId}.webp     # 光锥图片
│   ├── monstermiddleicon/Monster_{id}.webp     # 怪物中图
│   └── pathicon/{id}.webp                      # 命途图标
└── hsr/<ver>/
    ├── monster.json                            # 运行时读取（怪物名/弱点/icon/child）
    ├── monstervalue.json                       # 运行时读取（HPBase / *ModifyRatio / MaxMonsterPhase）
    ├── HardLevelGroup.json                     # 运行时读取（难度组 × 等级 → *Ratio）
    ├── EliteGroup.json                         # 运行时读取（精英组系数）
    ├── InfiniteEliteGroup.json                 # 运行时读取（异相仲裁无限波次精英系数）
    ├── character.json / lightcone.json         # 仅同步脚本 sync:units 读取
    ├── maze.json / maze_extra.json / maze_boss.json / maze_peak.json
    │                                           # 上游索引文件，当前代码不再消费
    └── <locale>/                               # locale 固定为 zh
        ├── maze/<id>.json                      # 混沌回忆（结构为 level 数组）
        ├── story/<id>.json                     # 虚构叙事
        ├── boss/<id>.json                      # 末日幻影
        └── peak/<id>.json                      # 异相仲裁
```

### 模式与目录映射

| 业务模式 `EndgameMode` | 静态模式 `StaticMode` | 单期详情目录      | 阶段 `stageKey`                   |
| ---------------------- | --------------------- | ----------------- | --------------------------------- |
| `moc`（混沌回忆）      | `moc`                 | `<locale>/maze/`  | `top` / `bottom` / `starward`     |
| `pf`（虚构叙事）       | `fiction`             | `<locale>/story/` | `top` / `bottom` / `starward`     |
| `as`（末日幻影）       | `doom`                | `<locale>/boss/`  | `top` / `bottom` / `starward`     |
| `aa`（异相仲裁）       | `peak`                | `<locale>/peak/`  | `k1..kN` / `checkmate` / `plight` |

### 版本与赛季解析流程

1. `fetchStaticArchiveSnapshot()` 读 `manifest.json`。
2. 用 `pickDataDirectory(manifest.hsr.available)` 取**最新的数据目录**（如 `4.5.51`）作为 `<ver>`，所有赛季共用该目录。上游只保留当前大版本目录，历史赛季的详情文件仍在其中累积，因此 `4.4` 的 `1034` 等 id 也从 `4.5.51/` 读取。
3. 并行拉 `monster.json`、`monstervalue.json`、`HardLevelGroup.json`、`EliteGroup.json`、`InfiniteEliteGroup.json`（最后一个允许缺失）。
4. 按 `STATIC_SEASON_IDS[seasonId][staticMode]` 直接拼 `<locale>/<dir>/<id>.json` 拉四份模式详情；单个模式详情 404 时该模式为空，不影响其余模式。
5. `liveVersion` 取 `manifest.hsr.live`（如 `4.5`），用于判定 `isCurrent`。

**不再**从 `maze*.json` 索引里取最大 `seasonId` 推导赛季，也**不使用** `hsr.latest` 或 `cache-plan.json`。这意味着：新赛季数据推上 `static.nanoka.cc` 后，只有补了 `STATIC_SEASON_IDS` 条目页面才会出现对应赛季。

## 数据更新流程

同步脚本仅更新 seed 数据，不下载图片：

```bash
# 同步怪物元数据（名称、弱点、图片 id 等）
pnpm sync:monsters

# 同步角色/光锥元数据（同时重写 config.json 的 units）
pnpm sync:units

# 填充 archive 表
pnpm seed:archive
pnpm seed:archive:dry   # 等价于 seed:archive -- --dry-run

# 从远程快照批量补全 stages 表（新赛季上线 / 远程数值更新 / Netlify admin-sync-stages 端点不可用时使用）
NETLIFY_DATABASE_URL=... pnpm sync:stages
pnpm sync:stages:dry    # 只打印 upsert 计划，不连数据库
pnpm sync:stages -- --season=4.5  # 只同步指定赛季
```

数据版本由环境变量 `HSR_DATA_VERSION` 控制（默认 `4.5`）：`HSR_DATA_VERSION=4.4 pnpm sync:units`。

### 新赛季上线清单（改代码 + 改文档）

1. 确认 `manifest.json` 的 `hsr.live` 已切换，且 `hsr.available` 最新目录下能取到该赛季的详情文件。
2. 在线上 `hsr/<ver>/zh/{maze,story,boss,peak}/` 找到四期详情文件名（数字 id）。
3. 在 `src/services/staticArchiveConfig.ts` 的 `STATIC_SEASON_IDS` 增加一行 `"4.6": { moc, fiction, doom, peak }`。
4. 若 `modeLabelByStaticMode` 中模式改名，必须同步 `src/data/seed/config.json` 的 `modes[].label`（两处共同决定页面文案），并更新本文件与 `README.md`、`src/AGENTS.md`、`src/services/AGENTS.md` 的模式表。
5. 更新 `tests/staticArchiveConfig.test.ts` 里的断言（阶段 id 列表、HP 字符串）。
6. 同步本文件、`README.md`、`src/services/AGENTS.md` 中的赛季/版本示例值。
7. 跑 `pnpm build`，并用 `pnpm dev` 打开 `http://localhost:32200/` 目视确认。

## 前端实现约定

- 新增 Vue 代码优先使用 Composition API 和 `<script setup lang="ts">`。
- 使用现有 `Archive*` 类型，不要在组件里散落重复结构。
- 业务筛选和统计优先放在 `src/services/runUtils.ts` 或 composable，组件只负责组合状态和渲染。
- 新增 API 请求优先走 `src/services/archiveService.ts`，并保留 seed fallback，避免无数据库环境白屏。
- UI 保持当前工作台风格：高信息密度、清晰分组、按钮带图标、移动端不横向溢出。
- 弹层统一沿用既有模式：`Teleport to="body"` + `.modal-backdrop` + `role="dialog" aria-modal="true"`（参考 `src/components/admin/AdminLoginDialog.vue` 与 `src/components/archive/SubmitRunDialog.vue`），打开时给 `body` 加 `is-modal-open` 锁滚动、支持 Esc 与遮罩点击关闭、关闭后把焦点还给触发元素。
- 表单校验、成本统计、预览等规则放 `src/services/`（如 `submissionValidation.ts`）以便单测，组件只保留“是否展示错误”这类 UI 状态。
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

## 文档同步契约（强制）

文档与代码同仓、同提交。**改动下表所列代码时，必须在同一次提交里更新对应文档**；只改代码不改文档视为任务未完成。

| 代码改动点                                                                                                          | 必须同步的文档                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` 的 `scripts` / `engines`                                                                             | 本文件「技术栈与命令」、`README.md`「本地运行 / 验证命令」、`scripts/AGENTS.md`「脚本一览」                                                        |
| `netlify.toml`（redirect、Node 版本、构建命令）                                                                     | 本文件「API 与数据库」、`README.md`「API 路由 / Netlify 部署」、`netlify/AGENTS.md`「文件职责」                                                    |
| `netlify/functions/*`（路由、鉴权、limit、fallback、SQL）                                                           | `netlify/AGENTS.md`；接口 shape 变化时再同步本文件「API 与数据库」与 `README.md`                                                                   |
| `src/services/staticArchiveConfig.ts`（`STATIC_SEASON_IDS`、阶段 id/`stageKey`、HP 口径、合并语义）                 | 本文件「数据架构 / 静态数据维护约束 / 远程数据源使用说明 / 新赛季上线清单」、`README.md`「静态数据源」、`src/services/AGENTS.md`「静态快照与合并」 |
| `src/services/dataSource.ts`（数据源域名、图片目录、`monsterImageUrl`）                                             | 本文件「远程数据源使用说明」路径树、`README.md`「静态数据源」路径树、`src/services/AGENTS.md`「图片寻址」                                          |
| `src/services/archiveService.ts` / `runUtils.ts` / `unitCost.ts` / `submissionUtils.ts` / `submissionValidation.ts` | `src/services/AGENTS.md`「文件职责 / 成本与统计口径 / 投稿校验」；口径影响 `netlify/functions/_shared.ts` 时同步 `netlify/AGENTS.md`               |
| `src/types/archive.ts`（字段增删）                                                                                  | `src/AGENTS.md`「类型与数据流约定」，并在涉及 seed shape 时同步 `src/data/seed` 说明                                                               |
| `src/router/index.ts`、`src/views/*`、`src/components/*` 增删                                                       | 本文件「代码结构」、`src/AGENTS.md`「模块地图 / 路由与视图」、`README.md`「项目结构」                                                              |
| `src/data/seed/*`（赛季、模式 label、units 结构）                                                                   | 本文件「代码结构」seed 现状说明、`README.md`「数据层」、`scripts/AGENTS.md`「关键注意点」                                                          |
| `scripts/*`（新增脚本、环境变量）                                                                                   | `scripts/AGENTS.md`「脚本一览 / 关键注意点」、本文件「技术栈与命令」                                                                               |
| `tests/*`（新增/改名用例）                                                                                          | `tests/AGENTS.md`「现有覆盖」                                                                                                                      |

提交前检查清单：

- [ ] 表格中命中的文档全部已改，示例值（版本号、赛季 id、端口、limit、字段名）与代码一致。
- [ ] 新增代码行为若与文档描述冲突，**以代码为准**修文档；确认是代码 bug 时先记录到下方「已知不一致」再单独修代码。
- [ ] 「已知不一致」中的条目被代码修复后，同步删除该条目并检查相关文档是否已改。
- [ ] 跑 `pnpm build` 通过，且新增/变更逻辑有对应测试或最小验证说明。

## 已知不一致（待决策，勿在文档里当作既有能力宣传）

当前无待决策项。

发现代码行为与文档描述冲突、且当次不打算改代码时，在此登记一条（写清文件、当前行为、期望行为、影响面）；代码修复落地后**删除该条目**并同步修订正文相关章节。

## 分层文档

各关键目录另有模块级 `AGENTS.md`，进入对应目录工作时优先参考（每份开头都回指本文档的「文档同步契约」）：

- [`src/AGENTS.md`](src/AGENTS.md)：前端应用结构、类型/状态流、组件约定。
- [`src/services/AGENTS.md`](src/services/AGENTS.md)：数据访问与纯函数层、两条数据线、回退约定。
- [`netlify/AGENTS.md`](netlify/AGENTS.md)：Functions、`_shared`、鉴权、无库 fallback、schema。
- [`scripts/AGENTS.md`](scripts/AGENTS.md)：同步/灌库/部署脚本与已知注意点。
- [`tests/AGENTS.md`](tests/AGENTS.md)：Vitest 约定、覆盖范围、何时补测试。

面向用户的说明在 [`README.md`](README.md)：技术选型、命令、部署、数据层与 API 表；它与上述文档受同一套同步契约约束。
