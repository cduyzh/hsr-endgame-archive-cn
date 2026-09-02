# AGENTS.md — `src/`（前端应用）

本目录是竞速档案站的 Vue 3 前端。整体约定继承根级 [../AGENTS.md](../AGENTS.md)，这里只补充在 `src/` 内工作时需要的局部信息。

> 改动本目录后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」同步更新本文件（模块地图、路由、seed 现状）与 `README.md` 的项目结构，**同一提交内完成**。

## 一句话定位

档案工作台是核心：`ArchiveView` 组合筛选状态 → 请求记录/统计 → 分组渲染。组件只负责组合状态与渲染，业务逻辑放在 `services/` 与 `composables/`。

## 模块地图

| 目录 / 文件                | 职责                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `App.vue` / `main.ts`      | 应用外壳、导航、全局投稿弹窗与挂载（Pinia + Router）             |
| `router/index.ts`          | 路由，懒加载除首页外的所有页面                                  |
| `views/`                   | 页面级组件（见下）                                              |
| `components/archive/`      | 档案工作台业务组件，含 `SubmitRunDialog.vue`（投稿弹窗外壳）与 `SubmitRunForm.vue`（三步向导） |
| `components/admin/`        | 投稿审核台组件（登录弹框、审核卡片）                            |
| `components/PromoSlot.vue` | 站务推广位（`App.vue` 内使用）                                  |
| `composables/`             | 可复用状态逻辑（筛选、查询、统计、审核会话、投稿弹窗开关）      |
| `services/`                | 数据访问与纯函数层，见 [services/AGENTS.md](services/AGENTS.md) |
| `stores/archiveStore.ts`   | Pinia store，缓存 `ArchiveConfig`                               |
| `types/archive.ts`         | 所有 `Archive*` 类型定义（唯一来源）                            |
| `data/`                    | seed 数据与图片/命途映射                                        |
| `assets/`                  | `main.css`、`redesign.css` 全局样式                             |

## 路由与视图

`router/index.ts` 当前注册 5 条路由：`/`(archive)、`/submit`、`/admin/submissions`、`/articles`、`/faq`。首页 `ArchiveView` 同步引入，其余懒加载。`views/` 与这 5 条路由一一对应，没有额外未注册的视图文件。

投稿面板不是独立页面：`SubmitRunDialog.vue` 由 `App.vue` 常驻渲染，头部「提交记录」按钮和工作台工具栏按钮都调用 `useSubmissionDialog().open()`；`/submit` 深链保留，`SubmitView.vue` 只负责打开同一弹窗后 `router.replace("/")`，因此路由结构未变。

## 类型与数据流约定

- 所有领域类型集中在 `types/archive.ts`（`ArchiveConfig`、`ArchiveRun`、`BossStage`、`ArchiveFilters`、`MetaStats`、`SubmissionPayload` 等）。新增字段先改类型，再顺着 `services → composables → views` 传递，不要在组件里散落重复结构。
- 业务终局模式 `EndgameMode = "moc" | "pf" | "as" | "aa"`（混沌回忆 / 虚构叙事 / 末日幻影 / 异相仲裁），label 来自 `data/seed/config.json` 的 `modes`，与 `services/staticArchiveConfig.ts` 的 `modeLabelByStaticMode` 保持一致——改模式名要同时改这两处。与远程静态数据源的模式映射（`moc/fiction/doom/peak`）见 `services/staticArchiveConfig.ts`，不要混淆。
- `RunCategory` 的取值随模式与敌方阶段变化（`as` 是四档分数区间、`aa` 的绝境阶段单独归档）。组件与 composable **不要自己列分类**，一律取 `services/runUtils.ts` 的 `categoryOptionsFor(mode, bossId)` 与 `categoryLabels`；库里 `category` 是开放 text，加取值不需要迁移。
- 数据入口统一走 `services/archiveService.ts`；它负责在 API 失败时回退到 `data/seed`。**不要**在组件里直接 `fetch` 业务 API。
- 图片一律通过 `services/dataSource.ts` 的 `IMAGE_BASES` / `monsterImageUrl()` 或 `data/unitAssets.ts` 的 `getUnitImageSrc()` 生成，直连 `static.nanoka.cc`，不要引用本地副本。

## 状态管理

- 全局配置缓存用 `useArchiveStore()`（`loadConfig()` 幂等，配置只加载一次）。
- 页面级临时状态用 `composables/`：
  - `useArchiveFilters(config)`：筛选状态 + 与路由 query 双向同步（`hydrateFromQuery` / `watch` 回写），其中 `normalizeCategory()` 负责把与当前模式/阶段不匹配的分类回落为 `all`。
  - `useRunsQuery(filters)`：记录请求、加载态、按 `teamName` 分组。
  - `useMetaStats(filters)`：环境统计。
  - `useAdminSubmissions()`：审核台会话（`sessionStorage` 持久化）、列表与审核动作。
  - `useSubmissionDialog()`：投稿弹窗开关，状态是模块级 `shallowRef` 单例，供 `App.vue`、`ArchiveWorkbench.vue` 与 `SubmitView.vue` 共享。
  - `useSubmissionDraft()`：投稿草稿写入 `localStorage`（键 `hsr-archive.submission-draft.v1`，含表单与步骤位置），变更后 400ms 防抖、空表单不写；只有提交成功或用户点「丢弃草稿」才清除，payload 形状变化时换键名而不是写迁移。
- 大对象优先 `shallowRef`，避免深层响应式开销（现有代码已如此，保持一致）。

## 组件实现约定

- 新增 Vue 一律用 Composition API + `<script setup lang="ts">`。
- 图标只通过 `lucide-vue-next` 引入，不手写 SVG。
- 筛选/排序/统计逻辑放 `services/runUtils.ts` 或 composable，组件不写业务计算；投稿的字段校验、步骤归属、限定/常驻统计与预览取数都在 `services/submissionValidation.ts`，`SubmitRunForm.vue` 只保留“是否展示错误 / 当前步骤”这类 UI 状态。
- 弹层沿用同一套结构：`Teleport to="body"` + `.modal-backdrop` + `role="dialog" aria-modal="true" aria-labelledby`，打开时给 `body` 加 `is-modal-open` 锁滚动、支持 Esc 与遮罩点击关闭、关闭后把焦点还给触发元素（见 `admin/AdminLoginDialog.vue`、`archive/SubmitRunDialog.vue`）。
- 保持工作台风格：高信息密度、清晰分组、按钮带图标、移动端不横向溢出。

## 本地数据与图片

- `data/seed/`：`index.ts` 只导出 `seedConfig`（`config.json`）与 `seedRuns`（`runs.json`）。当前 `config.json` 的 `bosses` 与 `runs.json` 都是空数组——敌方阶段全部来自 `services/staticArchiveConfig.ts` 的远程快照，公开记录依赖数据库或审核 fallback 文件。
- `data/seed/hsr-units.json`、`hsr-monsters.json`：`pnpm sync:units` / `pnpm sync:monsters` 的产物，**运行时不 import**，仅供人工比对与后续同步。
- `data/unitAssets.ts`：用 `config.json` 的 `sourceId` 把本地 slug id 映射为远程图片 `sourceId`。
- `data/unitPaths.ts`：命途图标选项（`IMAGE_BASES.path`，9 个命途）。
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
