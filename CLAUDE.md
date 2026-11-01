# Scrawl: working rules

A hand-drawn whiteboard with sharing and live collaboration: React 19 + TypeScript + Vite, rough.js for drawing, Supabase for sign-in, storage and Realtime.

These rules apply to every change, whoever or whatever makes it. The reasons behind them are in [docs/adr/](docs/adr/README.md); the contributor workflow is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Commands

- `npm run dev`: dev server. Guest mode works without a backend.
- `npm run check`: type-check, lint, formatting and tests. Must pass before every pull request; CI runs the same, plus `npm run build`. ([ADR 0010](docs/adr/0010-quality-gates-in-ci.md))
- `npm run lint`, `npm run format`, `npm test` / `npm run test:watch`: one at a time.

Unit tests (Vitest, `*.test.ts` next to the code) cover pure logic such as the merge and the sanitizer. Add one when you change logic like that. Everything else is verified in the browser: light and dark mode, phone width, and for live features two accounts on the same board.

## Architecture (must hold)

1. `src/engine/` never imports React, `src/components/` or `src/lib/`. ([ADR 0002](docs/adr/0002-engine-free-of-react.md))
2. Components reach storage only through `Repo` / `Sharing` / `Room` in `src/lib/repos.ts`. Never call the Supabase client or `localStorage` for board data from a component. ([ADR 0003](docs/adr/0003-storage-behind-repo-interface.md))
3. Access rules live in `supabase/schema.sql`: row-level security on every table, every check through `board_role()`. A check in the browser is a convenience, never protection. ([ADR 0004](docs/adr/0004-access-control-in-the-database.md))
4. `supabase/schema.sql` stays safe to run twice: `if not exists`, `drop policy if exists`, `create or replace`.
5. Saves carry the `version` they were based on; conflicts are merged shape by shape in `src/lib/merge.ts`. Keep shape `id`s stable. ([ADR 0005](docs/adr/0005-versioned-saves-and-merge.md))
6. Live messages go on private channels named after the sending user, each authorised in `can_use_room()`. No shared channel that anyone can send on. ([ADR 0006](docs/adr/0006-realtime-channels-one-sender.md))
7. Outside data (files, loaded boards, remote saves, live strokes) passes through `sanitizeElements()` before use. A new shape property must be added there. Never render other people's text as HTML. ([ADR 0007](docs/adr/0007-board-data-is-untrusted.md))

## Security

- Only public values in the browser (`VITE_*`, `NEXT_PUBLIC_*`). Never the `service_role` key, the database password, or `.env.local` in code or commits.
- Avatars load only from `lh3`–`lh6.googleusercontent.com` over HTTPS.
- Security problems go through private reporting ([SECURITY.md](SECURITY.md)), not public issues.

## Dependencies

- Exact versions only, no `^` or `~`; commit `package-lock.json`. ([ADR 0008](docs/adr/0008-exact-dependency-versions.md))
- Don't add a runtime dependency without an issue that agrees to it.
- Keep `supabase-js` current; never downgrade it. Older versions silently broke Realtime for signed-in people.
- Upgrades are their own pull request.

## Code style

- ESLint enforces the hook rules and ADRs 0002 and 0003; fix what it reports rather than disabling the rule.
- Prettier formats everything outside `src/`. Inside `src/`, match the file you're in: its density, naming and idiom. Single quotes, two-space indent, terse code.
- Comments explain why, not what. Exported functions and types get a one-line `/** … */`.
- UI text is short, plain and specific ("Copied the image", not "Success!"). Error messages say what to do next.
- New UI uses the colour tokens in `src/styles.css` (`--ink`, `--muted`, `--accent`, …) so dark mode works; never hard-code colours.

## Git and pull requests

- Branch from `main` with a prefix: `feature/`, `fix/`, `docs/`, `chore/`.
- Commit messages and PR titles: imperative, specific, user-facing, no prefix (`Connect arrows and lines to shapes`). PR titles become release-note lines as written.
- One change per pull request. Fill in the PR template.
- Label every PR: `enhancement`, `bug`, `accessibility`, `documentation` or `skip-changelog`.
- A change people will notice adds a line under `## [Unreleased]` in `CHANGELOG.md`.

## Releases

- Semantic versioning; `package.json` holds the version. ([ADR 0009](docs/adr/0009-semver-releases.md))
- Never create tags or edit the version by hand in a feature PR. Releases go through the **Prepare release** workflow, and merging its PR publishes the release.

## Decisions

A change that goes against an ADR, or makes a new decision of the same weight (schema, security, a new dependency, how storage or live sync works), needs a new record in `docs/adr/` from [the template](docs/adr/template.md). Update this file when a record changes the rules.
