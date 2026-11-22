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

## Extension demonstrations

The session renderer uses the exact product Popup build and a credential-free
response contract. Provide the current reviewed browser-extension/dist as its
argument; PLAYWRIGHT_MODULE and CHROMIUM_PATH select the browser tools.
The Peek demonstration uses the current product page bundle and a synthetic
range in the isolated manual fixture; no download is submitted. Source hashes
and output identities are recorded in [media sources](../images/readme/README.md).

Run: node docs/readme-media/session-sync/render.mjs browser-extension/dist

Run: node docs/readme-media/clip/render.mjs

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

Checks decode every GIF frame with FFmpeg, preserve the unaffected cat and paste GIFs
and their posters against the reviewed `1ee6e36f` Git baseline, and check
README image/alt/local-link paths and six badge slots, then inspect both languages
at desktop and 320px in GitHub light/dark. Tight section screenshots and a short
result JSON stay in `.work/check/`. These checks verify the media and reading
surface; they do not repeat Rust, account, browser-permission or download tests.
