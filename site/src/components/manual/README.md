# Manual interface figures

Keep these components scoped to the manual. Desktop redraws preserve actual Rust
layout, palette, fonts, control sizes and motion. Read the owners in DESIGN.md
before changing them. Do not add repetitive illustration captions. Prose styles
must not override component typography; narrow native layouts may pan locally.

The clip uses the original Peek bundle and sample media. The outer controller runs
one 12-second teaching loop only while visible. Steps and trusted iframe input
pause it; five seconds after the last interaction it resumes. Held input prevents
resuming, offscreen/hidden documents pause, and reduced motion shows a stable range
with usable steps. Disconnect clears animation, idle timers and listeners. The
adapter never submits a download or fabricates an accepted task.

The folder example uses the existing folder SVG as a pointer-following translucent
blurred ghost. Pointer capture handles mouse/touch drop and cancellation; clicking
or keyboard selection remains an equivalent action. It changes example state only.
The Compact/Full motion owner in surface-motion.js is retained.

The active popup is pinned to approved product c9f7ca43, merged at a089cfaa.
session-assets.json records exact
HTML/CSS/compiled JS/license/build identities. sources/popup.html keeps the original
HTML; the served wrapper adds only CSP, local paths and safe sample responses.
The API boundary is page-local: no accounts, Native registration, real permission
request or system clipboard. Diagnostic copying writes preview memory. Page tools
default on; a deliberate off choice is remembered per example site independently
of session authorization. Theme binding reads the original stylesheet palette.
Its actual hierarchy is current site, page tools, session sync, then diagnostics.
The previous 941 popup identity remains pinned to aa9bcb78 for recovery.

The former 01c2fad5 native screenshots and video remain historical assets, pinned
to frozen candidate c617b99b in previousCandidate. Current pages do not embed the
superseded two-step setup or shared-details views. New native session illustrations
remain pending; never relabel old captures with a newer code head.
