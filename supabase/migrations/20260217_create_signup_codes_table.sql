create extension if not exists pgcrypto;

create table if not exists public.signup_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  duration_seconds integer not null check (duration_seconds > 0),
  expires_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,
  revoked_at timestamptz,
  revoked_by text,
  used_at timestamptz,
  used_by text,
  constraint signup_codes_revoked_consistency
    check ((revoked_at is null and revoked_by is null) or (revoked_at is not null and revoked_by is not null)),
  constraint signup_codes_used_consistency
    check ((used_at is null and used_by is null) or (used_at is not null and used_by is not null))
);

do $$
begin
  if to_regclass('public.signup_codes') is not null then
    create index if not exists signup_codes_expires_at_idx on public.signup_codes (expires_at);
    create index if not exists signup_codes_is_active_idx on public.signup_codes (is_active);
    create index if not exists signup_codes_created_at_idx on public.signup_codes (created_at);

    create unique index if not exists signup_codes_one_active_code_idx
      on public.signup_codes ((is_active))
      where is_active = true;
  end if;
end
$$;
