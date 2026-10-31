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

Boards live in the browser's local storage. They stay on that device and browser, and clearing site data removes them.

## Deploy

It is one static file, so any static host works:

- **GitHub Pages**: push this repository, then go to Settings → Pages and serve from the `main` branch root.
- **Netlify / Vercel / Cloudflare Pages**: create a project from the repository with no build command and the root as the output folder.

## Keyboard

Press `?` in the app for the full list. The basics: `1`–`9` and `0` switch tools, `Ctrl Z` / `Ctrl ⇧ Z` undo and redo, `Ctrl D` duplicates, `Ctrl G` groups, `⇧ 1` zooms to fit, `G` toggles the grid.
