alter table if exists public.rewards
add column if not exists winner_name text;
