create extension if not exists pgcrypto;

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password text not null,
  flight text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  linked_user_id uuid,
  constraint signup_requests_status_check check (status in ('pending','approved','linked','rejected'))
);

create index if not exists signup_requests_email_idx on public.signup_requests (email);
create index if not exists signup_requests_status_idx on public.signup_requests (status);
create index if not exists signup_requests_created_at_idx on public.signup_requests (created_at);
