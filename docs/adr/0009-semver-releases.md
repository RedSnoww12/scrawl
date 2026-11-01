# 0009. Semantic versions, released from the changelog

- **Status**: Accepted
- **Date**: 2026-11-01

## Context

Scrawl has grown many features with no way to say which version someone is running or what changed between two dates. Contributors need to know where their change shows up, and users need release notes they can read.

## Decision

- Versions follow [Semantic Versioning](https://semver.org/). Patch: fixes only. Minor: new features that keep existing boards and links working. Major: anything that breaks them, such as a schema change older clients can't read.
- `package.json` holds the version. The app shows it in the Keyboard shortcuts dialog.
- [CHANGELOG.md](../../CHANGELOG.md) (Keep a Changelog format) collects user-facing changes under `## [Unreleased]` as they merge.
- PR titles are written as release-note lines, and labels (`enhancement`, `bug`, `accessibility`, `documentation`, `skip-changelog`) sort them into sections.
- Releases are cut with the **Prepare release** workflow, which opens a version-bump PR. Merging it lets the **Release** workflow tag `main` and publish the notes. Nothing else creates tags.

## Consequences

- A person choosing patch, minor or major is the only manual step, and the choice is deliberate.
- A PR people will notice needs a label and a changelog line, or its change is missing from the notes.
- Commit messages stay plain sentences; we don't need `feat:`/`fix:` prefixes.
