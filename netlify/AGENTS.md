# AGENTS.md — `netlify/`（Functions 与数据库）

服务端为 Netlify Functions（TypeScript），数据库为 Neon/Postgres（`@neondatabase/serverless`）。`netlify.toml` 负责把 `/api/*` 重写到 `/.netlify/functions/*`。核心原则：**有数据库走 SQL，没有数据库走文件/seed fallback，任何情况下都不能 500 或白屏。**

## 文件职责

| 文件 | 路由 | 说明 |
| --- | --- | --- |
| `_shared.ts` | —（非 function） | 公共工具：seed、DB 连接、鉴权、筛选/统计、无库文件 fallback。**被所有 function 复用** |
| `archive-config.ts` | `/api/archive/config` | 返回配置（赛季/阶段/单位/文章），空表回退 seed |
| `archive-runs.ts` | `/api/archive/runs` | 已审核记录（`status='approved'`），带筛选，`limit 200` |
| `archive-stats.ts` | `/api/archive/stats` | 统计，`limit 500` 聚合后 `buildStats` |
| `submissions.ts` | `/api/submissions` | POST 投稿，校验后入队 `pending`，返回 `202` |
| `admin-submissions.ts` | `/api/admin/submissions` | GET 审核列表（需鉴权），支持 `status` 过滤 |
| `admin-submissions-id.ts` | `/api/admin/submissions/:id` | PATCH 审核（通过/驳回/退回），需鉴权 |
| `schema.sql` | — | 建表语句，手动在 Neon 执行 |

## `_shared.ts` 关键约定

- **DB URL 读取顺序**：`NETLIFY_DATABASE_URL ?? DATABASE_URL ?? POSTGRES_URL`；`getSql()` 无 URL 时返回 `null`，各 handler 自行走 fallback。
- **`jsonResponse(body, status)`**：统一返回 `application/json` + `cache-control: no-store`。
- **`requireAdmin(event)`**：支持两种认证：`Bearer <管理员密码>` 与 Basic auth（`ADMIN_REVIEW_USERNAME` 默认 `admin`，密码 `ADMIN_REVIEW_PASSWORD`，旧部署可退回 `ADMIN_REVIEW_TOKEN`）。**未配置任何密码环境变量时返回 `null`（= 无密码则不拦截）**——生产务必配置 `ADMIN_REVIEW_PASSWORD`。
- **无库投稿存储**：`addFallbackSubmissionReview` 等把审核队列写到 `SUBMISSION_REVIEW_FALLBACK_FILE`（默认 `os.tmpdir()` 下 JSON），用「写临时文件 + rename」保证原子性。注意临时目录在 Netlify 冷启动间不持久，仅用于本地/演示。
- **筛选/统计纯函数** `filterArchiveRuns` / `buildStats` / `matchesCost`：与前端 `src/services/runUtils.ts` **语义重复但独立实现**（因 Functions 打包不能依赖前端别名）。改口径时两处必须同步。

## 鉴权与安全

- 管理端点（`admin-*`）先 `requireAdmin`，失败返回 `401 {message:"未授权"}`。
- 投稿/审核接口都用参数化 SQL（`neon` 模板），勿拼接字符串。
- 审核通过（`approved`）会把投稿 `submissionReviewToArchiveRun` 转换后 upsert 进 `runs` + `run_units`，最终 `status='approved'` 才出现在公开档案；`rejected`/`pending` 会从公开列表隐藏。改审核流转逻辑时保持「先 pending 插入、最后置 approved」的顺序。

## 数据库

- 表结构见 `schema.sql`：`seasons / stages / characters / lightcones / runs / run_units / articles / submission_reviews`。
- `runs.status` 控制公开可见性；`run_units.kind` 区分 `character`/`lightcone`，`slot_index` 决定槽位顺序。
- 查询 `runs` 时用 `left join run_units` + `jsonb_agg ... filter (where kind=...)` 聚合出 `units`/`lightcones` 数组。
- 初始化数据用根目录 `pnpm seed:archive`（读 `src/data/seed/config.json` upsert），见 [../scripts/AGENTS.md](../scripts/AGENTS.md)。

## 开发约定

- Function 内导入前端代码用**相对路径**（如 `../../src/services/unitCost`），不用 `@/` 别名——esbuild 打包不解析 Vite 别名。`src/services/submissionUtils.ts` 顶部已注明此约束。
- 新增/修改 function 后，确认「有 DB」「无 DB」两条路径都返回正确 shape，并保持与前端 `ArchiveRun`/`MetaStats` 类型一致。
- 环境变量：`NETLIFY_DATABASE_URL`（或备选）、`ADMIN_REVIEW_USERNAME`、`ADMIN_REVIEW_PASSWORD`（或 `ADMIN_REVIEW_TOKEN`）、可选 `SUBMISSION_REVIEW_FALLBACK_FILE`。
