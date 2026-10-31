-- Scrawl: one row per board, owned by the signed-in user.
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.boards (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  name       text        not null default '',
  elements   jsonb       not null default '[]'::jsonb,
  view       jsonb,
  updated_at timestamptz not null default now(),
  -- deleted boards are kept as empty tombstones so other devices learn about the deletion
  deleted    boolean     not null default false,
  primary key (user_id, id)
);

-- Row-level security: each person can only see and change their own boards.
alter table public.boards enable row level security;

drop policy if exists "boards are readable by their owner" on public.boards;
create policy "boards are readable by their owner"
  on public.boards for select using (auth.uid() = user_id);

drop policy if exists "boards are insertable by their owner" on public.boards;
create policy "boards are insertable by their owner"
  on public.boards for insert with check (auth.uid() = user_id);

drop policy if exists "boards are updatable by their owner" on public.boards;
create policy "boards are updatable by their owner"
  on public.boards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "boards are deletable by their owner" on public.boards;
create policy "boards are deletable by their owner"
  on public.boards for delete using (auth.uid() = user_id);
