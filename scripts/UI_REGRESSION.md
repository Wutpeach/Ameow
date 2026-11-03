# Current native UI regression intent gate

Run the current controls/ring checks through the existing entry point on Windows:

    $env:PYTHONDONTWRITEBYTECODE='1'
    python -m unittest discover -s scripts -p test_windows_validate.py -v
    python scripts/windows_validate.py --ui-regression --exe <new-isolated-build.exe> --source . --out <new-run-directory>

Build from matching current source in a separate CARGO_TARGET_DIR, preserving
accepted historical executables. Keep source HEAD, all build-input hashes,
build command/output and executable hash with the run. An existing output directory
is rejected so a failed run cannot be silently overwritten.

This mode reuses RepairRuntime, Runtime, CropCapture, the existing Cancel
red/white pixel predicate, and the existing Copy feedback/restoration predicate.
It explicitly launches --stage idle --reduced --hover off; --stage selects the
mock fixture, which has no download backend or tray. Do not use telemetry-only
ordinary startup for these digit-key tests. The original historical workflow mode
is unchanged and is not invoked by --ui-regression.

The current named state slot/action/ring layout and glow padding are read from
source; sample points combine that layout with measured gutter and actual native
DPI. Selector ambiguity, unmet fixture preconditions or assertion failures stop
the run and preserve JSON, logs and images. Product repairs and relaxed assertions
need a separate decision.

| Intent | Current treatment |
| --- | --- |
| Cancel red/white; Copy feedback and restoration after 900ms | Reuse existing predicates, run both themes |
| Quiet default and hover-leave restoration for both controls | Carry, using actual action crop |
| Glyph breathing room | Carry 3dip minimum; mask disc interior so white Light corners are not glyph ink |
| Idle/active halo in Light/Night | Carry radial samples plus original bounded ring crops |
| Halo outer fade and no clipping | Carry outer upper-semicircle samples, verify padded sample domain lies inside canvas; review soft fade in crops |
| Reduced Motion stability | Carry each of six states, two native crops at least 250ms apart |
| Real arc rotation and progress/state changes | Carry native dynamic samples, telemetry and compact GIFs |
| 96 DPI coordinates and fixed old local 228px geometry | Retire; new mode derives geometry and uses actual DPI |
| Old Badge/capsule cutaway and badge-dot strict pixels | Retire; preserve accepted R11 row-v2 design |

ui-regression.json reports only measurable checks as PASS/FAIL. Its visual_review
remains REQUIRED: inspect light-rings.png, night-rings.png, controls.png,
resolving.gif and states.gif for soft halo fade, cut edges and comfortable glyph
spacing. Original full canvas PNGs remain alongside compact sheets; control
enlargement uses nearest-neighbor pixels. Neither measurements nor this engineering
review grant product acceptance.

The neutral owned backdrop and temporary TOPMOST calls protect screenshot privacy;
they cannot prove natural startup z-order. Synthetic fixture controls do not verify
real settings persistence, downloads, physical-user drag/drop, mixed-DPI displays,
macOS or GPU/DWM frame pacing. TRA-23/TRA-26 acceptance gates remain open.
