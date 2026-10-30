# Jigsaw Puzzle

[English](README.md) | [简体中文](README_zh.md)

---

Turn any image into a playable jigsaw puzzle — a fully static site with no framework, no build step, and no runtime dependencies.

## Features

- **Configurable grid** — pick any `rows` × `columns` layout.
- **Real interlocking tabs** — pieces have random tabs and blanks instead of square cut-outs.
- **Highlight or lock a piece** — make one piece glow as a hint, or place it pre-solved as a starting anchor.
- **Optional reference image** — overlay a translucent copy of the original on the board.
- **Download the original when solved** — the top-bar button downloads the source image file, not a screenshot.
- **Multiple puzzles** — one entry per image in `config.json`; the top bar shows a thumbnail picker.

## Project Structure

```text
index.html      Page entry
style.css       All styles
config.json     Single configuration file
launcher.py     Optional launcher (config / preview / deploy)
js/             Site logic
images/         Puzzle images
test/           Node tests and a browser self-check page
```

## Quick Start

The page relies on `fetch` and ES modules, so opening `index.html` through `file://` will not work. Serve the directory over HTTP:

```bash
# Python
python -m http.server 8177

# or Node
npx serve .
```

Then open <http://localhost:8177/>.

### Optional launcher

`launcher.py` uses only the Python standard library:

```bash
python launcher.py            # interactive menu
python launcher.py config     # open config.json in the default editor
python launcher.py preview    # serve locally and open a browser
python launcher.py deploy     # update gh-pages and force-push
```

- `preview` prefers `npx live-server` on a random free port with automatic reload. If npx is missing or live-server fails to start, it falls back to `python -m http.server`.
- `deploy` copies the site files into a temporary `gh-pages` worktree, amends the existing commit (or creates an orphan branch), and runs `git push -f`. It deploys the current working tree, so no prior commit is required. The force-push rewrites the remote `gh-pages` history.

## Configuration

`config.json`:

```json
{
  "defaults": {
    "rows": 4,
    "columns": 5,
    "seed": 1234,
    "showPreview": true,
    "snapDistance": 24
  },
  "puzzles": [
    { "image": "images/sample-a.png", "highlight": { "row": 1, "col": 2, "mode": "glow" } },
    { "image": "images/sample-b.png", "rows": 3, "columns": 3, "highlight": { "mode": "locked" } }
  ]
}
```

`defaults` applies to every puzzle. A puzzle inherits all defaults and overrides only the fields it declares, so adding an image takes a single `{ "image": "..." }` entry.

| Field | Required | Description |
| --- | --- | --- |
| `image` | Yes | Image path, relative to `index.html`. |
| `rows` / `columns` | Conditional | Grid size as positive integers. Required unless provided by `defaults`. |
| `seed` | No | Defaults to `1`. Controls the random tab shapes; the same seed always produces the same shapes. Puzzles sharing a seed get identical tab shapes. |
| `highlight` | No | Highlighted piece, described below. Omit it for no highlight. |
| `showPreview` | No | Defaults to `false`. When `true`, overlays a translucent copy of the original image. |
| `snapDistance` | No | Defaults to `24`. Distance in pixels at which a piece snaps into place. |

### Highlight

```json
"highlight": { "row": 1, "col": 2, "mode": "glow" }   // specific piece
"highlight": { "mode": "locked" }                     // random piece
"highlight": null                                     // no highlight
```

Coordinates are zero-based: `row` is the row index and `col` is the column index. When `row`/`col` are omitted, a piece is chosen at random on every new game, including `Restart` and puzzle switches.

| Mode | Effect |
| --- | --- |
| `glow` (default) | The piece gets a glowing outline and a yellow overlay. It remains draggable. |
| `locked` | The piece starts in its correct position and cannot be dragged, acting as a starting anchor. Progress starts at 1. |

`highlight` is replaced as a whole object. If `defaults` defines a highlight and a puzzle needs a different one, write the complete object (or `null` to disable it for that puzzle).

### Using your own images

1. Put the image in `images/`.
2. Point the puzzle's `image` field in `config.json` at it.

Add one object per image to make multiple puzzles; the top bar shows a thumbnail picker. The bundled `sample-a.png` and `sample-b.png` are placeholder graphics and can be deleted once you add your own.

## Deployment

The site is static, so the directory can be served anywhere:

- **GitHub Pages** — push the repository and select the branch in Settings → Pages.
- **Netlify / Vercel / Cloudflare Pages** — upload or connect the directory.
- **Object storage + CDN** — upload the files as-is.

There is no build output; the source is the deployable artifact.

## Testing

```bash
npm test
```

This runs the geometry and configuration tests under Node. For the browser self-checks, serve the site and open `/test/render-check.html`.

## Known Limitations

- **HTTP is required** — `file://` will not work.
- **Resizing or rotating does not rebuild the board** — piece positions are calculated at load time. Use `Restart` to re-layout.
- **No rotated pieces and no save state** — pieces always stay upright, and reloading starts a new game.
- **Download requires a same-origin image** — the `download` attribute is ignored for cross-origin URLs. Local images under `images/` work; a CDN URL falls back to opening the image.
- **Large grids are expensive** — each piece is a separate canvas, so grids such as `10x10` noticeably reduce frame rate.

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).