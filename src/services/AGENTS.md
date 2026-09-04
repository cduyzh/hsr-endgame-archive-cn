# AGENTS.md — `src/services/`（数据访问与纯函数层）

这是全站的“业务逻辑 + 数据访问”层。组件与 composable 只调用这里导出的函数；改数据形状、筛选/统计规则或图片寻址，都应在这一层完成并补测试。

> 改动本目录任何文件后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」表格同步更新本文件与相关文档，**同一提交内完成**。

## 文件职责

| 文件                      | 角色                                                                                                                       | 关键导出                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `dataSource.ts`           | 远程数据源配置（唯一入口）                                                                                                 | `DATA_SITE`、`dataSourceUrl()`、`IMAGE_BASES`、`monsterImageUrl()`                                                       |
| `archiveService.ts`       | 前端 API 请求 + seed fallback + 静态快照合并 + 管理员会话                                                                  | `fetchArchiveConfig/Runs/MetaStats`、`submitRun`、`checkDuplicateVideo`、`SubmissionDuplicateError`、`createAdminSession`、`fetchSubmissionReviews`、`reviewSubmission`     |
| `staticArchiveConfig.ts`  | 浏览器端入口：拉 `manifest` → 定位最新数据目录 → 委托 `staticBossSnapshot` 推导出敌方阶段并补齐配置缺口                    | `fetchStaticArchiveSnapshot()`、`mergeStaticArchiveConfig()`                                                             |
| `staticBossSnapshot.ts`   | 远程静态快照的纯计算层（不发起网络），被前端 `staticArchiveConfig.ts` 与服务端 `netlify/functions/_staticSnapshot.ts` 共用 | `buildSeasonBosses(seasonId, version, baseUrl)`、`pickDataDirectory()`、`STATIC_SEASON_IDS`、各类 build\*Stages 纯函数   |
| `runUtils.ts`             | 记录筛选/排序/统计纯函数 + 分类/标记/阶段分组口径唯一来源                                                                    | `filterRuns`、`buildMetaStats`、`matchesRange`、`categoryLabels`、`categoryOptionsFor`、`categoryOfAsScore`、`defaultModeOf`、`stageKeyOf`、`flagOrder`/`flagLabels`/`isRunFlag`/`flagsOfRun`、`stageGroupOf`/`isStarwardStage` |
| `unitCost.ts`             | 角色与光锥的“限定/常驻/不计成本”分类 + 成本与默认值口径（**无 `@/` 值导入，Functions 可相对引用**）                          | `COST_MIN`/`COST_MAX`、`getCharacterGoldKind`、`getLightconeGoldKind`、`getRunGoldCounts`、`getUnitGoldCounts`、`defaultEidolonFor`、`defaultSuperimpositionFor`、`goldKindLabels` |
| `submissionUtils.ts`      | 投稿转换纯函数                                                                                                             | `submissionReviewToArchiveRun`、`buildPreferredLightconeByCharacter`、`buildSuggestedLightconeByCharacter`                |
| `submissionValidation.ts` | 投稿表单的字段校验、步骤归属、新建默认成绩与预览取数（仅前端使用）                                                             | `validateSubmissionForm`、`errorsOfStep`、`stepOfField`、`defaultResultFor`、`buildSubmissionRoster`、`describeSubmissionTarget`             |
| `videoUrl.ts`             | 「同一支视频」的唯一口径：从链接提取 BV 号 / YouTube 视频 id，取不到退回规范化 URL；投稿预检与服务端入队拦截共用（**无 `@/` 值导入，Functions 相对引用**） | `videoIdentityOf`、`videoMatchPattern`、`matchesVideoIdentity`、`isSameVideo`、`DUPLICATE_VIDEO_MESSAGE`                 |

## 两条数据线（不要混用）

1. **业务数据**：`archiveService.ts` 请求 `/api/archive/*`、`/api/submissions`（含 `/check` 查重预检、`/me` 凭证反查、`/:id/withdraw` 撤回）、`/api/admin/submissions*`。API 基础前缀读 `VITE_API_BASE`（默认空）。
2. **静态游戏数据**：`dataSource.ts` 直连 `https://static.nanoka.cc`（已开 CORS），不落盘、不代理。

### 统一请求回退约定（重要）

`archiveService.ts` 的 `requestJson()` 在请求失败或非 2xx 时**静默回退到 `data/seed`**，保证无数据库/无后端环境不白屏。新增请求函数必须沿用这个模式：先试 API，失败回退 seed，绝不抛未处理异常到组件。投稿查重 `checkDuplicateVideo()` 是这条约定的一个有意变体：它不回退而是**失败即返回 `[]` 放行**（预检拿不到结果不该挡住正常投稿），真正的拦截由服务端入队时的 `409` 负责。

## 静态快照与合并（`staticBossSnapshot.ts` 计算 / `staticArchiveConfig.ts` 入口）

- 入口 `fetchStaticArchiveSnapshot()`：读 `manifest.json` → `pickDataDirectory(manifest.hsr.available)` 选出**最新数据目录**（如 `4.5.51`），所有赛季共用它（上游只保留当前大版本目录，历史赛季详情在其下累积）→ 拉 `monster.json`/`monstervalue.json`/`HardLevelGroup.json`/`EliteGroup.json`/`InfiniteEliteGroup.json`（最后一个允许缺失）→ 直接按 id 拉四份模式详情。**不读** `maze.json / maze_extra.json / maze_boss.json / maze_peak.json` 索引，**不用** `hsr.latest`，远程也没有 `cache-plan.json`。`liveVersion` 取 `manifest.hsr.live`。manifest 请求失败或 available 为空返回 `null`；单个赛季构建失败只丢该赛季。
- **赛季详情 id 是硬编码的**：`STATIC_SEASON_IDS = { "4.4": { moc:1034, fiction:2025, doom:3019, peak:8 }, "4.5": { moc:1035, fiction:2026, doom:3020, peak:9 } }`。上线新赛季必须在此新增条目，否则页面不会出现该赛季（见根 `AGENTS.md` 的「新赛季上线清单」）。
- 模式映射（业务 → 静态 → 详情目录）：`moc→moc/maze`、`pf→fiction/story`、`as→doom/boss`、`aa→peak/peak`，locale 固定 `zh`。阶段副标题文案来自本文件的 `modeLabelByStaticMode`，与 seed `config.json` 的 `modes[].label` 一致（`aa` 统一为「异相仲裁」）——改任一处名称必须同时改另一处。
- 阶段构建：`buildMocStages` / `buildPfStages` / `buildAsStages` / `buildAaStages` 各自从详情里挑终层与星启层；`aa` 遍历 `pre_level` 生成 `k1..kN`，再加 `checkmate`、`plight`。阶段首领由 `bossMonsterIdOf()` 在末波怪物里按 `rank`（`Elite`/`Minion`/`MinionLv2` 视为随从，未知 rank 视为主首领）+ 血量打分选出。上游偶发的 `"BOSS"` 占位名会退回阶段名。
- 弱点与抗性：`BossStage.weakness` **只取阶段首领自身的 `weak`**（`bossWeaknessOf()`）——上游阶段上的 `damage_type` / `damage_type1/2` 只是弱点的一个子集，不是弱点表（4.4 异相仲裁将杀关 `damage_type` 给 `火/量子`，首领实际弱点是 `火/雷/量子`；4.4 末日幻影星启的「心蕉如火的猴把戏」根本没有弱点），所以 `StageDraft` 不带 `weakness` 字段、`StaticLevel` 也不声明 `damage_type*`。`BossStage.resist` 取单怪详情 child 的 `damage_type_resistance`，只留 `value > 0` 的项并格式化成 `20%`～`80%`（上游用负值表示「反而更脆」）。
- 首领取名（`stageDisplayNames()`）：`BossStage.name` 优先取**怪物 `icon` 指向的基础模型 id** 解析出的家族短名（`2024016`「弗有垂暮的不老仙」的 icon 是 `Monster_2024010` → 「丰饶玄鹿」），与 `getMonsterImageId()` 同源、不需要手抄名单；当期变体名放 `BossStage.variantName`。解析不到、与变体名相同、或命中 `"BOSS"` 占位时退回变体名再退回阶段名。`aa` 的 `plight` 直接复用 `checkmate` 的展示名加「（绝境）」，避免同一首领两处口径不一致。
- 场地 buff：`BossStage.mechanic`（单条赛季机制，可为 `null`）+ `BossStage.stageBuffs`（该阶段增益与词缀数组），由 `buildBuff()` / `buildBuffList()` 产出，**不再拼成一整段文本**。取数位置：`moc` 终层 `desc`+`param`（上游未公开 `maze_group_id` 的名字/描述，故上下半共用一条、名字兜底为「记忆迷阵」）；`pf` 顶层 `buff` + `option` + `sub_option`；`as` 顶层 `buff` + 该半区的 `buff_list1/2/3` 全量；`aa` 的 `boss_config.buff_list`（我方增益，在前）+ 对应层 `tag_list`（敌方词缀，在后）。
- `subtitle` 口径为 `"<模式> · <赛季名>"`（如「末日幻影 · 仙客天狼」），**不含阶段名**——阶段由徽标与 `runUtils.stageGroupOf()` 的分组标题表达。
- 阶段 id：`${seasonId}-${业务模式}-${stageKey}`，是 seed/库里记录 `bossId` 引用的稳定值。
- 数值口径：`HP = HPBase × child.HPModifyRatio × HardLevelGroup.HPRatio × (EliteGroup|InfiniteEliteGroup).HPRatio`，`MaxMonsterPhase > 1` 时展示值追加 ` x<阶段数>`（如 `800,000 x2`）；`PhaseList[].phase_max_hp_ratio` 互不相等时改走 `formatHp()` 按阶段列出（`400,000 / 500,000 / 400,000`），比例相等或没有 `PhaseList` 时仍是 `xN`。速度 = `SpeedBase × SpeedModifyRatio × HardLevelGroup.SpeedRatio` 保留 1 位小数；韧性 = `(StanceBase × StanceModifyRatio × HardLevelGroup.StanceRatio × 精英组.StanceRatio) ÷ 3`——**上游 stance 单位是游戏内展示韧性的 3 倍**（480 → 160）。两个 `*ModifyValue` 只在**单怪详情**里（`monstervalue.json` 的 child 只有 Ratio），所以 `buildStage` 会按首领粒度再拉一次 `hsr/<ver>/zh/monster/<基础id>.json`（`monsterDetailChildren()`，同基础 id 复用缓存、404 时只是不叠加修正值且抗性为空，不抛错）。`pf` 传 `skipHp`，血量不展示。`PhaseList` 与 `MaxMonsterPhase` 长度恒等，但 632 个怪物里 474 个不公开 `PhaseList`——**不能**把「没有 PhaseList」当成「单阶段」。
- `mergeStaticArchiveConfig()`：只把 `config.bosses` 中**不存在 id** 的生成阶段追加进去，并为缺失赛季补 `{ id, label: "<seasonId> 归档", isCurrent: seasonId === liveVersion }`。已有条目（含 seed/库中的历史阶段与赛季 label）**一律不覆盖**。快照为空或 `bosses` 为空时原样返回。
- 文本：名称类走 `cleanText()`（去富文本标签与 `#n[i]` 占位、把空白折叠成单个空格）；buff 文案走 `cleanBuffText()` + `applyBuffParams()`——先把 `#N[i]` 用同条目的 `param[N-1]` 代入（**占位后紧跟 `%` 时 ×100**，`0.3` → `30%`；其余去浮点尾零），再把上游以两字符存的字面量 `\n` 转成真实换行，交给 CSS `white-space: pre-line`。多语言取 `zh → en → ja → ko`。

## 成本与统计口径（`unitCost.ts` / `runUtils.ts`）

- `getCharacterGoldKind()`：只对 5 星角色生效；开拓者(含 `trailblazer`/`开拓者`)记 `free`；`STANDARD_FIVE_STAR_IDS/NAMES`（瓦尔特、姬子、布洛妮娅、杰帕德、克拉拉、彦卿、白露）记 `standard`；其余记 `limited`。新增常驻五星时同步这两个集合。
- `getLightconeGoldKind()`：只对 5 星光锥生效，返回 `limited | standard | none`。`STANDARD_FIVE_STAR_LIGHTCONE_IDS/NAMES`（银河铁道之夜、无可取代的东西、但战斗还未结束、以世界之名、制胜的瞬间、如泥酣眠、时节不居）记 `standard`——`sync:units` 按 id 前缀 `23` 推导 `limited`，会把这 7 把星琼商店常驻五星误标成限定，**不要**改成直接信任 `unit.limited`。7 把无名勋礼（BP）五星（`limited: false` 且 5 星）与 3/4 星都记 `none`。
- **成本公式**（与参考站口径一致）：`limited` = Σ(限定五星角色 `命座 + 1`) + Σ(限定五星光锥 `叠影`)；`standard` 同理累加常驻五星。低星角色、低星光锥、BP 光锥、开拓者一律 0。四人满配 = 48，与 `buildMetaStats()` 的 `33-48` 桶和 `COST_MAX` 对齐。
- `getUnitGoldCounts(entries, lightconeEntries, units)` 比旧版多一个光锥入参，角色与光锥按下标配对，命座/叠影越界时钳位到 `0–6` / `1–5`。`getRunGoldCounts(run, units)` 只是 `getUnitGoldCounts(run.units, run.lightcones, units)` 的薄封装。中文标签统一取 `goldKindLabels`，不要在组件里另写一份。
- `defaultEidolonFor(kind)` / `defaultSuperimpositionFor(kind)` 是投稿表单的默认值口径：低星与开拓者角色默认满命 `E6`（限定/常驻返回 `null` 表示保留用户选择），不计成本的光锥默认满叠影 `S5`、计入成本的默认 `S1`。
- `filterRuns()` 排序：`latest` 按 `submittedAt` 倒序；`limited` 先按限定成本再按轮次；默认按 `cycle ↑, score ↓, cost ↑`。
- `buildMetaStats()` 成本分桶固定为 `0-8 / 9-16 / 17-32 / 33-48`，使用率 = `count / runs.length`（百分比，保留 1 位）。改动分桶或使用率口径会同时影响前端与 `netlify/functions/_shared.ts` 的 `buildStats`，两处需保持一致。

## 区间筛选口径（`runUtils.ts` / `useArchiveFilters.ts` / `_shared.parseFilters`）

- `ArchiveFilters` 的成本与分数都是**可空端点** `costMin/costMax/scoreMin/scoreMax`，`null` 表示该侧不限；判断统一走 `matchesRange(value, min, max)`，成本与分数共用同一个函数。**没有** `cost: "all" | "0-8" | …` 这一档了。
- 筛选面板里的 `不限 / 0-8 / 9-16 / 17-32 / 33-48` 只是**写入这两个端点的 UI 预设**，不进筛选状态形状——同一口径不留两处真值。`buildMetaStats()` 的 `costBuckets` 是统计分桶，与筛选无关，仍然保留。
- 分数区间只在 `as`（末日幻影）出现：`score` 只有该模式有意义（`RunGroupList` 的 `showScore` 同一判定），上限取 `AS_MAX_SCORE`。
- 端点解析两侧各有一份同名宽松实现（前端 `readBound` + `readLegacyCostBucket`，服务端 `_shared` 里同样两个函数）：空串 / 非数字 / 负数一律视为不限，成本钳到 `COST_MAX`。改规则要两处同步。
- **旧深链 `?cost=17-32` 只在读取侧兼容**，映射成 `costMin=17&costMax=32`；写出侧统一用新参数。站内检索链接会被用户转发，静默丢掉成本筛选算行为回归。
- 不可能的区间（`min > max`）返回空集，不做静默放宽。
- 请求参数由 `archiveService.ts` 的 `appendRange()` 拼装：只有非 `null` 的一端才进 query，两端都不限时整个键缺席。

## 投稿校验与预览（`submissionValidation.ts`）

- 只服务前端向导（`SubmitRunForm.vue` / `SubmitRunDialog.vue`），**不被 Netlify Function 引用**，因此可以用 `@/` 别名。服务端字段级校验仍看 `netlify/functions/_shared.ts` 的 `validateSubmission()`。
- `validateSubmissionForm(form, config, options?)` 返回**有序** `{ field, message }` 列表：列表顺序就是错误汇总条与字段提示的展示顺序，新增规则时按「赛季/模式/阶段/分类 → 作者/视频 → 队伍 → 数值」插到对应位置。`options.duplicateVideoUrl` 是唯一的**外部判定**：表单先调 `checkDuplicateVideo()`，命中后把 `videoUrl.ts` 的 `DUPLICATE_VIDEO_MESSAGE` 落到 `videoUrl` 字段上，于是「挡住下一步」「提交前跳回出错步骤」沿用既有的步骤归属机制，不必新增分支。
- 步骤归属由 `submissionStepFields` 决定（`basic` / `team` / `result`），`errorsOfStep()` 判断能否进入下一步、`stepOfField()` 在提交失败时把用户跳回第一步出错的那个环节；新增字段必须同时登记归属，否则该字段的错误不会被任何步骤拦下。
- 新建投稿的默认落点：模式取 `runUtils.defaultModeOf(config.modes)`（带 `NEW` 徽标的那个，与工作台同一口径），成绩取 `defaultResultFor(mode, bossId)`——该模式与阶段的最后一档（满星 / 绝境满星 / `4000` 满分），末日幻影以满分 `AS_MAX_SCORE` 起稿，否则默认分数 `40000` 会撞上「末日幻影分数最高 4000」。`SubmitRunForm.vue` 的 `createForm()` 只用这两个函数，不要再抄默认值。
- 数值用 `toInteger()` 宽松解析（`v-model.number` 在清空时会留下 `""`）；`COST_MIN/COST_MAX`（0–48）现在定义在 `unitCost.ts`（服务端 `parseFilters` 也要它来钳筛选区间），与 `buildMetaStats()` 的 `33-48` 桶对齐，改上限要同时改分桶口径。
- 视频链接必须是 B 站或 YouTube（`isUsableVideoUrl()` 用域名白名单 `bilibili.com`/`b23.tv`/`youtube.com`/`youtube-nocookie.com`/`youtu.be`，按 `host === 域名 || host.endsWith("." + 域名)` 匹配子域，能挡 `bilibili.com.evil.com` 这类伪装后缀）；命途与角色不匹配**不是错误**，只在槽位上给「命途不同」提示。
- 「同一支视频」的口径只在 `videoUrl.ts` 里定义（BV 号 / YouTube id / 规范化 URL），服务端 `findDuplicateVideoRecords` 与表单预检共用，本文件不重复实现。
- 分类必须是当前模式与阶段的合法取值（`validateSubmissionForm` 直接取 `categoryOptionsFor(form.mode, form.bossId)`），否则报「当前模式与敌方阶段没有该分类」；`zeroCycle`/`plightZeroCycle` 还要求 `cycle === 0`，`as` 模式额外限制 `score <= AS_MAX_SCORE`(4000)。
- 预览取数：`describeSubmissionTarget()` 把 season/mode/stage/category 的 id 翻成配置里的 label，`buildSubmissionRoster()` 输出每槽角色命座、光锥叠影、金币分类与命途是否错位，单位缺失时用「未选择 / 未搭配」占位。
- 成本默认由表单按 `getUnitGoldCounts()` 自动合计回填，用户手改后表单记 `costTouched` 不再覆盖（可点「按队伍重算」交还）；校验仍只做 `COST_MIN–COST_MAX` 的范围检查，**不**要求等于自动值，服务端 `validateSubmission()` 也不校验成本与队伍是否一致——特殊阵容允许人工修正。

## 投稿自动搭配（`submissionUtils.ts` + `src/data/signatureLightcones.ts`）

- `buildSuggestedLightconeByCharacter(runs, units)` 是投稿弹窗建议光锥的唯一入口：先按同槽位共现次数统计站内记录（`buildPreferredLightconeByCharacter`），再用专武表覆盖，最后过滤掉单位库里不存在的光锥 id。
- 专武表来自 `src/data/seed/lightcone-pairs.json`（`pnpm sync:units` 生成，取上游 `zh/character/<sourceId>.json` 的 `lightcones[0]`），只覆盖五星限定角色；低星角色与开拓者交给记录统计填空。
- 该 JSON **是运行时 import 的**（与 `hsr-units.json` / `hsr-monsters.json` 只作脚本产物不同），因为它要在用户选角色时同步查表。
- 上游数据没有角色↔光锥的关联字段，专武只能靠这份表；新角色上线后重跑 `pnpm sync:units` 即可，`tests/signatureLightcones.test.ts` 会守住覆盖率与命途一致性。

## 分类口径（`runUtils.ts`）

- `categoryLabels` 与 `categoryOptionsFor(mode, bossId)` 是全站唯一来源：主页分类筛选、投稿向导、审核台回显都用它，不要再抄一份常量。
- `categoryOptionsFor`：`as` → 四档 `asScore*`；`aa` 且 `stageKeyOf(bossId) === "plight"` → `plightZeroCycle` / `plightFullStars`；其余 → `zeroCycle` / `fullStars`。阶段键从 id 末段解析（`stageKeyOf`），与阶段 id 规则同源。
- `categoryOfAsScore(score)`：只在 `[min,max]` 命中时返回档位，**边界归高一档**（3650 → `asScore3650`），3900-3999 与 3400 以下返回 `null` 表示不单独归档；投稿里用它自动带入分类，用户手选过后（`categoryTouched`）不再覆盖。

## 标记口径（`runUtils.ts`）

- `RunFlag = revive | firewall | bpWeapon`（复活 / 火墙 / 大月卡武器），`flagOrder` 与 `flagLabels` 是全站唯一来源，筛选面板、投稿表单与记录徽标都用它；组件不要再抄一份候选列表。
- 标记**投稿时手动勾选**，落库复用 `runs.tags`（开放 jsonb 数组，加取值不需要迁移）。读取用 `flagsOfRun(run)` 收窄——它顺带过滤掉历史上作为自由文本写进 tags 的中文值，并按 `flagOrder` 归一顺序。
- 筛选是 **AND 语义**：勾选的标记全部命中才保留。前端 `filterRuns()` 与 `netlify/functions/_shared.ts` 的 `filterArchiveRuns()` 各有一份实现，改语义要两处同步。
- URL 深链里的非法标记由 `useArchiveFilters` 的 `normalizeFlags()` 丢弃（标记不随模式/阶段变化，所以是丢弃而非回落）。
- 标记图标不在本层：地址在 `src/data/flagIcons.ts`（`FLAG_ICON_SOURCES`），渲染统一走 `src/components/FlagIcon.vue`，远程图加载失败自动回落 lucide。筛选面板、投稿表单、记录徽标、审核台**四处都只用它**，组件不要再自己引 `lucide` 图标或抄一份映射。

## 阶段分组口径（`runUtils.ts`）

- `stageGroupOf(boss)` → `boss`（首领关）/ `knight`（骑士关）/ `checkmate`（将杀关）：`aa` 且阶段键以 `k` 开头归骑士关，`aa` 且为 `checkmate`/`plight` 归将杀关（绝境与将杀同组），其余一律首领关。`stageGroupOrder` / `stageGroupLabels` 给渲染顺序与中文标题。
- `isStarwardStage(boss)` 判定第 3 阶段（星启）：它的血量约为普通半区的 2–5 倍，UI 用独立的金色徽标而不是普通阶段徽标样式。

## 配置读取链路（`archiveService.fetchArchiveConfig`）

`fetchArchiveConfig()` = `requestJson("/api/archive/config", () => seedConfig)` 再 `mergeStaticArchiveConfig(config, await fetchStaticArchiveSnapshot())`。也就是说**服务端返回的配置还会被前端二次补全**，`archive-config.ts` 里没有远程静态数据逻辑。排查“页面少了某个赛季/阶段”时先看这里，而不是先查 DB。

`fetchRuns` / `fetchMetaStats` 只走业务数据；`submitRun` 与两个管理端接口**不回退 seed**，失败直接抛错由调用方提示。`submitRun` 会读取失败响应的 `{ message, missing }`，用 `submissionFieldLabels` 把 `missing` 里的字段名翻成中文后抛错（响应体不是 JSON 时退回通用文案），投稿向导据此显示行内提示。

## 图片寻址（`dataSource.ts`）

- `IMAGE_BASES` 只有四类：`monster`（monstermiddleicon）、`character`（avatarshopicon）、`lightcone`（lightconemediumicon）、`path`（pathicon）。
- `monsterImageUrl(id)`：9 位实例 id（`>= 1e8`）先 `/100` 回退到基础 id，再按命名规则向下对齐到整十。
- 单位图经 `data/unitAssets.ts`（用 `config.json` 的 `sourceId` 映射）；命途图经 `data/unitPaths.ts`。不要把数据源 JSON 或图片下载到 `public/` 发布（`public/` 当前只有 `favicon.png`）。
- `data/seed/hsr-units.json`、`hsr-monsters.json` 只由 `scripts/` 同步脚本写出，运行时不 import；运行时单位图完全依赖 `config.json` 的 `units[].sourceId`。
- **两处例外图源**：标记图标在 `data/flagIcons.ts`（`FLAG_ICON_SOURCES`，三条指向 `theherta.com/skill_icons/` 的热链）；属性（弱点 / 抗性）图标在 `data/elementIcons.ts`（`ELEMENT_ICON_SOURCES`，七条指向 `theherta.com/elements/` 的热链，注意雷是 `lightning.png`）。`static.nanoka.cc` 既不发布技能图标也不发布属性图标目录，所以这两批地址**不进 `IMAGE_BASES`**——别并进来，那会让它们被误读成统一图源的一部分。授权与回落约定见根 `AGENTS.md`「资源与授权」。

## 约束

- 这里的函数尽量保持**纯函数 + 显式入参**，方便在 `tests/` 直接断言。
- 修改筛选/排序/统计/投稿转换或远程解析逻辑时，必须补 `tests/` 用例或最小验证说明，并确认静态读取失败时 seed/API fallback 仍可用。
- 不要在这一层引用 Vue（保持框架无关），`Vue` 相关状态留给 `composables/`。
