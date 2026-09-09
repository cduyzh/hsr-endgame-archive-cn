-- 投稿自助管理：作者可以在「我的投稿」里隐藏一条已驳回 / 已撤回的记录，或把已驳回的硬删掉；
-- 已通过的记录可以「编辑并重新提交」，产生一条待审的修订，管理员通过之前公开档案仍展示上一次通过的版本。
-- hidden 存在服务端而不是 localStorage，换浏览器 / 清缓存后仍然生效；/me 默认过滤掉，并回一份 hiddenCount 供「已隐藏 N 条」展开入口使用，所以隐藏可逆。
-- runs 与 submission_reviews 靠同一个 id 值 1:1 关联（runs 没有 submission_id 列），因此修订用**新行 + revises_id 指回原投稿**：
-- 复用同一个 id 会让审核通过时的 `on conflict (id) do update` 立刻覆盖公开记录，且同一审核行无法同时是「已通过的原稿」和「待审的修订」。

alter table submission_reviews
  add column if not exists hidden boolean not null default false;

alter table submission_reviews
  add column if not exists revises_id text;

create index if not exists submission_reviews_revises_idx
  on submission_reviews (revises_id)
  where revises_id is not null;

create index if not exists submission_reviews_hidden_idx
  on submission_reviews (owner_token, hidden)
  where owner_token is not null;
