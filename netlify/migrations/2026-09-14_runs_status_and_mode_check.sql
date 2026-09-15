-- D12 / D5：`runs.status` 与 `runs.mode` 此前是无约束 text，脏值会静默存在——
-- 公开列表与环境统计都按 `status = 'approved'` 过滤，一个非枚举取值既不会展示也不会报错，只能人工清库。
-- 加约束前先核对代码实际写入的取值集合（照抄审核队列的四态会把线上写挂）：
--   status: 'pending'（审核通过时先插 pending 再置 approved）/ 'approved' / 'rejected'（改判）
--           / 'withdrawn'（作者撤回，见 submissions-withdraw.ts 按 runs.id 精确改那一条）
--   mode:   EndgameMode = moc | pf | as | aa
-- `category` **有意不加约束**：根 AGENTS.md 的口径是「runs.category 是开放 text、无枚举约束，新增取值不需要迁移」，
-- 分档随模式与阶段变化，值域由 src/services/submissionRules.ts 的 checkSubmissionRules() 在入队与发布前把关。

alter table runs drop constraint if exists runs_status_check;
alter table runs add constraint runs_status_check
  check (status in ('pending', 'approved', 'rejected', 'withdrawn'));

alter table runs drop constraint if exists runs_mode_check;
alter table runs add constraint runs_mode_check
  check (mode in ('moc', 'pf', 'as', 'aa'));
