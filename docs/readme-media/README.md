# README media production

Only the README and its four product-interface demonstrations are produced here.
See [media sources](../images/readme/README.md) for provenance and illustration
boundaries. Temporary captures, cached GitHub CSS and check results go to ignored
`.work/`; no product or documentation-site implementation is modified.

## Native cat and paste

`cat-paste/record.py` requires Windows and Python with Pillow. It uses an owned,
visible Gallery Preview and a 320px neutral backdrop. Arrange available desktop
time before running it. It never sends
physical input, reads the clipboard or starts real downloads. It pins the
EXE hash, uses a unique control directory, and closes only its own processes and
background. The outer Windows Job and 60-second supervisor bound the run.

```powershell
$previewExe = '<absolute-path-to-hash-matched-ameow.exe>'
python docs/readme-media/cat-paste/record.py --exe $previewExe
```

Supply the Windows EXE matching the SHA256 in the [media sources](../images/readme/README.md).
The command rejects other binaries; its pin does not identify a generic 0.5.0
build. Review a different binary and its actual Gallery catalog before changing
the pin. New recordings produce raw media for review.

## Extension session sync

The popup's HTML, CSS and built JS are used unchanged. The renderer checks the
approved Popup v2 build's source identity and exact HTML/CSS/JS/cat SVG hashes, injects
only the credential-free [response contract](session-sync/sample-contract.json)
adapted from the approved preview,
and blocks external requests. No extension is installed. The current webpage's
already-authorized site moves from Sync status unknown to Synced. Page tools
stays on independently of session sync, and Diagnostics remains collapsed.

```powershell
$env:PLAYWRIGHT_MODULE = '<absolute-path-to-playwright-core/index.mjs>'
$env:CHROMIUM_PATH = '<absolute-path-to-headless-chromium-executable>'
$extensionDist = '<absolute-path-to-reviewed-popup-layout-v2/dist>'
node docs/readme-media/session-sync/render.mjs $extensionDist
```

Use the approved Popup v2 build at `c9f7ca43cbc1e0acda24207d232763c931222cc4`,
whose identity is recorded in the media sources. The script also compares HTML
and CSS with that Git object, normalizing line endings only; the served resource
bytes remain unchanged. A fresh build with different line endings or bytes needs
its own review before changing the pins. Set `PLAYWRIGHT_MODULE` to an installed `playwright-core` module
file and `CHROMIUM_PATH` to the Chromium executable to use. These variables also
apply to `check.mjs`; provide your own paths explicitly. Node.js and FFmpeg must
be available. No project dependencies are added.

Only the fourth GIF/poster are replaced. New raw frames and capture metadata
go to `.work/session-sync-popup-v2/`; the old capture remains in `.work/session-sync/`
and its committed provenance remains in Git. The renderer uses its own isolated
headless process and temporary local server; it does not open a user browser,
install an extension or control an existing preview.

## Existing clip assets

Reuse `clip-selection.gif` and its poster without re-encoding. Their two hashes
are documented in the media sources and checked by `check.mjs`.

## README preview and checks

```powershell
node docs/readme-media/preview.mjs --build
$env:README_PREVIEW_PORT = '8873' # Use an unused port for this worktree.
node docs/readme-media/preview.mjs
# In a second terminal:
$env:README_PREVIEW_PORT = '8873'
node docs/readme-media/check.mjs
```

The first command uses the authenticated `gh` CLI for GitHub Markdown rendering
and caches GitHub's public styles. Browser checks require the two tool paths
above and FFmpeg/FFprobe. The server binds only to `127.0.0.1`, on
`README_PREVIEW_PORT` (8871 by default). Use the same unused port for the server
and checker when another worktree already owns 8871. Its controls switch language, GitHub light/dark and
GIF/static poster views; they do not change the README. Stop it with Ctrl+C.

For a self-contained HTML export, set `README_PREVIEW_FILE` to its absolute path
and run `check.mjs` directly. No preview server is needed; file-mode checks also
reject external resource requests. Media crops follow their actual headings,
so introductory, setup and FAQ sections can change without mislabeling evidence.

Checks decode every GIF frame with FFmpeg, preserve all three unaffected GIFs
and their posters against the reviewed `1ee6e36f` Git baseline, and check
README image/alt/local-link paths and six badge slots, then inspect both languages
at desktop and 320px in GitHub light/dark. Tight section screenshots and a short
result JSON stay in `.work/check/`. These checks verify the media and reading
surface; they do not repeat Rust, account, browser-permission or download tests.
