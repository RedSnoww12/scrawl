-- Scrawl: one row per board, owned by the person who created it.
-- Safe to run more than once (SQL Editor → New query → paste → Run).

create table if not exists public.boards (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name       text        not null default 'Untitled board' check (char_length(name) between 1 and 80),
  elements   jsonb       not null default '[]'::jsonb check (jsonb_typeof(elements) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- lets the board list show "12 shapes" without downloading every drawing
alter table public.boards add column if not exists shape_count integer
  generated always as (jsonb_array_length(elements)) stored;

create index if not exists boards_user_updated_idx on public.boards (user_id, updated_at desc);

-- keep updated_at honest on every change
create or replace function public.boards_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists boards_touch on public.boards;
create trigger boards_touch before update on public.boards
  for each row execute function public.boards_touch();

-- Row-level security: every person sees and changes only their own boards.
alter table public.boards enable row level security;

drop policy if exists "Own boards: read" on public.boards;
create policy "Own boards: read" on public.boards
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Own boards: create" on public.boards;
create policy "Own boards: create" on public.boards
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Own boards: update" on public.boards;
create policy "Own boards: update" on public.boards
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Own boards: delete" on public.boards;
create policy "Own boards: delete" on public.boards
  for delete to authenticated using ((select auth.uid()) = user_id);

-- signed-out visitors get nothing
revoke all on public.boards from anon;
grant select, insert, update, delete on public.boards to authenticated;
