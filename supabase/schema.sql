-- Scrawl database: boards, who they are shared with, and each person's folders.
-- Safe to run more than once (SQL Editor → New query → paste → Run).

-- ============================================================ boards
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
-- 'private': only the owner and invited people. 'link': also anyone signed in who opens the link.
alter table public.boards add column if not exists visibility text not null default 'private'
  check (visibility in ('private', 'link'));
-- what people who came through the link may do
alter table public.boards add column if not exists link_role text not null default 'view'
  check (link_role in ('view', 'edit'));
-- goes up on every change, so two people saving at once can't silently overwrite each other
alter table public.boards add column if not exists version integer not null default 1;

create index if not exists boards_user_updated_idx on public.boards (user_id, updated_at desc);

-- ============================================================ sharing
-- People invited by email. They get access once they sign in with that Google address.
create table if not exists public.board_members (
  board_id   uuid        not null references public.boards (id) on delete cascade,
  email      text        not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role       text        not null default 'view' check (role in ('view', 'edit')),
  invited_by uuid        default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (board_id, email)
);
create index if not exists board_members_email_idx on public.board_members (email);

-- ============================================================ folders
create table if not exists public.folders (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  name       text        not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- One row per person per board they keep in their list: which folder it sits in, and for
-- link-shared boards, the record that this person opened the link.
create table if not exists public.user_boards (
  user_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  board_id  uuid        not null references public.boards (id) on delete cascade,
  folder_id uuid,
  added_at  timestamptz not null default now(),
  primary key (user_id, board_id),
  -- a board can only go in one of your own folders
  foreign key (folder_id, user_id) references public.folders (id, user_id) on delete set null (folder_id)
);
create index if not exists user_boards_board_idx on public.user_boards (board_id);

-- ============================================================ access rules
-- The signed-in person's address, only once it is confirmed (Google addresses always are),
-- so nobody can claim an invite by signing up with someone else's unverified email.
create or replace function public.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select lower(u.email) from auth.users u
                   where u.id = auth.uid() and u.email_confirmed_at is not null), '')
$$;

-- What the signed-in person may do with a board: 'owner', 'edit', 'view', or null for nothing.
-- security definer so the policies below can call it without looping back into themselves.
create or replace function public.board_role(b uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when bd.user_id = auth.uid() then 'owner'
    when m.role = 'edit' or (via_link and bd.link_role = 'edit') then 'edit'
    when m.role is not null or via_link then 'view'
  end
  from public.boards bd
  left join public.board_members m on m.board_id = bd.id and m.email = public.my_email()
  cross join lateral (
    select bd.visibility = 'link'
       and exists (select 1 from public.user_boards ub where ub.board_id = bd.id and ub.user_id = auth.uid()) as via_link
  ) l
  where bd.id = b and auth.uid() is not null
$$;

-- updated_at and version on every change; only the owner changes who can see a board
create or replace function public.boards_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and old.user_id <> auth.uid()
     and (new.visibility is distinct from old.visibility or new.link_role is distinct from old.link_role) then
    raise exception 'Only the owner can change who can see this board' using errcode = '42501';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'A board cannot change owner' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

drop trigger if exists boards_touch on public.boards;
create trigger boards_touch before update on public.boards
  for each row execute function public.boards_touch();

alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.folders enable row level security;
alter table public.user_boards enable row level security;

drop policy if exists "Own boards: read" on public.boards;
drop policy if exists "Own boards: create" on public.boards;
drop policy if exists "Own boards: update" on public.boards;
drop policy if exists "Own boards: delete" on public.boards;
drop policy if exists "Boards: read" on public.boards;
drop policy if exists "Boards: create" on public.boards;
drop policy if exists "Boards: update" on public.boards;
drop policy if exists "Boards: delete" on public.boards;

create policy "Boards: read" on public.boards for select to authenticated
  using ((select auth.uid()) = user_id or public.board_role(id) is not null);
create policy "Boards: create" on public.boards for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Boards: update" on public.boards for update to authenticated
  using (public.board_role(id) in ('owner', 'edit'))
  with check (public.board_role(id) in ('owner', 'edit'));
create policy "Boards: delete" on public.boards for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members: owner manages" on public.board_members;
drop policy if exists "Members: see own invite" on public.board_members;
drop policy if exists "Members: leave" on public.board_members;
create policy "Members: owner manages" on public.board_members for all to authenticated
  using (exists (select 1 from public.boards b where b.id = board_id and b.user_id = (select auth.uid())))
  with check (exists (select 1 from public.boards b where b.id = board_id and b.user_id = (select auth.uid())));
create policy "Members: see own invite" on public.board_members for select to authenticated
  using (email = (select public.my_email()));
create policy "Members: leave" on public.board_members for delete to authenticated
  using (email = (select public.my_email()));

drop policy if exists "Folders: own" on public.folders;
create policy "Folders: own" on public.folders for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Placements: read own" on public.user_boards;
drop policy if exists "Placements: add" on public.user_boards;
drop policy if exists "Placements: move" on public.user_boards;
drop policy if exists "Placements: remove" on public.user_boards;
create policy "Placements: read own" on public.user_boards for select to authenticated
  using ((select auth.uid()) = user_id);
-- only boards you can already open; link boards are added by join_board()
create policy "Placements: add" on public.user_boards for insert to authenticated
  with check ((select auth.uid()) = user_id and public.board_role(board_id) is not null);
create policy "Placements: move" on public.user_boards for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Placements: remove" on public.user_boards for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================ functions the app calls
-- Opening a board: returns your role, and records a link visit so the board shows up in your list.
create or replace function public.join_board(b uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  if auth.uid() is null then return null; end if;
  r := public.board_role(b);
  if r is null and exists (select 1 from public.boards where id = b and visibility = 'link') then
    insert into public.user_boards (user_id, board_id) values (auth.uid(), b) on conflict do nothing;
    r := public.board_role(b);
  end if;
  return r;
end $$;

-- Taking a shared board off your list: drops your invite and your link visit.
create or replace function public.leave_board(b uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.board_members where board_id = b and email = public.my_email();
  delete from public.user_boards where board_id = b and user_id = auth.uid();
end $$;

-- Everything in your board list: your boards and the ones shared with you, with your role,
-- your folder for each, and who owns the shared ones (the owner's email only for people they invited).
create or replace function public.list_boards()
returns table (id uuid, name text, updated_at timestamptz, shape_count integer, version integer, role text,
               folder_id uuid, visibility text, owner_name text, owner_email text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.updated_at, b.shape_count, b.version, r.role, ub.folder_id, b.visibility,
         case when r.role <> 'owner' then coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') end,
         case when r.role <> 'owner' and exists (select 1 from public.board_members m
                                                 where m.board_id = b.id and m.email = public.my_email())
              then u.email::text end
  from public.boards b
  cross join lateral (select public.board_role(b.id) as role) r
  left join public.user_boards ub on ub.board_id = b.id and ub.user_id = auth.uid()
  left join auth.users u on u.id = b.user_id
  where auth.uid() is not null
    and (b.user_id = auth.uid()
         or b.id in (select m.board_id from public.board_members m where m.email = public.my_email())
         or b.id in (select x.board_id from public.user_boards x where x.user_id = auth.uid()))
    and r.role is not null
  order by b.updated_at desc
$$;

-- ============================================================ grants
revoke all on public.boards, public.board_members, public.folders, public.user_boards from anon;
grant select, insert, update, delete on public.boards, public.board_members, public.folders, public.user_boards to authenticated;

revoke all on function public.my_email(), public.board_role(uuid), public.join_board(uuid),
  public.leave_board(uuid), public.list_boards() from public, anon;
grant execute on function public.my_email(), public.board_role(uuid), public.join_board(uuid),
  public.leave_board(uuid), public.list_boards() to authenticated;

-- live updates when someone else edits a board you have open
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'boards') then
    alter publication supabase_realtime add table public.boards;
  end if;
end $$;

-- ============================================================ live cursors
-- Who has a board open, where their pointer is and the comments they type next to it travel
-- over a private Realtime channel per board, 'presence:<board id>'. Nothing is stored.
-- Only people who can open the board may join it.
create or replace function public.can_join_room(topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when topic ~ '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.board_role(substr(topic, 10)::uuid) is not null
    else false
  end
$$;
revoke all on function public.can_join_room(text) from public, anon;
grant execute on function public.can_join_room(text) to authenticated;

drop policy if exists "Rooms: listen" on realtime.messages;
drop policy if exists "Rooms: send" on realtime.messages;
create policy "Rooms: listen" on realtime.messages for select to authenticated
  using (extension in ('broadcast', 'presence') and public.can_join_room((select realtime.topic())));
create policy "Rooms: send" on realtime.messages for insert to authenticated
  with check (extension in ('broadcast', 'presence') and public.can_join_room((select realtime.topic())));

notify pgrst, 'reload schema';
