create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  city text not null,
  country text not null,
  bio text not null default '',
  salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  expires bigint not null
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires);

create table if not exists posts (
  id text primary key,
  author_id text not null references users (id) on delete cascade,
  payload jsonb not null,
  created_at bigint not null
);

create index if not exists posts_created_at_idx on posts (created_at desc);

create table if not exists saves (
  user_id text not null references users (id) on delete cascade,
  entry_id text not null,
  primary key (user_id, entry_id)
);

create table if not exists ratings (
  user_id text not null references users (id) on delete cascade,
  entry_id text not null,
  value integer not null check (value between 1 and 5),
  primary key (user_id, entry_id)
);

create table if not exists threads (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  entry_id text not null,
  with_name text not null,
  messages jsonb not null
);

create index if not exists threads_user_entry_idx on threads (user_id, entry_id);
