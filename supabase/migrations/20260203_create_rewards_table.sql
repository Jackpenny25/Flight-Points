create extension if not exists pgcrypto;

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  how_to_win text not null,
  prize text not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

create index if not exists rewards_ends_at_idx on public.rewards (ends_at);
create index if not exists rewards_created_at_idx on public.rewards (created_at);
