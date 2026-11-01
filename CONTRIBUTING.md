# Contributing to Scrawl

Thanks for helping. Bug fixes, new drawing tools, accessibility and translation work are all welcome.

## Before you start

- **Small fix?** Open a pull request directly.
- **Bigger change** (a new feature, a schema change, a new dependency)? Open an issue first so we can agree on the approach before you spend time on it.
- Look for issues labelled `good first issue` if you want somewhere to start.

## Set up

```bash
git clone https://github.com/<you>/scrawl.git
cd scrawl
npm install
cp .env.example .env.local
npm run dev
```

Guest mode works without any backend. To work on sign-in, sharing or saving online, create a free Supabase project and follow "Your own Supabase project" in the [README](README.md). Never commit `.env.local`, keys or passwords.

## Making a change

1. Branch from `main`: `git checkout -b fix/arrow-heads`.
2. Keep the code in the style around it:
   - the engine in `src/engine/` stays free of React;
   - the UI talks to storage only through the `Repo` interface in `src/lib/repos.ts`.
3. If you change `supabase/schema.sql`, keep it safe to run more than once (`if not exists`, `drop policy if exists`, `create or replace`). Every table needs row-level security.
4. Run `npm run build` (type-check and build) and try your change in the browser, in both light and dark mode, and at phone width.
5. Open a pull request (see below).

## Pull requests

The PR template walks you through this; here is why each part matters.

**Branch name**: a prefix for the kind of change, then a few words: `feature/sticky-notes`, `fix/arrow-heads`, `docs/self-hosting`, `chore/upgrade-vite`.

**Title**: it becomes a line in the release notes as written, so write it for the people using Scrawl, not for the code. Imperative, specific, no prefix or period.

| ✅ | ❌ |
|---|---|
| `Connect arrows and lines to shapes` | `feat: connectors` |
| `Keep collaborators visible on shared boards` | `Fix presence bug in Presence.tsx` |
| `Show the version in the shortcuts dialog` | `Update Dialogs.tsx` |

**Description**:
- **What changed**: one or two sentences on the result, and `Closes #12` if it fixes an issue.
- **How I tested it**: tick what you did, and add anything specific to this change (two browsers for live features, a slow network, a guest and a signed-in account).
- **Screenshots**: a picture or short clip for anything visible. Before and after helps for fixes.

**Label**: it decides where the PR lands in the release notes. If you can't set labels, a maintainer will.

| Label | For | Release notes section |
|---|---|---|
| `enhancement` | something new people can do | ✨ New |
| `bug` | a fix | 🐛 Fixed |
| `accessibility` | keyboard, screen reader, contrast | ♿ Accessibility |
| `documentation` | README, guides | 📝 Docs |
| `skip-changelog` | CI, refactors, anything users won't notice | left out |

**Changelog**: for a change people will notice, add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), in the right group (`Added`, `Changed`, `Fixed`, `Security`).

**Size**: one change per pull request. A fix and an unrelated refactor are two PRs; they're easier to review and to revert. Open it as a draft if you want early feedback.

## Commit messages

Short, imperative and specific: `Fix arrow heads on zero-length lines`, not `fixes`.

## Releases

Versions follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **Patch** (`1.0.1`): fixes only.
- **Minor** (`1.1.0`): new features that keep existing boards and links working.
- **Major** (`2.0.0`): anything that breaks them, such as a schema change older clients can't read.

To cut a release (maintainers):

1. On a branch, set the new version in `package.json` (`npm version 1.1.0 --no-git-tag-version`), move the `[Unreleased]` entries in `CHANGELOG.md` under a new heading for that version, and merge the pull request.
2. On GitHub, draft a new release on `main` with a new tag `v1.1.0`, press **Generate release notes**, edit if needed, and publish.

The app shows its version at the bottom of the Keyboard shortcuts dialog, so people can tell which release they're running.

## Be kind

Assume good intent, keep feedback about the code, and help newcomers find their way. Harassment of any kind is not welcome here.
