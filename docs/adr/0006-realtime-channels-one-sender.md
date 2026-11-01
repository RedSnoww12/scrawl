# 0006. Live collaboration on private channels, one sender each

- **Status**: Accepted
- **Date**: 2026-10-31

## Context

Cursors, comments, names and in-progress strokes are sent many times a second through Supabase Realtime. If anyone on a board could send on a shared channel, one person could move someone else's cursor, put words in their mouth, or draw on a board they can only view.

## Decision

- All live channels are private and authorised by `can_use_room()` in the schema, which uses `board_role()` ([0004](0004-access-control-in-the-database.md)).
- Each person sends on channels named after their own user id (`presence:<board>:<user>`, `draw:<board>:<user>`). Anyone on the board may listen; only that user may send, and on `draw:` only while they may edit.
- Saved changes still go through the database ([0005](0005-versioned-saves-and-merge.md)); live messages are previews and are never trusted as the saved board.

## Consequences

- What a person appears to say or draw is tied to the account that sent it.
- A new kind of live message gets its own channel pattern and a rule in `can_use_room()`, never a shared free-for-all channel.
- Live features only work signed in, and need a current `supabase-js`: older versions silently broke Realtime for signed-in people ([0008](0008-exact-dependency-versions.md)). Test them with two accounts, not one.
