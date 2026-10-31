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
5. Open a pull request. Say what changed and how you tested it, and add a screenshot or short clip for visible changes.

## Commit messages

Short, imperative and specific: `Fix arrow heads on zero-length lines`, not `fixes`.

## Be kind

Assume good intent, keep feedback about the code, and help newcomers find their way. Harassment of any kind is not welcome here.
