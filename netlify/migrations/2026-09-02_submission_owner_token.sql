-- 投稿归属令牌：用户在提交成功后获得，用于跨设备/清缓存后回查与撤回。
-- 不做密码体系，只在 localStorage 备份；丢失等同于放弃自助管理。
-- 仅给持有 owner_token 的请求开放读 / 撤回接口，不做身份认证。

alter table submission_reviews
  add column if not exists owner_token text;

create index if not exists submission_reviews_owner_token_idx
  on submission_reviews (owner_token)
  where owner_token is not null;

-- runs 表同步一份，便于审核通过的记录也能用 token 校验（撤回 / 拉我的列表走 runs 即可）。
alter table runs
  add column if not exists owner_token text;

create index if not exists runs_owner_token_idx
  on runs (owner_token)
  where owner_token is not null;
