# AGENTS.md — `src/services/`（数据访问与纯函数层）

这是全站的“业务逻辑 + 数据访问”层。组件与 composable 只调用这里导出的函数；改数据形状、筛选/统计规则或图片寻址，都应在这一层完成并补测试。

## 文件职责

| 文件 | 角色 | 关键导出 |
| --- | --- | --- |
| `dataSource.ts` | 远程数据源配置（唯一入口） | `DATA_SITE`、`dataSourceUrl()`、`IMAGE_BASES`、`monsterImageUrl()` |
| `archiveService.ts` | 前端 API 请求 + seed fallback + 管理员会话 | `fetchArchiveConfig/Runs/MetaStats`、`submitRun`、`createAdminSession`、`fetchSubmissionReviews`、`reviewSubmission` |
| `staticArchiveConfig.ts` | 直连远程静态数据，推导当前赛季与敌方阶段，合并进配置 | `fetchStaticArchiveSnapshot()`、`mergeStaticArchiveConfig()` |
| `runUtils.ts` | 记录筛选/排序/统计纯函数 | `filterRuns`、`buildMetaStats`、`matchesCost` |
| `unitCost.ts` | 五星角色“限定/常驻”成本分类 | `getCharacterGoldKind`、`getRunGoldCounts` |
| `submissionUtils.ts` | 投稿转换纯函数 | `submissionReviewToArchiveRun`、`buildPreferredLightconeByCharacter` |

## 两条数据线（不要混用）

1. **业务数据**：`archiveService.ts` 请求 `/api/archive/*`、`/api/submissions`、`/api/admin/submissions*`。API 基础前缀读 `VITE_API_BASE`（默认空）。
2. **静态游戏数据**：`dataSource.ts` 直连 `https://static.nanoka.cc`（已开 CORS），不落盘、不代理。

### 统一请求回退约定（重要）

`archiveService.ts` 的 `requestJson()` 在请求失败或非 2xx 时**静默回退到 `data/seed`**，保证无数据库/无后端环境不白屏。新增请求函数必须沿用这个模式：先试 API，失败回退 seed，绝不抛未处理异常到组件。

## 静态快照合并（`staticArchiveConfig.ts`）

- 入口 `fetchStaticArchiveSnapshot()`：读 `manifest.json` → 取 `hsr.latest` 作为版本 → 拉 `monster.json` 建查找表 → 从四个模式索引文件推导各模式当前赛季（取索引内最大 `seasonId`，远程无 `cache-plan.json`，**必须实时推导**）→ 拉对应期详情拼 `phases`。任何一步失败返回 `null`，由上层保留原配置。
- 模式映射（业务 → 静态）：`moc→moc`、`pf→fiction`、`as→doom`、`aa→peak`；详情目录 `maze/story/boss/peak`，locale 固定 `zh`。
- `mergeStaticArchiveConfig()` 只覆盖**当前赛季**的赛季 label 与敌方阶段展示字段（name/subtitle/weakness/memoryBuff/monsters 等）。业务筛选用的 `seasonId`、`bossId` 仍取业务配置中的稳定 id，避免与已有记录失配。
- 文本统一经 `cleanText()` 去掉富文本标签与 `#n[i]` 占位。

## 成本与统计口径（`unitCost.ts` / `runUtils.ts`）

- `getCharacterGoldKind()`：只对 5 星角色生效；开拓者(含 `trailblazer`/`开拓者`)记 `free`；`STANDARD_FIVE_STAR_IDS/NAMES`（瓦尔特、姬子、布洛妮娅、杰帕德、克拉拉、彦卿、白露）记 `standard`；其余记 `limited`。新增常驻五星时同步这两个集合。
- `filterRuns()` 排序：`latest` 按 `submittedAt` 倒序；`limited` 先按限定数再按轮次；默认按 `cycle ↑, score ↓, cost ↑`。
- `buildMetaStats()` 成本分桶固定为 `0-8 / 9-16 / 17-32 / 33-48`，使用率 = `count / runs.length`（百分比，保留 1 位）。改动分桶或使用率口径会同时影响前端与 `netlify/functions/_shared.ts` 的 `buildStats`，两处需保持一致。

## 图片寻址（`dataSource.ts`）

- `monsterImageUrl(id)`：9 位实例 id（`>= 1e8`）先 `/100` 回退到基础 id，再按命名规则对齐到整十。
- 单位图经 `data/unitAssets.ts`（`sourceId` 映射）；命途图经 `data/unitPaths.ts`。不要把数据源 JSON 或图片下载到 `public/` 发布。

## 约束

- 这里的函数尽量保持**纯函数 + 显式入参**，方便在 `tests/` 直接断言。
- 修改筛选/排序/统计/投稿转换或远程解析逻辑时，必须补 `tests/` 用例或最小验证说明，并确认静态读取失败时 seed/API fallback 仍可用。
- 不要在这一层引用 Vue（保持框架无关），`Vue` 相关状态留给 `composables/`。
