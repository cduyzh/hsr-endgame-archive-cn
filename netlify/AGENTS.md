# AGENTS.md — `netlify/`（Functions 与数据库）

服务端为 Netlify Functions（TypeScript），数据库为 Neon/Postgres（`@neondatabase/serverless`）。`netlify.toml` 负责把 `/api/*` 重写到 `/.netlify/functions/*`。核心原则：**有数据库走 SQL，没有数据库走文件/seed fallback，任何情况下都不能 500 或白屏。**

> 改动本目录（含 `netlify.toml`、`schema.sql`）后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」同步更新本文件（文件职责表、路由、环境变量）与根 `AGENTS.md` 的「API 与数据库」、`README.md` 的 API 清单，**同一提交内完成**。

## 文件职责

| 文件                      | 路由                            | 说明                                                                                                                                              |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_shared.ts`              | —（非 function）                | 公共工具：seed、DB 连接、鉴权、筛选/统计、无库文件 fallback。**被所有 function 复用**                                                             |
| `_staticSnapshot.ts`      | —（非 function）                | 服务端远程静态快照包装：`getStaticSnapshot()` 在 cold start 内 fetch 一次 `static.nanoka.cc` 并缓存，供审核通过时按 `bossId` 查完整 `BossStage` |
| `archive-stages.ts`       | `/api/archive/stages`           | GET 函数侧算好的敌方阶段快照 `{version, liveVersion, bosses}`；**本站唯一带长缓存的接口**（`Netlify-CDN-Cache-Control: public, durable, max-age=3600, stale-while-revalidate=604800` + `Netlify-Cache-Tag: stages-<数据目录>`），无需鉴权；上游失败返回 `502` 且保持 `no-store`，前端会回落到浏览器直连计算 |
| `archive-config.ts`       | `/api/archive/config`           | 返回配置（赛季/阶段/单位/文章），空表回退 seed                                                                                                    |
| `archive-runs.ts`         | `/api/archive/runs`             | 已审核记录（`status='approved'`），带筛选，`limit 200`                                                                                            |
| `archive-stats.ts`        | `/api/archive/stats`            | 统计，`limit 500` 聚合后 `buildStats`                                                                                                             |
| `submissions.ts`          | `/api/submissions`              | POST 投稿，非法 JSON 返回 `400`，缺字段返回 `400 {missing}`，**查重命中返回 `409 {message, duplicate}`**，入队 `pending` 返回 `202`，**同时下发 `ownerToken`（`own_<48 hex>`）到响应体**       |
| `submissions-check.ts`    | `/api/submissions/check`        | GET `?videoUrl=&bossId=&excludeIds=a,b`，投稿向导填完链接即预检查重，返回 `{duplicate, matches}`（最多 3 条，按时间倒序）；复用 `findDuplicateVideoRecords`，与入队拦截同一口径，无需鉴权。`excludeIds` 只服务二次编辑（修订沿用原视频与阶段），最多 8 条、越界项静默丢弃 |
| `submissions-me.ts`       | `/api/submissions/me`           | POST `{tokens:string[], includeHidden?}`，按本机凭证反查当前用户提过哪些 `submission_reviews` / `runs`，最多 50 个 token、上限 200 条记录；默认过滤掉已隐藏的**整条家族**（修订随父收纳）并回 `hiddenCount` |
| `submissions-withdraw.ts` | `/api/submissions/:id/withdraw` | PATCH `{token}`，校验 `owner_token` 匹配后把 `submission_reviews.status='withdrawn'`，并按 `runs.id = 投稿 id` **精确**改那一条公开记录（按 owner_token 全量改会让「撤回一条修订」连父记录的档案一起消失），同时把该投稿名下待审修订一并置 `withdrawn` |
| `submissions-visibility.ts` | `/api/submissions/:id/visibility` | PATCH `{token, hidden}`，作者的服务端隐藏开关（跨设备生效）。**只允许 `rejected` / `withdrawn`**，其余状态 400；幂等，返回 `{id, hidden}` |
| `submissions-delete.ts`   | `/api/submissions/:id/delete`   | DELETE `{token}`，作者硬删自己的投稿。**只允许 `rejected`**；先 `delete from runs where id=`（`run_units` 靠 `on delete cascade`）再删同家族修订与审核行，返回 `{id, deleted, removedRun}`。两张表都要清：`/me` 的 runs 查询不按 status 过滤，残留行会变成幽灵条目 |
| `submissions-revision.ts` | `/api/submissions/:id/revisions` | POST `{token, payload}`，「编辑并重新提交」。父为 `approved` → 新建一条带 `revises_id` 的待审修订并**复用父凭证**（同一父最多一条活跃修订，再次编辑就地覆盖），`202 {id, revisesId, ownerToken}`；父为 `rejected` → **就地覆盖**审核行回到 `pending` 并清驳回备注，`200 {id, updated:true}`。查重命中 `409`；排除的 id 由服务端按 `revises_id` 自己算，不接受客户端传值 |
| `admin-submissions.ts`    | `/api/admin/submissions`        | GET 审核列表（需鉴权），支持 `status` 过滤；带 `revisesId` 供审核台认出修订，不带 `hidden` / `owner_token` |
| `admin-submissions-id.ts` | `/api/admin/submissions/:id`    | PATCH 审核（通过/驳回/退回），需鉴权；通过时从远程静态快照补 `stages` 行；**写入 `runs.owner_token` 供用户后续检索**；写入的目标行是 `revisesId ?? 投稿 id`（`run_units` 也按它删/插），所以修订通过后原地更新原公开记录。驳回/退回分支保持按投稿 id 更新，修订没有 `runs` 行因此不会碰到父记录 |
| `admin-sync-stages.ts`    | `/api/admin/sync-stages`        | POST 批量从远程静态快照 upsert 所有 `stages` 行（需鉴权），新赛季/远程数据更新时手动触发                                                          |
| `schema.sql`              | —                               | 建表语句，手动在 Neon 执行                                                                                                                        |

## `_shared.ts` 关键约定

- **DB URL 读取顺序**：`NETLIFY_DATABASE_URL ?? DATABASE_URL ?? POSTGRES_URL`；`getSql()` 无 URL 时返回 `null`，各 handler 自行走 fallback。
- **`jsonResponse(body, status, headers?)`**：统一返回 `application/json` + `cache-control: no-store`；第三个参数按 key 覆盖默认头，目前只有 `archive-stages.ts` 用它开长缓存。**给别的接口加缓存前要确认返回内容确实与请求者/数据库状态无关**——`archive-config` 会随审核结果变化，绝不能缓存。
- **`requireAdmin(event)`**：支持两种认证：`Bearer <管理员密码>` 与 Basic auth（`ADMIN_REVIEW_USERNAME` 默认 `admin`，密码 `ADMIN_REVIEW_PASSWORD`，旧部署可退回 `ADMIN_REVIEW_TOKEN`）。**未配置任何密码环境变量时返回 `null`（= 无密码则不拦截）**——生产务必配置 `ADMIN_REVIEW_PASSWORD`。
- **无库投稿存储**：`addFallbackSubmissionReview` 等把审核队列写到 `SUBMISSION_REVIEW_FALLBACK_FILE`（默认 `os.tmpdir()` 下 JSON），用「写临时文件 + rename」保证原子性。注意临时目录在 Netlify 冷启动间不持久，仅用于本地/演示。按字段改行统一走 `patchFallbackSubmissionReview(id, patch)`（隐藏开关、就地重提、修订覆盖都用它，别为每个字段再加一个函数），硬删走 `deleteFallbackSubmissionReview(id)`（连带删掉整条修订链——父行没了，仍指向它的修订就是无主记录）。`listFallbackArchiveRuns()` 由审核队列派生公开记录，**必须按 `archiveRunIdOf` 去重**：一条原稿和它已通过的修订会映射到同一个 `runs` id，队列按新到旧存，保留先出现的那条才是最新内容。
- **筛选/统计纯函数** `filterArchiveRuns` / `buildStats` / `matchesRange`：与前端 `src/services/runUtils.ts` **语义重复但独立实现**（因 Functions 打包不能依赖前端别名）。改口径时两处必须同步。`matchesRange(value, min, max)` 由成本与分数共用，`null` 表示该侧不限。
- **投稿自助端点共用两个小工具**：`sanitizeOwnerToken(value)`（非字符串 / 空 / 超 200 字符一律非法）与 `readSubmissionId(event)`。撤回 / 隐藏 / 删除 / 修订四个端点都用它们——凭证校验口径不一致就等于鉴权口径不一致。
  **`event.path` 不是重写后的路径**：`netlify.toml` 里 status 200 的 proxy redirect 只改转发目标，handler 看到的 `path` 仍是浏览器那条 `/api/submissions/<id>/<action>`，**末段是动作名**。所以 `readSubmissionId` 先判断末段是否落在 `SUBMISSION_ACTION_SEGMENTS`（`withdraw` / `visibility` / `delete` / `revisions`），是则取它前一段，否则按直连形态 `/.netlify/functions/<name>/<id>`（末段即 id）处理；`?id=` 优先级最高。早期实现一律取末段，等于拿 `"revisions"` 去查库，线上四个端点**全部** `404 未找到提交记录`（无库 fallback 按同一个 id 查队列，症状一致）。`admin-submissions-id.ts` 另有一份内联的取末段逻辑，它恰好正确只因为 `/api/admin/submissions/:id` 的 `:id` 本来就在末段——**新增任何带动作后缀的端点都不要照抄「取末段」**，走 `readSubmissionId`；改这四条 redirect 的动作段名也要同步 `SUBMISSION_ACTION_SEGMENTS`，漏一段就退回 404。
- **投稿查重 `findDuplicateVideoRecords({videoUrl, bossId, excludeIds?})`**：判重键是「视频链接 + 敌方阶段」，只有 `pending` / `approved` 算已存在（驳回、撤回允许重提）。`excludeIds` 只服务二次编辑：修订沿用原投稿的视频与阶段，不排除就会自己撞自己，两条 SQL 都走 `not (id = any(${excludeIds}::text[]))`，空数组等价于不排除。有库走两条 SQL——`submission_reviews`（`payload->>'bossId'` + `payload->>'videoUrl'`）与 `runs`（`boss_id` + `video_url`，覆盖不经投稿直接灌库的记录），按 id 去重保留投稿侧、最多 3 条；无库用 `isSameVideo()` 过滤 `listFallbackSubmissionReviews("all")` + `listFallbackArchiveRuns()` + `seedRuns`。链接同一性由 `src/services/videoUrl.ts` 决定（BV 号 / YouTube id / 规范化 URL），SQL 用 `~*` 配 `videoMatchPattern()` 生成的**带字母数字边界断言**的正则，避免 `BVxxxx2` 误配 `BVxxxx23`；查重读失败返回 `[]` 放行，不把投稿接口带崩。
- **`parseFilters()` 的 `flags` 走 `isRunFlag` 收窄**（从 `../../src/services/runFlags` 相对引用，不能引 `runUtils`——它带 `@/` 值导入、esbuild 不解析别名）。与前端 `useArchiveFilters.normalizeFlags()` 同口径：非法标记**丢弃**而不是留在筛选条件里，否则 `?flags=revive,bogus` 这类深链在前端是「只看复活」、在服务端会变成空集。
- **`parseFilters()` 默认值完全来自 seed，无硬编码赛季**：`season` 缺省依次为 `params.season` → `seedConfig.seasons` 中 `isCurrent` 的赛季 → 首个赛季 → `""`（不再写死某个版本号，避免 seed 换季后兜底值失效）；`bossId` 缺省取 `seedConfig.bosses[0]?.id`，而 seed 的 `bosses` 现为空数组，因此缺省会得到 `""`。
- **区间筛选参数** `costMin` / `costMax` / `scoreMin` / `scoreMax`：由本文件的 `readBound()` 宽松解析，空值 / 非数字 / 负数都视为「该侧不限」，成本另钳到 `COST_MAX`。旧的 `?cost=17-32` 桶深链仍读得懂（`readLegacyCostBucket()` 映射成对应端点）。这两个函数与前端 `useArchiveFilters.ts` 里的同名实现是**同一套规则的两份拷贝**，改一处要改两处，否则深链在服务端与浏览器端会解出不同结果。

## 鉴权与安全

- 管理端点（`admin-*`）先 `requireAdmin`，失败返回 `401 {message:"未授权"}`。
- 投稿/审核接口都用参数化 SQL（`neon` 模板），勿拼接字符串。
- 审核通过（`approved`）会把投稿 `submissionReviewToArchiveRun` 转换后 upsert 进 `runs` + `run_units`，最终 `status='approved'` 才出现在公开档案；`rejected`/`pending` 会从公开列表隐藏。改审核流转逻辑时保持「先 pending 插入、最后置 approved」的顺序。
- **owner_token 凭证体系**：`submissions.ts` 接受 POST 时通过 `crypto.getRandomValues(Uint8Array(24))` 生成 48 位 hex token，前缀 `own_`，写入 `submission_reviews.owner_token` 并在响应体返回给前端；`admin-submissions-id.ts` 审核通过时会同步写入 `runs.owner_token`。`submissions-me.ts` 接收 `{tokens:string[]}`（去重、上限 50），按 `owner_token = any(${tokens}::text[])` 拉该用户所有 `submission_reviews` 和 `runs`。四个按凭证鉴权的自助端点（`withdraw` / `visibility` / `delete` / `revision`）都先比对 `owner_token`，不匹配一律 `403`，并且**都按投稿 id 精确定位**要改的那一行——`runs.id === submission_reviews.id`，按 `owner_token` 全量改会让一次操作波及同一凭证下的其它记录。隐藏只接受 `rejected` / `withdrawn`，删除只接受 `rejected`（`runs` + `submission_reviews` 一起移除、不可恢复，已通过记录不允许作者自行抹掉公开档案）。二次编辑的修订**复用父投稿的凭证**（不签发新 token），否则同一个父会挂着两条凭证、`/me` 的家族折叠就散了。`addFallbackSubmissionReview` 同步支持 `ownerToken` / `revisesId` / `hidden` 字段，便于无 DB 环境演示。
- **审核通过时补 `stages` 行**：`runs.boss_id` 是 FK 引用 `stages(id)`，库内 `stages` 默认空。`admin-submissions-id.ts` 的 approved 分支在 `insert into runs` 之前先 `_staticSnapshot.getStaticBossMap()` 拉一次远程 `static.nanoka.cc`（与前端 `staticArchiveConfig.ts` 共用纯计算模块 `src/services/staticBossSnapshot.ts`），按 `run.bossId` 命中则 `insert ... on conflict (id) do update set` 写入 13 列完整数据（name/variant_name/subtitle/hp/speed/toughness/weakness/resist/clears/mechanic/stage_buffs/banner_tone），用于服务端统计/导出也能读到真实数值；拉取失败或快照不含该 bossId 时降级为最小占位（`name=bossId`，其他列空），前端 `staticArchiveConfig` 仍按 id 合并展示详情。冷启动内多次 PATCH 复用同一份快照，Netlify 冷启动间内存不持久所以每次冷启动都重新拉。
- **批量补全 `stages`**：单次审核只会补当前那一条 `bossId`，其他 `stages` 行仍是空。管理员可调 `POST /api/admin/sync-stages`（Basic auth 即可），该接口会拉一遍远程快照并对所有 `BossStage` upsert；返回 `{ total, synced, failed, syncedIds, failedDetails }`。每次冷启动内多次调用复用同一份快照。建议新赛季上线后跑一次。

## 数据库

- 表结构见 `schema.sql`：`seasons / stages / characters / lightcones / runs / run_units / articles / submission_reviews`。
- **`stages` 是纯派生表**，可用 `pnpm sync:stages` 或 `POST /api/admin/sync-stages` 整表重建（与前端共用 `src/services/staticBossSnapshot.ts`）。场地 buff 用 `mechanic jsonb`（单条赛季机制，可为 NULL）+ `stage_buffs jsonb`（该阶段增益与词缀数组）存储，另有 `variant_name text` 存当期变体首领名——这三列取代了旧的 `memory_buff text`。`schema.sql` 末尾带幂等列迁移，已部署库重跑该文件即可原地升级，随后回填一次。
- `runs.status` 控制公开可见性；`run_units.kind` 区分 `character`/`lightcone`，`slot_index` 决定槽位顺序。
- **`runs` 与 `submission_reviews` 靠同一个 id 值 1:1 关联**（`runs` 没有 `submission_id` 列，投稿审核写入时 `runs.id` 就是投稿 id）。因此二次编辑的修订用**新行 + `submission_reviews.revises_id` 指回原投稿**，通过时写的是原投稿那行 `runs`（原地更新，不新增公开记录）；`submissions-me.ts` 的 runs 查询**不带 status 过滤**，所以硬删一条投稿必须 `runs` + `submission_reviews` 两张表一起清。
- `submission_reviews` 的自助管理两列：`hidden boolean not null default false`（作者收纳状态，跨设备生效，只作用父行——修订随父一起折叠）与 `revises_id text`。幂等迁移在 `schema.sql` 末尾（**索引必须排在 `add column` 之后**，否则已部署库上会因列还不存在而失败），另存一份 `netlify/migrations/2026-09-09_submission_hidden_and_revision.sql`。**部署顺序：先在生产库执行迁移，再发布函数**——新列缺失时 `/api/submissions/me` 的 select 会直接失败。
- 查询 `runs` 时用 `left join run_units` + `jsonb_agg ... filter (where kind=...)` 聚合出 `units`/`lightcones` 数组。
- 初始化数据用根目录 `pnpm seed:archive`（读 `src/data/seed/config.json` upsert），见 [../scripts/AGENTS.md](../scripts/AGENTS.md)。

## 开发约定

- Function 内导入前端代码用**相对路径**（如 `../../src/services/unitCost`），不用 `@/` 别名——esbuild 打包不解析 Vite 别名。`src/services/submissionUtils.ts` 与 `src/services/videoUrl.ts` 顶部已注明此约束。
- 新增/修改 function 后，确认「有 DB」「无 DB」两条路径都返回正确 shape，并保持与前端 `ArchiveRun`/`MetaStats` 类型一致。
- 环境变量：`NETLIFY_DATABASE_URL`（或备选）、`ADMIN_REVIEW_USERNAME`、`ADMIN_REVIEW_PASSWORD`（或 `ADMIN_REVIEW_TOKEN`）、可选 `SUBMISSION_REVIEW_FALLBACK_FILE`。
