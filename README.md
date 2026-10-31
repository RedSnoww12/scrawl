# Scrawl

A hand-drawn style whiteboard: sketchy shapes, arrows, freehand ink, text and images, with as many boards as you like. Sign in with Google and your boards follow you to any device; each person only ever sees their own boards.

Built with React, TypeScript and Vite. Drawing uses [rough.js](https://roughjs.com); accounts and storage use [Supabase](https://supabase.com) (Postgres with row-level security). Deploys as a static site, for example on Vercel.

## Run it locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:5173. `npm run build` type-checks and builds to `dist/`.

## Project layout

- `src/engine/` – the canvas: scene model and rendering (`scene.ts`), and input, selection, history and clipboard (`engine.ts`). No React in here.
- `src/components/` – the interface around the canvas: toolbar, style panel, board list, dialogs, sign-in screen.
- `src/lib/repos.ts` – where boards are stored: this browser (guest mode) or the Supabase `boards` table, behind one interface.
- `supabase/schema.sql` – the `boards` table and its access rules.

## Supabase setup

1. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor. It creates the `boards` table with row-level security: signed-in people read and change only their own rows, and signed-out visitors get nothing.
2. **Google sign-in:** in Google Cloud Console, create an OAuth client ID of type *Web application* and add `https://<project>.supabase.co/auth/v1/callback` as an authorized redirect URI. In Supabase, open Authentication → Providers → Google, turn it on, and paste the client ID and secret.
3. **Redirect URLs:** in Authentication → URL Configuration, set the Site URL to the deployed address and add it, plus `http://localhost:5173`, to the redirect URLs.

The project URL and publishable key go in `.env.local` (see `.env.example`). Both are public by design: the access rules protect the data. On Vercel, the Supabase integration's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are picked up too. Never put the database password or the `service_role` key in the app.

## Boards

- Open the board list from the name next to the logo: new, rename, delete.
- Signed in, boards save to your account a moment after you stop drawing. As a guest, they stay in this browser, and after signing in you can copy them to your account.
- **Save to file** / **Open file** move a board as a `.scrawl.json` file. Opened files are cleaned on import: only known shapes and embedded images are kept.

## Keyboard

Press `?` in the app for the full list. The basics: `1`–`9` and `0` switch tools, `Ctrl Z` / `Ctrl ⇧ Z` undo and redo, `Ctrl D` duplicates, `Ctrl G` groups, `⇧ 1` zooms to fit, `G` toggles the grid.
