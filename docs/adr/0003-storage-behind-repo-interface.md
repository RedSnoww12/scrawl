# 0003. All storage goes through the `Repo` interface

- **Status**: Accepted
- **Date**: 2026-10-31

## Context

Boards live in two places: in the browser for guests, and in Supabase for signed-in people. Guest mode must keep working with no backend at all, and contributors should be able to work on the UI without a Supabase project.

## Decision

The UI talks to storage only through the interfaces in [`src/lib/repos.ts`](../../src/lib/repos.ts) (`Repo`, `Sharing`, `Room`). Components never import the Supabase client or touch `localStorage` for board data directly. Each backend implements the same interface; features only one backend supports (sharing, live rooms) are optional parts of it.

## Consequences

- Guest mode and signed-in mode share every screen.
- A new storage feature means adding it to the interface first, then implementing it per backend, and hiding it in the UI where a backend lacks it.
- Moving to another backend later means writing one new implementation, not touching components.
