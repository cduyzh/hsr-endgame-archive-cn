# AGENTS.md — `src/`（前端应用）

本目录是竞速档案站的 Vue 3 前端。整体约定继承根级 [../AGENTS.md](../AGENTS.md)，这里只补充在 `src/` 内工作时需要的局部信息。

## 一句话定位

档案工作台是核心：`ArchiveView` 组合筛选状态 → 请求记录/统计 → 分组渲染。组件只负责组合状态与渲染，业务逻辑放在 `services/` 与 `composables/`。

## 模块地图

| 目录 / 文件 | 职责 |
| --- | --- |
| `App.vue` / `main.ts` | 应用外壳、导航、挂载（Pinia + Router） |
| `router/index.ts` | 路由，懒加载除首页外的所有页面 |
| `views/` | 页面级组件（见下） |
| `components/archive/` | 档案工作台业务组件 |
| `components/admin/` | 投稿审核台组件（登录弹框、审核卡片） |
| `composables/` | 可复用状态逻辑（筛选、查询、统计、审核会话） |
| `services/` | 数据访问与纯函数层，见 [services/AGENTS.md](services/AGENTS.md) |
| `stores/archiveStore.ts` | Pinia store，缓存 `ArchiveConfig` |
| `types/archive.ts` | 所有 `Archive*` 类型定义（唯一来源） |
| `data/` | seed 数据与图片/命途映射 |
| `assets/` | `main.css`、`redesign.css` 全局样式 |

## 路由与视图

`router/index.ts` 当前注册 5 条路由：`/`(archive)、`/submit`、`/admin/submissions`、`/articles`、`/faq`。首页 `ArchiveView` 同步引入，其余懒加载。

- `src/views/LocalCacheView.vue` **未在路由中注册**，是远程直连改造前的遗留页面。不要为它添加路由，除非用户明确要求恢复；需要清理时先与用户确认。

## 类型与数据流约定

- 所有领域类型集中在 `types/archive.ts`（`ArchiveConfig`、`ArchiveRun`、`BossStage`、`ArchiveFilters`、`MetaStats`、`SubmissionPayload` 等）。新增字段先改类型，再顺着 `services → composables → views` 传递，不要在组件里散落重复结构。
- 业务终局模式 `EndgameMode = "moc" | "pf" | "as" | "aa"`（混沌回忆 / 虚构叙事 / 末日幻影 / 异常仲裁）。与远程静态数据源的模式映射（`moc/fiction/doom/peak`）见 `services/staticArchiveConfig.ts`，不要混淆。
- 数据入口统一走 `services/archiveService.ts`；它负责在 API 失败时回退到 `data/seed`。**不要**在组件里直接 `fetch` 业务 API。
- 图片一律通过 `services/dataSource.ts` 的 `IMAGE_BASES` / `monsterImageUrl()` 或 `data/unitAssets.ts` 的 `getUnitImageSrc()` 生成，直连 `static.nanoka.cc`，不要引用本地副本。

## 状态管理

- 全局配置缓存用 `useArchiveStore()`（`loadConfig()` 幂等，配置只加载一次）。
- 页面级临时状态用 `composables/`：
  - `useArchiveFilters(config)`：筛选状态 + 与路由 query 双向同步（`hydrateFromQuery` / `watch` 回写）。
  - `useRunsQuery(filters)`：记录请求、加载态、按 `teamName` 分组。
  - `useMetaStats(filters)`：环境统计。
  - `useAdminSubmissions()`：审核台会话（`sessionStorage` 持久化）、列表与审核动作。
- 大对象优先 `shallowRef`，避免深层响应式开销（现有代码已如此，保持一致）。

## 组件实现约定

- 新增 Vue 一律用 Composition API + `<script setup lang="ts">`。
- 图标只通过 `lucide-vue-next` 引入，不手写 SVG。
- 筛选/排序/统计逻辑放 `services/runUtils.ts` 或 composable，组件不写业务计算。
- 保持工作台风格：高信息密度、清晰分组、按钮带图标、移动端不横向溢出。

## 本地数据与图片

- `data/seed/`：`config.json`(配置/单位/文章)、`runs.json`(记录)、`hsr-units.json`、`hsr-monsters.json`、`index.ts`(导出)。无数据库时作为前端与 Functions 的 fallback。
- `data/unitAssets.ts`：用 `config.json` 的 `sourceId` 把本地 slug id 映射为远程图片 `sourceId`。
- `data/unitPaths.ts`：命途图标选项（`IMAGE_BASES.path`）。
- `public/assets/hsr/units/`：仅存本地单位图；远程直连是主路径，不要把数据源 JSON 下载进 `public/`。

## 验证

改动本目录后按需运行（根目录）：

```bash
pnpm typecheck   # vue-tsc --noEmit
pnpm lint        # eslint .
pnpm test:unit   # vitest run
pnpm build       # typecheck + test + lint + vite build
```

页面效果用 `pnpm dev` 打开 `http://localhost:32200/` 验证。`@` 别名指向 `src/`（见 `vite.config.ts`）。
