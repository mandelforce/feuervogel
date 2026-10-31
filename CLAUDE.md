# CLAUDE.md

FEUERVOGEL 89: a browser shoot 'em up with no build step and no dependencies. Read `ARCHITECTURE.md` for the layout; `tests/README.md` for the tests.

## Saving tokens: large files

Never read these whole. Grep first, then Read only the lines you need (offset/limit).

| File | Size | Layout |
|---|---|---|
| `index.html` | 2 MB, ~14,800 lines | 1–325 markup + CSS · 461–4130 embedded copy of `tools/citygen.js` (do not edit; see below) · 4131–~14,800 game script · near the end, one line of ~450 KB (`id="enigmaArt"`, base64 PNGs) |
| `tools/citygen.js` | 550 KB | settlement generator |
| `docs/enigma-world-spec.md` | 210 KB | spec; grep for the heading you need |
| `CHANGELOG.md` | 94 KB | newest entries at the top; read the first ~100 lines only |
| `tests/enigma.mjs` | 80 KB | prints only failures; `--verbose` lists every check |
| `tests/citygen.mjs` | 60 KB | one block per preset; grep for the preset name |

Line numbers above drift. To find a part of the game script, grep for its section comment:
`/\* ================= <name>` (e.g. `director`, `AI`, `player`, `render`, `audio`, `terrain`, `state`, `input`).

Long lines in `index.html` (lines ~47 and ~49: base64 fonts; the `enigmaArt` line near the end) dump huge output if a grep matches them. Avoid broad patterns like `png`, `base64` or `data:` on `index.html`; when unsure, use `-o` or count matches first.

Don't open `docs/*.mp4`, `docs/*.html`, `*.png` or `licenses/`: not code.

## Rules that matter

- `tools/citygen.js` is the source; `index.html` carries a copy. After changing it run `node scripts/embed-citygen.mjs` (`tests/citygen.mjs` fails while the copy is stale).
- `VERSION` in `sw.js` must match `VERSION` in `index.html`.
- Run locally: `python3 -m http.server`. Unit tests: `node --test tests/`.
