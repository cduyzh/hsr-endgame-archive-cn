# AGENTS.md — `src/services/`（数据访问与纯函数层）

这是全站的“业务逻辑 + 数据访问”层。组件与 composable 只调用这里导出的函数；改数据形状、筛选/统计规则或图片寻址，都应在这一层完成并补测试。

> 改动本目录任何文件后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」表格同步更新本文件与相关文档，**同一提交内完成**。

## 文件职责

| 文件                     | 角色                                                              | 关键导出                                                                                                             |
| ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `dataSource.ts`          | 远程数据源配置（唯一入口）                                        | `DATA_SITE`、`dataSourceUrl()`、`IMAGE_BASES`、`monsterImageUrl()`                                                   |
| `archiveService.ts`      | 前端 API 请求 + seed fallback + 静态快照合并 + 管理员会话         | `fetchArchiveConfig/Runs/MetaStats`、`submitRun`、`createAdminSession`、`fetchSubmissionReviews`、`reviewSubmission` |
| `staticArchiveConfig.ts` | 按 `STATIC_SEASON_IDS` 直连各赛季详情，生成敌方阶段并补齐配置缺口 | `fetchStaticArchiveSnapshot()`、`mergeStaticArchiveConfig()`                                                         |
| `runUtils.ts`            | 记录筛选/排序/统计纯函数                                          | `filterRuns`、`buildMetaStats`、`matchesCost`                                                                        |
| `unitCost.ts`            | 五星角色“限定/常驻”成本分类                                       | `getCharacterGoldKind`、`getRunGoldCounts`、`getUnitGoldCounts`、`goldKindLabels`                                    |
| `submissionUtils.ts`     | 投稿转换纯函数                                                    | `submissionReviewToArchiveRun`、`buildPreferredLightconeByCharacter`                                                 |
| `submissionValidation.ts`| 投稿表单的字段校验、步骤归属与预览取数（仅前端使用）              | `validateSubmissionForm`、`errorsOfStep`、`stepOfField`、`buildSubmissionRoster`、`describeSubmissionTarget`         |

## 两条数据线（不要混用）

1. **业务数据**：`archiveService.ts` 请求 `/api/archive/*`、`/api/submissions`、`/api/admin/submissions*`。API 基础前缀读 `VITE_API_BASE`（默认空）。
2. **静态游戏数据**：`dataSource.ts` 直连 `https://static.nanoka.cc`（已开 CORS），不落盘、不代理。

### 统一请求回退约定（重要）

`archiveService.ts` 的 `requestJson()` 在请求失败或非 2xx 时**静默回退到 `data/seed`**，保证无数据库/无后端环境不白屏。新增请求函数必须沿用这个模式：先试 API，失败回退 seed，绝不抛未处理异常到组件。

## 静态快照与合并（`staticArchiveConfig.ts`）

- 入口 `fetchStaticArchiveSnapshot()`：读 `manifest.json` → 遍历 `STATIC_SEASON_IDS` 的每个大版本 → `pickVersion(manifest.hsr.available, "4.5")` 选出该大版本最新目录（如 `4.5.51`）→ 拉 `monster.json`/`monstervalue.json`/`HardLevelGroup.json`/`EliteGroup.json`/`InfiniteEliteGroup.json`（最后一个允许缺失）→ 直接按 id 拉四份模式详情。**不读** `maze.json / maze_extra.json / maze_boss.json / maze_peak.json` 索引，**不用** `hsr.latest`，远程也没有 `cache-plan.json`。`liveVersion` 取 `manifest.hsr.live`。manifest 请求失败返回 `null`；单个赛季构建失败只丢该赛季。
- **赛季详情 id 是硬编码的**：`STATIC_SEASON_IDS = { "4.4": { moc:1034, fiction:2025, doom:3019, peak:8 }, "4.5": { moc:1035, fiction:2026, doom:3020, peak:9 } }`。上线新赛季必须在此新增条目，否则页面不会出现该赛季（见根 `AGENTS.md` 的「新赛季上线清单」）。
- 模式映射（业务 → 静态 → 详情目录）：`moc→moc/maze`、`pf→fiction/story`、`as→doom/boss`、`aa→peak/peak`，locale 固定 `zh`。阶段副标题文案来自本文件的 `modeLabelByStaticMode`，与 seed `config.json` 的 `modes[].label` 一致（`aa` 统一为「异相仲裁」）——改任一处名称必须同时改另一处。
- 阶段构建：`buildMocStages` / `buildPfStages` / `buildAsStages` / `buildAaStages` 各自从详情里挑终层与星临层；`aa` 遍历 `pre_level` 生成 `k1..kN`，再加 `checkmate`、`plight`。阶段首领由 `bossMonsterIdOf()` 在末波怪物里按 `rank`（`Elite`/`Minion`/`MinionLv2` 视为随从，未知 rank 视为主首领）+ 血量打分选出。上游偶发的 `"BOSS"` 占位名会退回阶段名。
- 阶段 id：`${seasonId}-${业务模式}-${stageKey}`，是 seed/库里记录 `bossId` 引用的稳定值。
- 数值口径：`HP = HPBase × child.HPModifyRatio × HardLevelGroup.HPRatio × (EliteGroup|InfiniteEliteGroup).HPRatio`，`MaxMonsterPhase > 1` 时展示值追加 ` x<阶段数>`（如 `800,000 x2`）。速度乘 `HardLevelGroup.SpeedRatio` 保留 1 位小数，韧性额外乘精英组 `StanceRatio`。**没有** `PhaseList.phase_max_hp_ratio` 这一路。`pf` 传 `skipHp`，血量不展示。
- `mergeStaticArchiveConfig()`：只把 `config.bosses` 中**不存在 id** 的生成阶段追加进去，并为缺失赛季补 `{ id, label: "<seasonId> 归档", isCurrent: seasonId === liveVersion }`。已有条目（含 seed/库中的历史阶段与赛季 label）**一律不覆盖**。快照为空或 `bosses` 为空时原样返回。
- 文本统一经 `cleanText()` 去掉富文本标签与 `#n[i]` 占位；多语言取 `zh → en → ja → ko`。

## 成本与统计口径（`unitCost.ts` / `runUtils.ts`）

- `getCharacterGoldKind()`：只对 5 星角色生效；开拓者(含 `trailblazer`/`开拓者`)记 `free`；`STANDARD_FIVE_STAR_IDS/NAMES`（瓦尔特、姬子、布洛妮娅、杰帕德、克拉拉、彦卿、白露）记 `standard`；其余记 `limited`。新增常驻五星时同步这两个集合。
- `getRunGoldCounts(run, units)` 只是 `getUnitGoldCounts(run.units, units)` 的薄封装，投稿表单等没有 `ArchiveRun` 的场合直接用后者；中文标签统一取 `goldKindLabels`，不要在组件里另写一份。
- `filterRuns()` 排序：`latest` 按 `submittedAt` 倒序；`limited` 先按限定数再按轮次；默认按 `cycle ↑, score ↓, cost ↑`。
- `buildMetaStats()` 成本分桶固定为 `0-8 / 9-16 / 17-32 / 33-48`，使用率 = `count / runs.length`（百分比，保留 1 位）。改动分桶或使用率口径会同时影响前端与 `netlify/functions/_shared.ts` 的 `buildStats`，两处需保持一致。

## 投稿校验与预览（`submissionValidation.ts`）

- 只服务前端向导（`SubmitRunForm.vue` / `SubmitRunDialog.vue`），**不被 Netlify Function 引用**，因此可以用 `@/` 别名。服务端字段级校验仍看 `netlify/functions/_shared.ts` 的 `validateSubmission()`。
- `validateSubmissionForm(form, config)` 返回**有序** `{ field, message }` 列表：列表顺序就是错误汇总条与字段提示的展示顺序，新增规则时按「赛季/模式/阶段/分类 → 作者/视频 → 队伍 → 数值」插到对应位置。
- 步骤归属由 `submissionStepFields` 决定（`basic` / `team` / `result`），`errorsOfStep()` 判断能否进入下一步、`stepOfField()` 在提交失败时把用户跳回第一步出错的那个环节；新增字段必须同时登记归属，否则该字段的错误不会被任何步骤拦下。
- 数值用 `toInteger()` 宽松解析（`v-model.number` 在清空时会留下 `""`）；`COST_MIN/COST_MAX`（0–48）与 `buildMetaStats()` 的 `33-48` 桶对齐，改上限要同时改分桶口径。
- 视频链接只要求是完整的 `http(s)` 地址（`isUsableVideoUrl()`），不限制具体站点；命途与角色不匹配**不是错误**，只在槽位上给「命途不同」提示。
- 预览取数：`describeSubmissionTarget()` 把 season/mode/stage/category 的 id 翻成配置里的 label，`buildSubmissionRoster()` 输出每槽角色命座、光锥叠影、金币分类与命途是否错位，单位缺失时用「未选择 / 未搭配」占位。

## 配置读取链路（`archiveService.fetchArchiveConfig`）

`fetchArchiveConfig()` = `requestJson("/api/archive/config", () => seedConfig)` 再 `mergeStaticArchiveConfig(config, await fetchStaticArchiveSnapshot())`。也就是说**服务端返回的配置还会被前端二次补全**，`archive-config.ts` 里没有远程静态数据逻辑。排查“页面少了某个赛季/阶段”时先看这里，而不是先查 DB。

`fetchRuns` / `fetchMetaStats` 只走业务数据；`submitRun` 与两个管理端接口**不回退 seed**，失败直接抛错由调用方提示。`submitRun` 会读取失败响应的 `{ message, missing }`，用 `submissionFieldLabels` 把 `missing` 里的字段名翻成中文后抛错（响应体不是 JSON 时退回通用文案），投稿向导据此显示行内提示。

## 图片寻址（`dataSource.ts`）

- `IMAGE_BASES` 只有四类：`monster`（monstermiddleicon）、`character`（avatarshopicon）、`lightcone`（lightconemediumicon）、`path`（pathicon）。
- `monsterImageUrl(id)`：9 位实例 id（`>= 1e8`）先 `/100` 回退到基础 id，再按命名规则向下对齐到整十。
- 单位图经 `data/unitAssets.ts`（用 `config.json` 的 `sourceId` 映射）；命途图经 `data/unitPaths.ts`。不要把数据源 JSON 或图片下载到 `public/` 发布（`public/` 当前只有 `favicon.png`）。
- `data/seed/hsr-units.json`、`hsr-monsters.json` 只由 `scripts/` 同步脚本写出，运行时不 import；运行时单位图完全依赖 `config.json` 的 `units[].sourceId`。

## 约束

- 这里的函数尽量保持**纯函数 + 显式入参**，方便在 `tests/` 直接断言。
- 修改筛选/排序/统计/投稿转换或远程解析逻辑时，必须补 `tests/` 用例或最小验证说明，并确认静态读取失败时 seed/API fallback 仍可用。
- 不要在这一层引用 Vue（保持框架无关），`Vue` 相关状态留给 `composables/`。
