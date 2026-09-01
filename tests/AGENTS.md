# AGENTS.md — `tests/`（单元测试）

框架为 **Vitest + Vue Test Utils + jsdom**，配置内联在根 `vite.config.ts`（`environment: "jsdom"`、`globals: true`）。命令：`pnpm test:unit`（`vitest run`），可用 `--` 过滤，如 `pnpm test:unit -- tests/runUtils.test.ts`。

> 改动本目录或新增测试后，按根 [`../AGENTS.md`](../AGENTS.md) 的「文档同步契约」同步更新本文件（覆盖表）；若测试断言的是数据口径（赛季 id、HP 展示等），根 `AGENTS.md` 的「静态数据维护约束」与 `src/services/AGENTS.md` 也要一起改，**同一提交内完成**。

## 现有覆盖

| 文件 | 目标 |
| --- | --- |
| `runUtils.test.ts` | `src/services/runUtils.ts` 筛选/排序/统计纯函数 |
| `staticArchiveConfig.test.ts` | 远程静态快照推导与配置合并（`staticArchiveConfig.ts`） |
| `submissionUtils.test.ts` | 投稿 → 档案记录转换、光锥偏好统计 |
| `submissionValidation.test.ts` | 投稿字段校验顺序、步骤归属、限定/常驻统计与预览取数（`submissionValidation.ts`） |
| `archiveService.test.ts` | `submitRun` 的成功返回与服务端 `{ message, missing }` → 中文错误映射 |
| `adminAuth.test.ts` | `netlify/functions/_shared.ts` 的 `requireAdmin`（Bearer/Basic/未配置） |
| `RunGroupList.test.ts` / `SubmitRunForm.test.ts` / `UnitPickerDrawer.test.ts` | 关键档案组件的挂载与交互；`SubmitRunForm.test.ts` 覆盖三步向导的解锁、回退、预览与提交/失败态 |
| `fixtures/runs.ts` | 共享 `ArchiveRun` 夹具（`fixtureRuns`），新用例优先复用 |
| `fixtures/config.ts` | 带敌方阶段的 `fixtureConfig` 与可通过校验的 `fixtureSubmission()` |

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
