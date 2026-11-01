# 0010. Quality and security checks in CI

- **Status**: Accepted
- **Date**: 2026-11-01

## Context

CI only type-checked and built the app. Rules such as "the engine never imports React" ([0002](0002-engine-free-of-react.md)) relied on reviewers noticing, the merge and the sanitizer had no tests, and nothing watched dependencies or the code for known vulnerabilities.

## Decision

Every pull request and every push to `main` runs:

- **build** (required to merge): type-check, ESLint, Prettier check, Vitest, production build. `npm run check` runs the same locally.
- **audit**: `npm audit --omit=dev` fails on any advisory in what ships to browsers. Dev-tool advisories are handled through Dependabot instead, since they never reach users.
- **dependency-review** (pull requests): refuses new runtime dependencies with known vulnerabilities.
- **CodeQL**: security and quality queries over the TypeScript and the workflows, also weekly.
- **Scorecard**: OpenSSF's rating of the project's security practices, published for the README badge.

Also:

- ESLint enforces ADRs 0002 and 0003 with `no-restricted-imports`. The React Compiler rules are off because we don't use the compiler.
- Prettier formats everything except `src/`, which keeps its compact hand-formatted style. Formatting `src/` is a separate decision.
- Tests run in Node with a stand-in canvas (`src/test/setup.ts`), with no DOM library, and cover pure logic.
- Every action is pinned to a full commit SHA, with the version in a comment. Dependabot proposes updates weekly, after a 7-day cooldown.

## Consequences

- Breaking an architecture rule fails CI with a message pointing to the ADR.
- Contributors run `npm run check` before pushing. `npm run format` fixes formatting.
- A Dependabot PR arrives most weeks and needs a look and a merge.
