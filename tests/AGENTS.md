# AGENTS.md — `tests/`（单元测试）

框架为 **Vitest + Vue Test Utils + jsdom**，配置内联在根 `vite.config.ts`（`environment: "jsdom"`、`globals: true`）。命令：`pnpm test:unit`（`vitest run`），可用 `--` 过滤，如 `pnpm test:unit -- tests/runUtils.test.ts`。

> 改动本目录或新增测试后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」同步更新本文件（覆盖表）；若测试断言的是数据口径（赛季 id、HP 展示等），根 `AGENTS.md` 的「静态数据维护约束」与 `src/services/AGENTS.md` 也要一起改，**同一提交内完成**。

## 现有覆盖

| 文件 | 目标 |
| --- | --- |
| `runUtils.test.ts` | `src/services/runUtils.ts` 筛选/排序/统计纯函数与分类、标记、阶段分组口径（`categoryOptionsFor` / `categoryOfAsScore` / `defaultModeOf`（默认模式取带 `NEW` 徽标的那个，无徽标退回第一个、空退回 `moc`）/ `stageKeyOf` / `flagLabels`+`flagsOfRun`+`isRunFlag` / `stageGroupOf` / `isStarwardStage`）、按成本口径的 `getRunGoldCounts`；另守**成本/分数区间**（`matchesRange` 单侧不限、不可能区间为空集）、前后端 `matchesRange` 同口径、服务端 `parseFilters` 的区间解析与旧 `?cost=17-32` 深链等价 |
| `unitCost.test.ts` | 成本口径唯一守卫：光锥限定/常驻/不计成本分档、`defaultEidolonFor`/`defaultSuperimpositionFor`、角色 `命座+1` 与光锥 `叠影` 累加、四人满配 48、越界钳位与未知 id 兜底 |
| `signatureLightcones.test.ts` | 专武映射防表腐化：键必须是五星限定角色、值必须是同命途五星光锥、覆盖率必须等于五星限定角色集合（新角色未跑 `pnpm sync:units` 会失败）、专武不被两个角色共用 |
| `staticArchiveConfig.test.ts` | 远程静态快照推导与配置合并（`staticArchiveConfig.ts` + `staticBossSnapshot.ts`）：阶段 id 列表、HP/速度/韧性、场地 buff 结构化（`mechanic` / `stageBuffs`）与 `#N[i]`→`param` 代入、按 icon 解析的家族短名与 `variantName`、subtitle 口径、远程失败返回 `null` |
| `submissionUtils.test.ts` | 投稿 → 档案记录转换、光锥偏好统计、建议表优先级（专武覆盖统计、统计填空、过滤单位库外 id） |
| `submissionValidation.test.ts` | 投稿字段校验顺序、步骤归属、视频域名白名单、查重命中挡住第一步、分类与模式/阶段匹配、`defaultResultFor` 的默认分类/分数合法、限定/常驻统计与预览取数 |
| `archiveService.test.ts` | `submitRun` 的成功返回与服务端 `{ message, missing }` → 中文错误映射；`checkDuplicateVideo` 命中查询与失败/非 2xx/形状不合时一律放行；409 抛 `SubmissionDuplicateError` |
| `changelog.test.ts` | `src/data/changelog.ts` 版本号/日期格式、条目唯一性与新到旧排序、`appVersion` 与 tag 标签口径 |
| `weixinArticle.test.ts` | `scripts/lib/parse-weixin-article.mjs` 的微信文章页解析口径：从 JS 字面量（不是 JSON）取标题/封面/链接/公众号名、正文 `data-src` 按序去重并还原 `&amp;`、排除平台图与 `js_content` 之后的页脚图、`create_time` 按**北京时间**换日期、单双引号与缺字段变体、被删/非文章页返回 `null`；`isSeriesTitle` / `categoryFromTitle` 的**「强敌…侦察」判据**（「强敌」与「侦察」之间可插字，实测有「强敌泰坦侦察笔记」；含笔记 / 狸记两种栏目名与带书名号前缀）与 `articleSubject` 首领名提取（全角半角竖线、冒号、破折号、无分隔符、只有栏目名返回 `null`）；`fetchWeixinArticle` **不发送 Referer**、非 2xx 抛错而不是产出半条记录。夹具 `fixtures/weixin-article.html` 经 `?raw` 引入——jsdom 下 `import.meta.url` 不是 `file:`，`readFileSync(new URL(...))` 会抛「The URL must be of scheme file」 |
| `articlesData.test.ts` | `src/data/articles.ts`：`matchBossIds` 的包含式撞名（家族名与 `variantName` 都能命中、书名号与间隔号等装饰符不参与比对、站内没有的首领不误撞）、`versionLabelOf` / `splitByVersion` 的版本分段与年份兜底、`dispatchArticles` 在无人工 `featured` 时置顶最新一篇强敌笔记，并守住产物按 `publishedAt` 新→旧排序 |
| `useSubmissionDraft.test.ts` | 投稿草稿的防抖写入、空表单不覆盖、`discard`、脏数据读取容错 |
| `videoUrl.test.ts` | 「同一支视频」口径：BV 号 / YouTube id 的各种粘贴变体折叠、伪装域名与非视频页返回 `null`、`b23.tv` 短链退回规范化 URL、`videoMatchPattern` 转义与字母数字边界断言 |
| `duplicateVideo.test.ts` | `findDuplicateVideoRecords` 无库 fallback：按「视频 + 阶段」命中待审/已通过、驳回与撤回放行、投稿与档案按 id 去重、最多回显 3 条、缺阶段或非法链接直接放行 |
| `adminAuth.test.ts` | `netlify/functions/_shared.ts` 的 `requireAdmin`（Bearer/Basic/未配置） |
| `RunGroupList.test.ts` / `SubmitRunForm.test.ts` / `UnitPickerDrawer.test.ts` | 关键档案组件的挂载与交互；`RunGroupList.test.ts` 的图片数**只数 `.unit-chip img`**（标记徽标现在各带一枚 `.flag-icon`，混在一起数会随标记条数漂移），并断言徽标同时渲染出图标与中文文案；`SubmitRunForm.test.ts` 覆盖三步向导解锁/回退/预览、**默认落在带 `NEW` 徽标的模式**（末日幻影 + 首个阶段 + `4000` 满分档，能一路走到第三步）、分类随模式与阶段联动、as 自动归档、选角色带专武与默认 E/S、成本自动填充/手改保护/一键重算、草稿恢复与提交后清除、视频链接自动查重（命中挡住第一步、换阶段/改链接放行、409 回填摘要）。默认模式已不是混沌回忆，按混沌回忆取证的用例统一先用 `pickMode(wrapper, "moc")` 切回去 |
| `fixtures/runs.ts` | 共享 `ArchiveRun` 夹具（`fixtureRuns`），新用例优先复用 |
| `fixtures/config.ts` | 带 moc/aa 绝境/as 阶段的 `fixtureConfig` 与可通过校验的 `fixtureSubmission()` |

## 约定

- **纯函数优先直接断言**（`services/`、`_shared.ts`），不需要挂载组件。
- 组件测试用 `@vue/test-utils` 的 `mount`，传真实 `seedConfig.units` 与 `fixtureRuns`，断言渲染文本/元素而非实现细节。
- 涉及环境变量的用例（如 `adminAuth.test.ts`）要在 `afterEach` 里**还原/删除** `process.env`，避免污染其他用例。
- 远程依赖用 `vi.mock`/stub 隔离，测试不应真实请求 `static.nanoka.cc`。
- 路径别名：测试里用 `@/` 引用 `src/`（Vite 已配置），但引用 `netlify/functions/*` 时用相对路径。

## 何时必须补测试

改动以下内容时，需新增或更新用例（根 [../AGENTS.md](../AGENTS.md) 的“验证口径”也要求如此）：

- 筛选、排序、统计、成本分桶口径（`runUtils` / `_shared.buildStats` 两处同步）。
- 投稿表单校验、投稿→档案转换、审核流转。
- 远程静态数据解析/合并（赛季推导、敌方阶段、怪物图片回退）。
- 任何改变 API 返回 shape 的 Functions 改动。
