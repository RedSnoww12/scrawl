# Scrawl

A hand-drawn style whiteboard in a single `index.html`: sketchy shapes, arrows, freehand ink, text, images, and as many boards as you like.

No build step and no dependencies to install. The page loads [rough.js](https://roughjs.com) and its fonts from public CDNs.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Boards

- Open the board list from the name next to the logo.
- **New board** starts an empty one. Rename and delete are on each row.
- Every board saves itself in the browser as you draw and reopens where you left it.
- Each board has its own link (`/#<board-id>`), so you can bookmark one.
- **Save to file** writes the current board as `<name>.scrawl.json`. **Open…** loads such a file as a new board. Use these to move a board to another device or browser.

Boards always live in the browser's local storage, so the app opens instantly and works offline. Turn on online sync (below) to also keep them on a server and see them on every device.

## Online sync (optional)

Sync uses [Supabase](https://supabase.com) for sign-in and storage. The page talks to Supabase directly, so it still deploys as a static site.

1. Create a free Supabase project.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). It creates the `boards` table and row-level security rules, so each person can only read and change their own boards.
3. In **Authentication → URL Configuration**, set the Site URL to where the app is hosted (for example `https://redsnoww12.github.io/scrawl/`) and add it to the redirect URLs. Add `http://localhost:8000/` too if you test locally.
4. In **Project Settings → API**, copy the project URL and the `anon` public key into `SUPABASE_URL` and `SUPABASE_ANON_KEY` near the end of `index.html`. The anon key is meant to be public; the security rules are what protect the data.

How it behaves:

- A cloud button appears next to the board name. Sign in with an emailed link; no password.
- On sign-in, boards on this device are uploaded and boards from your other devices are downloaded.
- Edits upload a moment after you stop drawing. The app also checks for changes when you come back to the tab, when you reconnect, and every minute.
- If the same board was changed on two devices, the most recent edit wins for that board.
- Deleting a board deletes it everywhere. Signing out keeps the boards on that device.

With the two values left empty, sync stays off and the app works only in the browser.

## Deploy

It is one static file, so any static host works:

- **GitHub Pages**: push this repository, then go to Settings → Pages and serve from the `main` branch root.
- **Netlify / Vercel / Cloudflare Pages**: create a project from the repository with no build command and the root as the output folder.

## Keyboard

Press `?` in the app for the full list. The basics: `1`–`9` and `0` switch tools, `Ctrl Z` / `Ctrl ⇧ Z` undo and redo, `Ctrl D` duplicates, `Ctrl G` groups, `⇧ 1` zooms to fit, `G` toggles the grid.
