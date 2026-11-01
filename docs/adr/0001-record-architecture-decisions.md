# 0001. Record architecture decisions

- **Status**: Accepted
- **Date**: 2026-11-01

## Context

Scrawl is open source. Contributors, and the AI assistants some of them use, arrive without the history of why the code is shaped the way it is. Rules that only live in someone's head get broken by well-meaning changes, for example a React import in the engine or an access check done in the browser.

## Decision

Significant decisions are written down as short records in `docs/adr/`, numbered in order, using [template.md](template.md). A decision is significant when undoing it later would touch many files, the database schema, security, or how people contribute.

## Consequences

- Reviewers can point at a record instead of re-arguing a choice.
- A pull request that goes against a record either changes the code or proposes a new record that supersedes it.
- [CLAUDE.md](../../CLAUDE.md) at the repository root summarises the records as working rules, and must be kept in step with them.
