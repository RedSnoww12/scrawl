# 0005. Versioned saves and a shape-by-shape merge

- **Status**: Accepted
- **Date**: 2026-10-31

## Context

Several people can edit the same board at once. Saving the whole board blindly means the last save wins and silently erases other people's work.

## Decision

- Each board row has a `version` the database bumps on every save. A save states the version it was based on, and the database refuses it if the board has moved on (`ConflictError` in the app).
- On a refusal or an incoming save, the app does a three-way merge in [`src/lib/merge.ts`](../../src/lib/merge.ts): the last agreed copy, this person's edits and the other save. Remote wins everywhere except the shapes this person changed, added or deleted. Then it saves again.
- Shapes are identified by a stable `id`, so the merge can tell them apart.

## Consequences

- Two people editing different shapes never lose each other's work. Two people editing the same shape at the same moment: the later save wins for that shape only.
- Anything that changes how shapes are stored must keep `id` stable and keep the merge correct.
- Saves are whole-board writes, which is fine at whiteboard sizes; very large boards would need a different design and a new record.
