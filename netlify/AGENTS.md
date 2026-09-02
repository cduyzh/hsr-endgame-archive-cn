# AGENTS.md — `netlify/`（Functions 与数据库）

服务端为 Netlify Functions（TypeScript），数据库为 Neon/Postgres（`@neondatabase/serverless`）。`netlify.toml` 负责把 `/api/*` 重写到 `/.netlify/functions/*`。核心原则：**有数据库走 SQL，没有数据库走文件/seed fallback，任何情况下都不能 500 或白屏。**

> 改动本目录（含 `netlify.toml`、`schema.sql`）后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」同步更新本文件（文件职责表、路由、环境变量）与根 `AGENTS.md` 的「API 与数据库」、`README.md` 的 API 清单，**同一提交内完成**。

## 文件职责

| 文件                      | 路由                            | 说明                                                                                                                                              |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_shared.ts`              | —（非 function）                | 公共工具：seed、DB 连接、鉴权、筛选/统计、无库文件 fallback。**被所有 function 复用**                                                             |
| `_staticSnapshot.ts`      | —（非 function）                | 服务端远程静态快照包装：调 `getStaticBossMap()` 在 cold start 内 fetch 一次 `static.nanoka.cc` 并缓存，供审核通过时按 `bossId` 查完整 `BossStage` |
| `archive-config.ts`       | `/api/archive/config`           | 返回配置（赛季/阶段/单位/文章），空表回退 seed                                                                                                    |
| `archive-runs.ts`         | `/api/archive/runs`             | 已审核记录（`status='approved'`），带筛选，`limit 200`                                                                                            |
| `archive-stats.ts`        | `/api/archive/stats`            | 统计，`limit 500` 聚合后 `buildStats`                                                                                                             |
| `submissions.ts`          | `/api/submissions`              | POST 投稿，非法 JSON 返回 `400`，缺字段返回 `400 {missing}`，入队 `pending` 返回 `202`，**同时下发 `ownerToken`（`own_<48 hex>`）到响应体**       |
| `submissions-me.ts`       | `/api/submissions/me`           | POST `{tokens:string[]}`，按本机凭证反查当前用户提过哪些 `submission_reviews` / `runs`，最多 50 个 token、上限 200 条记录                         |
| `submissions-withdraw.ts` | `/api/submissions/:id/withdraw` | PATCH `{token}`，校验 `owner_token` 匹配后把 `submission_reviews.status='withdrawn'`，并把同一 `owner_token` 的 `runs.status` 同步改 `withdrawn`  |
| `admin-submissions.ts`    | `/api/admin/submissions`        | GET 审核列表（需鉴权），支持 `status` 过滤                                                                                                        |
| `admin-submissions-id.ts` | `/api/admin/submissions/:id`    | PATCH 审核（通过/驳回/退回），需鉴权；通过时从远程静态快照补 `stages` 行；**写入 `runs.owner_token` 供用户后续检索**                              |
| `admin-sync-stages.ts`    | `/api/admin/sync-stages`        | POST 批量从远程静态快照 upsert 所有 `stages` 行（需鉴权），新赛季/远程数据更新时手动触发                                                          |
| `schema.sql`              | —                               | 建表语句，手动在 Neon 执行                                                                                                                        |

## `_shared.ts` 关键约定

- **DB URL 读取顺序**：`NETLIFY_DATABASE_URL ?? DATABASE_URL ?? POSTGRES_URL`；`getSql()` 无 URL 时返回 `null`，各 handler 自行走 fallback。
- **`jsonResponse(body, status)`**：统一返回 `application/json` + `cache-control: no-store`。
- **`requireAdmin(event)`**：支持两种认证：`Bearer <管理员密码>` 与 Basic auth（`ADMIN_REVIEW_USERNAME` 默认 `admin`，密码 `ADMIN_REVIEW_PASSWORD`，旧部署可退回 `ADMIN_REVIEW_TOKEN`）。**未配置任何密码环境变量时返回 `null`（= 无密码则不拦截）**——生产务必配置 `ADMIN_REVIEW_PASSWORD`。
- **无库投稿存储**：`addFallbackSubmissionReview` 等把审核队列写到 `SUBMISSION_REVIEW_FALLBACK_FILE`（默认 `os.tmpdir()` 下 JSON），用「写临时文件 + rename」保证原子性。注意临时目录在 Netlify 冷启动间不持久，仅用于本地/演示。
- **筛选/统计纯函数** `filterArchiveRuns` / `buildStats` / `matchesCost`：与前端 `src/services/runUtils.ts` **语义重复但独立实现**（因 Functions 打包不能依赖前端别名）。改口径时两处必须同步。
- **`parseFilters()` 默认值完全来自 seed，无硬编码赛季**：`season` 缺省依次为 `params.season` → `seedConfig.seasons` 中 `isCurrent` 的赛季 → 首个赛季 → `""`（不再写死某个版本号，避免 seed 换季后兜底值失效）；`bossId` 缺省取 `seedConfig.bosses[0]?.id`，而 seed 的 `bosses` 现为空数组，因此缺省会得到 `""`。

## 鉴权与安全

- 管理端点（`admin-*`）先 `requireAdmin`，失败返回 `401 {message:"未授权"}`。
- 投稿/审核接口都用参数化 SQL（`neon` 模板），勿拼接字符串。
- 审核通过（`approved`）会把投稿 `submissionReviewToArchiveRun` 转换后 upsert 进 `runs` + `run_units`，最终 `status='approved'` 才出现在公开档案；`rejected`/`pending` 会从公开列表隐藏。改审核流转逻辑时保持「先 pending 插入、最后置 approved」的顺序。
- **owner_token 凭证体系**：`submissions.ts` 接受 POST 时通过 `crypto.getRandomValues(Uint8Array(24))` 生成 48 位 hex token，前缀 `own_`，写入 `submission_reviews.owner_token` 并在响应体返回给前端；`admin-submissions-id.ts` 审核通过时会同步写入 `runs.owner_token`。`submissions-me.ts` 接收 `{tokens:string[]}`（去重、上限 50），按 `owner_token = any(${tokens}::text[])` 拉该用户所有 `submission_reviews` 和 `runs`；`submissions-withdraw.ts` 用同一份 token 校验后把 `submission_reviews.status` 改 `withdrawn`、把同名 token 的 `runs.status` 也改 `withdrawn`（FK 关联的 run 也跟着隐藏）。`addFallbackSubmissionReview` 同步支持 `ownerToken` 字段，便于无 DB 环境演示。
- **审核通过时补 `stages` 行**：`runs.boss_id` 是 FK 引用 `stages(id)`，库内 `stages` 默认空。`admin-submissions-id.ts` 的 approved 分支在 `insert into runs` 之前先 `_staticSnapshot.getStaticBossMap()` 拉一次远程 `static.nanoka.cc`（与前端 `staticArchiveConfig.ts` 共用纯计算模块 `src/services/staticBossSnapshot.ts`），按 `run.bossId` 命中则 `insert ... on conflict (id) do update set` 写入 11 列完整数据（name/subtitle/hp/speed/toughness/weakness/resist/clears/memory_buff/banner_tone），用于服务端统计/导出也能读到真实数值；拉取失败或快照不含该 bossId 时降级为最小占位（`name=bossId`，其他列空），前端 `staticArchiveConfig` 仍按 id 合并展示详情。冷启动内多次 PATCH 复用同一份快照，Netlify 冷启动间内存不持久所以每次冷启动都重新拉。
- **批量补全 `stages`**：单次审核只会补当前那一条 `bossId`，其他 `stages` 行仍是空。管理员可调 `POST /api/admin/sync-stages`（Basic auth 即可），该接口会拉一遍远程快照并对所有 `BossStage` upsert；返回 `{ total, synced, failed, syncedIds, failedDetails }`。每次冷启动内多次调用复用同一份快照。建议新赛季上线后跑一次。

## 数据库

- 表结构见 `schema.sql`：`seasons / stages / characters / lightcones / runs / run_units / articles / submission_reviews`。
- `runs.status` 控制公开可见性；`run_units.kind` 区分 `character`/`lightcone`，`slot_index` 决定槽位顺序。
- 查询 `runs` 时用 `left join run_units` + `jsonb_agg ... filter (where kind=...)` 聚合出 `units`/`lightcones` 数组。
- 初始化数据用根目录 `pnpm seed:archive`（读 `src/data/seed/config.json` upsert），见 [../scripts/AGENTS.md](../scripts/AGENTS.md)。

## 开发约定

- Function 内导入前端代码用**相对路径**（如 `../../src/services/unitCost`），不用 `@/` 别名——esbuild 打包不解析 Vite 别名。`src/services/submissionUtils.ts` 顶部已注明此约束。
- 新增/修改 function 后，确认「有 DB」「无 DB」两条路径都返回正确 shape，并保持与前端 `ArchiveRun`/`MetaStats` 类型一致。
- 环境变量：`NETLIFY_DATABASE_URL`（或备选）、`ADMIN_REVIEW_USERNAME`、`ADMIN_REVIEW_PASSWORD`（或 `ADMIN_REVIEW_TOKEN`）、可选 `SUBMISSION_REVIEW_FALLBACK_FILE`。
