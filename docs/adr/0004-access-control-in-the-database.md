# 0004. Access control lives in the database

- **Status**: Accepted
- **Date**: 2026-10-31

## Context

The app is a static site, and its Supabase URL and publishable key ship to every browser. Anyone can call the database directly with them, so checks done in the browser protect nothing.

## Decision

- Every table has row-level security turned on, with policies that decide who can read and write.
- One function, `board_role(board id)`, decides whether the current person is the owner, an editor, a viewer or nobody. Every board policy, room policy and function goes through it.
- The browser only ever holds public values (`VITE_*` / `NEXT_PUBLIC_*`). The `service_role` key and database password never appear in the app or the repository.
- [`supabase/schema.sql`](../../supabase/schema.sql) is the single source of truth and is safe to run more than once (`if not exists`, `drop policy if exists`, `create or replace`).

## Consequences

- The UI may hide buttons a person can't use, but that is a convenience; the database still refuses the action.
- A new table without row-level security, or a policy that skips `board_role()`, is a bug.
- Changes to sharing rules are made once, in `board_role()`, and apply everywhere.
