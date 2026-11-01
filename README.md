<div align="center">

# ✏️ Scrawl

**A hand-drawn whiteboard you can share.**<br>
Sketch boxes, arrows and notes that look like they were drawn on a napkin, keep as many boards as you like, and work on them live with friends.

[![Release](https://img.shields.io/github/v/release/RedSnoww12/scrawl?color=e8590c&label=release)](https://github.com/RedSnoww12/scrawl/releases)
[![CI](https://github.com/RedSnoww12/scrawl/actions/workflows/ci.yml/badge.svg)](https://github.com/RedSnoww12/scrawl/actions/workflows/ci.yml)
[![CodeQL](https://github.com/RedSnoww12/scrawl/actions/workflows/codeql.yml/badge.svg)](https://github.com/RedSnoww12/scrawl/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/RedSnoww12/scrawl/badge)](https://scorecard.dev/viewer/?uri=github.com/RedSnoww12/scrawl)
[![License: MIT](https://img.shields.io/badge/license-MIT-2f5bea.svg)](LICENSE)

[**Open the app**](https://scrawl-seven.vercel.app) · [What's new](CHANGELOG.md) · [Report a bug](https://github.com/RedSnoww12/scrawl/issues/new/choose) · [Contribute](CONTRIBUTING.md)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/hero-dark.jpg">
  <img src="docs/hero-light.jpg" alt="The Scrawl welcome board: a hand-drawn flowchart from 'Sketch the idea' through 'Does it still make sense?' to 'Ship it!', with a dashed arrow looping back" width="100%">
</picture>

</div>

## Features

**Draw**

- Rectangles, diamonds, ellipses, arrows, lines, freehand ink, text and images, all with a hand-drawn look from [rough.js](https://roughjs.com).
- Arrows and lines snap to shapes and stay attached when you move them.
- Styles, layers, grouping, grid snapping, undo and redo, dark mode.
- Save and open `.scrawl.json` files, export PNG or SVG, or copy the image to the clipboard.

**Organise**

- As many boards as you like, sorted into folders.
- Sign in with Google and your boards follow you to every device.
- Or try it as a guest: boards stay in your browser, and you can copy them to your account later.

**Share and work together**

- Invite people by email as viewers or editors, or share a link anyone can open.
- Boards shared with you get their own tab, and you can file them in your folders.
- See everyone's cursor, name and strokes as they draw. Press `/` to leave a comment that follows your pointer.
- Click someone's avatar to see what they see, or double-click it to follow them.
- When two people edit at once, Scrawl merges their changes shape by shape, so nobody's work is overwritten.

<p align="center">
  <img src="docs/board-list.jpg" alt="A shared board in view-only mode, with the board list showing your own board and one shared by Alice" width="48%">
  <img src="docs/share-dialog.jpg" alt="The share dialog: copy the link, choose who can open it, invite people by email as viewers or editors" width="48%">
</p>

## Quick start

You need [Node.js](https://nodejs.org) 22.12 or newer (`nvm use` picks it up from `.nvmrc`).

```bash
git clone https://github.com/RedSnoww12/scrawl.git
cd scrawl
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. Guest mode works straight away; sign-in, sharing and live collaboration need a Supabase project.

### Connect your own Supabase project

1. **Create the tables.** Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. It's safe to run again after pulling changes.
2. **Turn on Google sign-in.**
   - In Google Cloud Console, create an OAuth client ID of type _Web application_, with `https://<project>.supabase.co/auth/v1/callback` as an authorized redirect URI.
   - In Supabase, open Authentication → Providers → Google, turn it on, and paste the client ID and secret.
3. **Set the redirect URLs.** In Authentication → URL Configuration, set the Site URL to your deployed address, and add that address and `http://localhost:5173` to the redirect URLs.
4. **Fill in `.env.local`** with your project URL and publishable key. Variables from the Vercel ↔ Supabase integration (`NEXT_PUBLIC_SUPABASE_*`) work too.

Both values ship to the browser and are public by design: row-level security in the database protects the data. Never put the `service_role` key or the database password in the app.

> [!NOTE]
> While your Google OAuth app is in **Testing** mode, only the accounts listed as test users can sign in. Add your friends there, or publish the app.

### Deploy

Any static host works: `npm run build` writes the site to `dist/`. On Vercel, import the repository and it picks up the Vite settings on its own.

## Development

| Command                           | What it does                                         |
| --------------------------------- | ---------------------------------------------------- |
| `npm run dev`                     | Start the dev server                                 |
| `npm run check`                   | Type-check, lint, check formatting and run the tests |
| `npm test` / `npm run test:watch` | Run the tests once / on every change                 |
| `npm run lint` / `npm run format` | Lint / format the files Prettier covers              |
| `npm run build`                   | Type-check and build to `dist/`                      |

Every pull request runs the same checks in CI, plus a dependency audit and CodeQL.

## How it works

| Part                                                  | Where                                        |
| ----------------------------------------------------- | -------------------------------------------- |
| Canvas engine: scene model, rendering, input, history | [`src/engine/`](src/engine)                  |
| Interface: toolbar, style panel, board list, sharing  | [`src/components/`](src/components)          |
| Storage: this browser (guest) or Supabase             | [`src/lib/repos.ts`](src/lib/repos.ts)       |
| Shape-by-shape merge when two people edit at once     | [`src/lib/merge.ts`](src/lib/merge.ts)       |
| Tables, access rules and live-channel permissions     | [`supabase/schema.sql`](supabase/schema.sql) |

The main design choices, and why they were made, are written up as [architecture decision records](docs/adr/README.md). In short: the engine never depends on React, all storage goes through one interface, access control lives in the database, and anything arriving from outside is sanitized before use. [CLAUDE.md](CLAUDE.md) sums up the rules on one page.

## Keyboard

Press `?` in the app for the full list. The basics:

| Keys                  | Action                       |
| --------------------- | ---------------------------- |
| `1`–`9`, `0`          | Switch tools                 |
| `Ctrl Z` / `Ctrl ⇧ Z` | Undo / redo                  |
| `Ctrl D` / `Ctrl G`   | Duplicate / group            |
| `⇧ 1` / `G`           | Zoom to fit / toggle grid    |
| `/`                   | Comment next to your pointer |

## Contributing

Bug fixes, new drawing tools and accessibility work are all welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and open an issue before a big change so we can agree on the approach. Issues labelled [`good first issue`](https://github.com/RedSnoww12/scrawl/labels/good%20first%20issue) are a good place to begin.

## Security

Please don't report security problems in public issues. Use GitHub's [private vulnerability reporting](https://github.com/RedSnoww12/scrawl/security/advisories/new) instead; [SECURITY.md](SECURITY.md) has the details.

## Releases

Scrawl follows [Semantic Versioning](https://semver.org/). Each version has notes on the [releases page](https://github.com/RedSnoww12/scrawl/releases) and an entry in [CHANGELOG.md](CHANGELOG.md). The Keyboard shortcuts dialog (`?`) shows which version you're running.

## Built with

[React](https://react.dev), [TypeScript](https://www.typescriptlang.org), [Vite](https://vite.dev), [rough.js](https://roughjs.com) for the hand-drawn look, [Supabase](https://supabase.com) for sign-in, storage and live collaboration, and the [Kalam](https://fonts.google.com/specimen/Kalam) handwriting font.

## License

[MIT](LICENSE) © 2026 RedSnoww12
