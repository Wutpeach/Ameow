# MR7 Windows Electron validation

Date: 2026-08-14  
Worktree: `D:\Ameow\.cindy-worktrees\motion-integration`  
Branch/HEAD: `motion/presentation-integration@710fe5e` (uncommitted MR7 changes)

## Runtime exercised

- Windows 11 Electron/Chromium from the repository's installed Electron
  runtime.
- Production renderer and Electron TypeScript builds from `npm run build`.
- Renderer inspected through Chromium remote debugging on the real Electron
  page, using Playwright only as the CDP client.
- Evidence screenshot: `mr7-windows-electron.png`.

## Results

- Exactly one `canvas` existed in the renderer.
- The canvas was `aria-hidden="true"` with computed
  `pointer-events: none`.
- `canvas.getContext("webgl2")` returned a real
  `WebGL2RenderingContext`; `isContextLost()` was false.
- The current graphics program existed, reported `LINK_STATUS = true`, and
  `gl.getError()` returned `NO_ERROR` (0), proving the host progressed beyond
  context allocation into the concrete linked renderer.
- Settled Expanded state reported CSS/client/backing/drawing-buffer size
  `200 x 200` at DPR 1.
- Pointer leave drove the authoritative Main Window lifecycle to Compact;
  the still-mounted decorative canvas resized to `60 x 60`.
- Pointer re-entry returned the lifecycle to Expanded and the canvas/resource
  size reconstructed to `200 x 200`.
- `WEBGL_lose_context` produced one `webglcontextlost` event. Restore produced
  one `webglcontextrestored` event, rebuilt a live WebGL2 context, and restored
  a linked current program with `NO_ERROR` plus a `200 x 200` drawing buffer,
  without replacing or damaging the DOM.
- Expanded state retained three accessible DOM nodes selected by
  `button, [role], [aria-label], [aria-live]`; the canvas remained decorative.

During the first run, validation found that transformed
`getBoundingClientRect()` dimensions could seed a `176 x 176` backing store
while the settled layout was `200 x 200`. MR7 was corrected to size from
`clientWidth/clientHeight` (layout pixels), with the rect only as a zero-layout
fallback. The repeated run produced matching `200 x 200` CSS/client/backing
and drawing-buffer dimensions.

## Packaged-directory attempt

`npm run package:win:dir` was attempted. It did not reach Electron Builder:
the repository's `ensure-python-runtime.mjs` external runtime acquisition
remained pending with no child process or output for more than five minutes.
The exact spawned process group was terminated so no validation helper stayed
in the background.

Therefore:

- real Windows Electron/Chromium WebGL2 runtime: **VERIFIED**;
- unpacked packaged-directory artifact: **NOT VERIFIED — external Python
  runtime acquisition blocked the packaging prerequisite**;
- macOS: **NOT VERIFIED**.
