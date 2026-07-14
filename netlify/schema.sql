create table if not exists seasons (
  id text primary key,
  label text not null,
  is_current boolean not null default false
);

create table if not exists stages (
  id text primary key,
  season_id text not null references seasons(id),
  mode text not null,
  name text not null,
  subtitle text not null,
  hp text not null,
  speed text not null,
  toughness text not null,
  weakness jsonb not null default '[]',
  resist jsonb not null default '{}',
  clears integer not null default 0,
  memory_buff text not null,
  banner_tone text not null default 'cyan'
);

create table if not exists characters (
  id text primary key,
  name text not null,
  path text not null,
  element text,
  rarity integer not null,
  limited boolean not null default false
);

create table if not exists lightcones (
  id text primary key,
  name text not null,
  path text not null,
  rarity integer not null,
  limited boolean not null default false
);

create table if not exists runs (
  id text primary key,
  season_id text not null references seasons(id),
  mode text not null,
  boss_id text not null references stages(id),
  category text not null,
  team_name text not null,
  author text not null,
  cycle integer not null,
  score integer not null,
  cost integer not null,
  limited_count integer not null default 0,
  standard_count integer not null default 0,
  submitted_at timestamptz not null default now(),
  tags jsonb not null default '[]',
  video_url text,
  status text not null default 'approved'
);

create table if not exists run_units (
  id bigserial primary key,
  run_id text not null references runs(id) on delete cascade,
  unit_id text not null,
  kind text not null,
  slot_index integer not null,
  eidolon integer,
  superimposition integer
);

create table if not exists articles (
  id text primary key,
  title text not null,
  excerpt text not null,
  category text not null,
  published_at date not null,
  read_minutes integer not null default 3
);

create table if not exists submission_reviews (
  id text primary key,
  payload jsonb not null,
  status text not null default 'pending',
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists runs_filter_idx on runs (season_id, mode, boss_id, category, status);
create index if not exists run_units_lookup_idx on run_units (run_id, unit_id, kind);
