# 0008. Exact dependency versions, few dependencies

- **Status**: Accepted
- **Date**: 2026-11-01

## Context

A whiteboard that holds people's work and talks to a database is a supply-chain target, and every dependency can change behaviour under us. Live collaboration broke once without any code change of ours: `supabase-js` 2.50 silently stopped Realtime for signed-in people, and upgrading to 2.118 fixed it.

## Decision

- `package.json` pins exact versions (`"react": "19.1.0"`, not `^19.1.0`), and `package-lock.json` is committed. CI installs with `npm ci`.
- The runtime has four dependencies: React, React DOM, `supabase-js` and rough.js. A new one needs an issue first explaining why the platform or existing code can't do it.
- Upgrades are their own pull requests, tested in the browser, with live features tried signed in on two accounts.
- `supabase-js` is kept current and never downgraded.

## Consequences

- Builds are reproducible, and an upgrade is a visible, reviewable change.
- Someone has to bump versions on purpose; nothing updates on its own.
