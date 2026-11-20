# README media production

Only the README and its four product-interface demonstrations are produced here.
See [media sources](../images/readme/README.md) for provenance and illustration
boundaries. Temporary captures, cached GitHub CSS and check results go to ignored
`.work/`; no product or documentation-site implementation is modified.

## Native cat and paste

`cat-paste/record.py` uses an owned, visible Gallery Preview and a 320px neutral
backdrop. Arrange an available desktop window before running it. It never sends
physical input, reads the clipboard or starts real downloads. It pins the cached
EXE hash, uses a unique control directory, and closes only its own processes and
background. The outer Windows Job and 60-second supervisor bound the run.

```powershell
python docs/readme-media/cat-paste/record.py --exe D:/Ameow/target/debug/ameow.exe
```

This command fails if that cached EXE changes; review a new binary and its actual
Gallery catalog before updating the pin.

## Extension session sync

The popup's HTML, CSS and built JS are used unchanged. The renderer checks the
build's source hash against pinned PR63 source, injects only a synthetic browser
transport, and blocks external requests. No extension is installed.

```powershell
node docs/readme-media/session-sync/render.mjs D:/path/to/PR63/browser-extension/dist
```

Use the existing PR63 build, or build the pinned source in an isolated directory
with its lockfile. `PLAYWRIGHT_MODULE` selects an installed `playwright-core`
module and `CHROMIUM_PATH` selects a headless Chromium executable; defaults reuse
this machine's existing trusted cache. FFmpeg encodes the GIF after capture.
No new business dependencies are required.

## Approved clip

Do not re-encode `clip-selection.gif` or its poster. They are copied from the
approved #71 output and their two hashes are checked by `check.mjs`.

## README preview and checks

```powershell
node docs/readme-media/preview.mjs --build
node docs/readme-media/preview.mjs
# In a second terminal:
node docs/readme-media/check.mjs
```

The first command uses the authenticated `gh` CLI only for GitHub Markdown
rendering and fetches GitHub's public styles. The server binds only
`http://127.0.0.1:8871/`. Its controls switch language, GitHub light/dark and
GIF/static poster views; they do not change the README. Stop it with Ctrl+C.

Checks decode every GIF frame with FFmpeg, check both approved clip hashes,
README image/alt/local-link paths and six badge slots, then inspect both languages
at desktop and 320px in GitHub light/dark. Tight section screenshots and a short
result JSON stay in `.work/check/`. These checks verify the media and reading
surface; they do not repeat Rust, account, browser-permission or download tests.
