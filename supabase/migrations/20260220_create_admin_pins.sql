create extension if not exists pgcrypto;

create table if not exists public.admin_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  pin_hash varchar(255) not null,
  is_default boolean not null default true,
  last_changed_at timestamptz,
  created_at timestamptz not null default now(),
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

create table if not exists public.admin_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  attempted_by uuid,
  success boolean not null,
  reason text,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists admin_pins_user_id_idx on public.admin_pins(user_id);
create index if not exists admin_pins_locked_until_idx on public.admin_pins(locked_until);
create index if not exists admin_pin_attempts_user_id_idx on public.admin_pin_attempts(user_id);
create index if not exists admin_pin_attempts_attempted_by_idx on public.admin_pin_attempts(attempted_by);
create index if not exists admin_pin_attempts_created_at_idx on public.admin_pin_attempts(created_at);
