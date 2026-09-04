# AGENTS.md — `src/`（前端应用）

本目录是竞速档案站的 Vue 3 前端。整体约定继承根级 [../AGENTS.md](../AGENTS.md)，这里只补充在 `src/` 内工作时需要的局部信息。

> 改动本目录后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」同步更新本文件（模块地图、路由、seed 现状）与 `README.md` 的项目结构，**同一提交内完成**。

## 一句话定位

档案工作台是核心：`ArchiveView` 组合筛选状态 → 请求记录/统计 → 分组渲染。组件只负责组合状态与渲染，业务逻辑放在 `services/` 与 `composables/`。

## 模块地图

| 目录 / 文件                | 职责                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `App.vue` / `main.ts`      | 应用外壳、导航、全局投稿弹窗与挂载（Pinia + Router）                                           |
| `router/index.ts`          | 路由，懒加载除首页外的所有页面                                                                 |
| `views/`                   | 页面级组件（见下）                                                                             |
| `components/archive/`      | 档案工作台业务组件，含 `SubmitRunDialog.vue`（投稿弹窗外壳）与 `SubmitRunForm.vue`（三步向导） |
| `components/FlagIcon.vue` | 标记图标的唯一渲染出口：热链游戏图标，加载失败自动回落 lucide（筛选面板 / 投稿表单 / 记录徽标 / 审核台四处共用）              |
| `components/ArticleImage.vue` | 微信文章配图的唯一渲染出口：`referrerpolicy="no-referrer"` + 防盗链占位图尺寸自检 + 加载失败回落占位块 |
| `components/admin/`       | 投稿审核台组件（登录弹框、审核卡片）                                                                           |
| `components/PromoSlot.vue`| 站务推广位（`App.vue` 内使用）                                                                                 |
| `composables/`            | 可复用状态逻辑（筛选、查询、统计、审核会话、投稿弹窗开关）                                                     |
| `services/`               | 数据访问与纯函数层，见 [services/AGENTS.md](services/AGENTS.md)                                                |
| `stores/archiveStore.ts`  | Pinia store，缓存 `ArchiveConfig` + 投稿自动搭配用的记录样本 `pairingRuns`                                     |
| `types/archive.ts`        | 所有 `Archive*` 类型定义（唯一来源）                                                                           |
| `data/`                   | seed 数据、图片/命途映射（`unitAssets.ts` / `unitPaths.ts`）、标记图标地址（`flagIcons.ts`）、专武映射（`signatureLightcones.ts`）、文章模块（`articles.ts` + 产物 `articles.json`）与站点更新记录（`changelog.ts`） |
| `assets/`                  | `main.css`、`redesign.css` 全局样式                                                            |

## 路由与视图

`router/index.ts` 当前注册 8 条路由：`/`(archive)、`/submit`、`/me`（我的投稿，按本机 token 反查）、`/admin/submissions`、`/articles`、`/articles/:id`（文章详情）、`/faq`、`/changelog`（更新记录）。首页 `ArchiveView` 同步引入，其余懒加载。`views/` 与这 8 条路由一一对应，没有额外未注册的视图文件。导航在 `App.vue` 注册："档案 / 文章 / 规则 / **更新** / 我的投稿 / 审核"，头部 `brand-appver` 徽章显示 `src/data/changelog.ts` 的 `appVersion` 并链接到更新记录页。

投稿面板不是独立页面：`SubmitRunDialog.vue` 由 `App.vue` 常驻渲染，头部「提交记录」按钮和工作台工具栏按钮都调用 `useSubmissionDialog().open()`；`/submit` 深链保留，`SubmitView.vue` 只负责打开同一弹窗后 `router.replace("/")`，因此路由结构未变。`/me` 直接是页面，没有弹窗化。

## 类型与数据流约定

- 所有领域类型集中在 `types/archive.ts`（`ArchiveConfig`、`ArchiveRun`、`BossStage`、`ArchiveFilters`、`MetaStats`、`SubmissionPayload`、`DuplicateVideoMatch` 等）。新增字段先改类型，再顺着 `services → composables → views` 传递，不要在组件里散落重复结构。
- 业务终局模式 `EndgameMode = "moc" | "pf" | "as" | "aa"`（混沌回忆 / 虚构叙事 / 末日幻影 / 异相仲裁），label 来自 `data/seed/config.json` 的 `modes`，与 `services/staticArchiveConfig.ts` 的 `modeLabelByStaticMode` 保持一致——改模式名要同时改这两处。与远程静态数据源的模式映射（`moc/fiction/doom/peak`）见 `services/staticArchiveConfig.ts`，不要混淆。
- `RunCategory` 的取值随模式与敌方阶段变化（`as` 是四档分数区间、`aa` 的绝境阶段单独归档）。组件与 composable **不要自己列分类**，一律取 `services/runUtils.ts` 的 `categoryOptionsFor(mode, bossId)` 与 `categoryLabels`；库里 `category` 是开放 text，加取值不需要迁移。
- `RunFlag`（`revive` / `firewall` / `bpWeapon`）同理：标记候选与中文文案一律取 `runUtils.ts` 的 `flagOrder` / `flagLabels`，读取记录上的标记用 `flagsOfRun(run)`，图标只用 `components/FlagIcon.vue`；敌方阶段的检索分组标题与星启判定用 `stageGroupOf` / `stageGroupLabels` / `isStarwardStage`，组件不要自己从阶段 id 里解析。
- `ArchiveFilters` 的成本与分数都是**可空区间端点**（`costMin` / `costMax` / `scoreMin` / `scoreMax`，`null` = 该侧不限），组件与 composable 不要再假设成本是 `"0-8"` 这类枚举桶；面板上的四个成本档位只是写端点的 UI 预设。口径见 [services/AGENTS.md](services/AGENTS.md)「区间筛选口径」。
- 数据入口统一走 `services/archiveService.ts`；它负责在 API 失败时回退到 `data/seed`。**不要**在组件里直接 `fetch` 业务 API。
- 图片一律通过 `services/dataSource.ts` 的 `IMAGE_BASES` / `monsterImageUrl()` 或 `data/unitAssets.ts` 的 `getUnitImageSrc()` 生成，直连 `static.nanoka.cc`，不要引用本地副本。**唯一例外是标记图标**：地址在 `data/flagIcons.ts`，热链第三方站点，加载失败由 `components/FlagIcon.vue` 回落 lucide——授权与为什么不进 `IMAGE_BASES`，见根 [AGENTS.md](../AGENTS.md)「资源与授权」。

## 状态管理

- 全局配置缓存用 `useArchiveStore()`（`loadConfig()` 幂等，配置只加载一次）；它另外持有 `pairingRuns` + `recordPairingRuns()`，跨筛选累积记录样本，供投稿弹窗统计「角色→高频光锥」。
- 页面级临时状态用 `composables/`：
  - `useArchiveFilters(config)`：筛选状态 + 与路由 query 双向同步（`hydrateFromQuery` / `watch` 回写），其中 `normalizeCategory()` 负责把与当前模式/阶段不匹配的分类回落为 `all`，`normalizeFlags()` 负责丢弃 URL 里非法的标记值；URL 缺省或非法的 `mode` 回落到 `runUtils.defaultModeOf(config.modes)`（带 `NEW` 徽标的那个），组件与 composable 都不要写死 `"moc"`；成本与分数区间四个端点只在非 `null` 时进 query，`readBound()` 把空值/非法值视为不限，`readLegacyCostBucket()` 让旧 `?cost=17-32` 深链仍解得出等价端点。
  - `useRunsQuery(filters)`：记录请求、加载态、按 `teamName` 分组；每次成功拉取都会把结果登记进 `archiveStore.pairingRuns`。
  - `useMetaStats(filters)`：环境统计。
  - `useAdminSubmissions()`：审核台会话（`sessionStorage` 持久化）、列表与审核动作。
  - `useSubmissionDialog()`：投稿弹窗开关，状态是模块级 `shallowRef` 单例，供 `App.vue`、`ArchiveWorkbench.vue` 与 `SubmitView.vue` 共享。
  - `useSubmissionDraft()`：投稿草稿写入 `localStorage`（键 `hsr-archive.submission-draft.v2`，含表单与步骤位置），变更后 400ms 防抖、空表单不写；只有提交成功或用户点「丢弃草稿」才清除，payload 形状变化时换键名而不是写迁移。
  - `useSubmissionMemory()`：作者名 + 配队预设 + 投稿 token 的本机记忆（`localStorage` 键 `hsr-archive.submission-memory.v1`），同键存 `author / presets(最多 3 套) / tokens(最多 50 个 own_xxx)`。配队预设是手动「另存为」+「载入」；token 由 `SubmitRunForm` 提交成功后写入，被 `/me` 页面用做反查与撤回的身份凭证。
- 大对象优先 `shallowRef`，避免深层响应式开销（现有代码已如此，保持一致）。

## 组件实现约定

- 新增 Vue 一律用 Composition API + `<script setup lang="ts">`。
- 图标优先通过 `lucide-vue-next` 引入，不手写 SVG。**例外**：三个终局标记（复活 / 火墙 / 大月卡武器）一律用 `components/FlagIcon.vue`，它内部已含热链远程图标与 lucide 回落；组件不要再自己写 `flagIcons` 映射。
- 筛选/排序/统计逻辑放 `services/runUtils.ts` 或 composable，组件不写业务计算；投稿的字段校验、步骤归属与预览取数在 `services/submissionValidation.ts`，成本合计与默认命座/叠影口径在 `services/unitCost.ts`，`SubmitRunForm.vue` 只保留“是否展示错误 / 当前步骤 / 成本是否被手改（`costTouched`）、视频链接查重是否命中（`duplicateMatches`）”这类 UI 状态。
- 弹层沿用同一套结构：`Teleport to="body"` + `.modal-backdrop` + `role="dialog" aria-modal="true" aria-labelledby`，打开时给 `body` 加 `is-modal-open` 锁滚动、支持 Esc 与遮罩点击关闭、关闭后把焦点还给触发元素（见 `admin/AdminLoginDialog.vue`、`archive/SubmitRunDialog.vue`）。
- 保持工作台风格：高信息密度、清晰分组、按钮带图标、移动端不横向溢出。

## 本地数据与图片

- `data/seed/`：`index.ts` 只导出 `seedConfig`（`config.json`）与 `seedRuns`（`runs.json`）。当前 `config.json` 的 `bosses` 与 `runs.json` 都是空数组——敌方阶段全部来自 `services/staticArchiveConfig.ts` 的远程快照，公开记录依赖数据库或审核 fallback 文件。
- `data/seed/hsr-units.json`、`hsr-monsters.json`：`pnpm sync:units` / `pnpm sync:monsters` 的产物，**运行时不 import**，仅供人工比对与后续同步。
- `data/seed/lightcone-pairs.json`：同样是 `pnpm sync:units` 的产物（角色 id -> 专武 id），但**会被 `data/signatureLightcones.ts` 运行时 import**——投稿表单要在选角色时同步查表。
- `data/unitAssets.ts`：用 `config.json` 的 `sourceId` 把本地 slug id 映射为远程图片 `sourceId`。
- `data/unitPaths.ts`：命途图标选项（`IMAGE_BASES.path`，9 个命途）。
- `data/articles.ts` + `data/articles.json`：文章模块。`articles.json` 是 `pnpm sync:articles` 的产物（**运行时 import**），`articles.ts` 是首页速报与 `/articles*` 的唯一取数入口（`siteArticles` / `dispatchArticles` / `articleById` / `groupedArticles` / `articleCover` / `SERIES_CATEGORY` / `matchBossIds` / `versionLabelOf` / `splitByVersion`）。`matchBossIds(subject, bosses)` 拿标题里提取的首领名去撞 `BossStage.name` 与 `variantName`，**只出候选**：构建期没有本地首领清单（阶段来自远程快照），所以候选不落 `articles.json`，在运行时算。配图热链 `mmbiz.qpic.cn`，只能经 `components/ArticleImage.vue` 渲染（`no-referrer`），不要落盘到 `public/`。人工文案与 boss 关联改 `scripts/article-sources.json`，不要直接改产物。
- `public/`：当前只有 `favicon.png`。所有游戏数据与图片都直连远程，**不要**把数据源 JSON 或图片落盘到 `public/`。

## 验证

改动本目录后按需运行（根目录）：

```bash
pnpm typecheck   # vue-tsc --noEmit
pnpm lint        # eslint .
pnpm test:unit   # vitest run
pnpm build       # run-p 并行执行 typecheck / test:unit / lint / vite build
```

页面效果用 `pnpm dev` 打开 `http://localhost:32200/` 验证。`@` 别名指向 `src/`（见 `vite.config.ts`）。
