# Ameow Next: Window/UI Phase 1

Isolated GPUI 0.2.2 Windows prototype for TRA-18 Round 1. All download states and diagnostics are local fixtures. No download backend is connected.

## Run

On Windows with the Rust MSVC toolchain and Windows SDK available:

```powershell
cargo run
```

The actual native window morphs between 80 × 80 Compact and 228 × 228 Full, including transparent shadow gutters. The blank Compact surface is 60 × 60; the Full surface is 200 × 200. Hover expands. Leaving an unlocked Full window starts the 80 ms grace period. Active tasks, drag, context menu, drop and terminal retention keep Full visible. Drag the surface to move the window.

The default `converged` motion preserves the approved A-soft travel (spring k520 / d40, smooth endpoint landing). Expansion retains the 2.5px / 170ms Surface settle; collapse uses a smaller 0.85px / 120ms settle. Native bounds stay within 80–228px, radius follows normal travel, and shadow uses normal travel dimensions without endpoint bounce. New target ownership begins at the event time, so prior idle time does not advance the first step of a new motion. Reduced motion immediately clears residual Surface motion. This build awaits human acceptance.

**B is the default Full magnetic behavior**, accepted by the user on 2026-10-08: a maximum 6px visual vector, late-expansion fade and the same Spring continuing into settled Full. Run `cargo run --release` without a magnetic flag to use it. Historical **A** remains an explicit fallback: a maximum 3px visual vector, approximately 1.08px at 30px edge distance, 2.5px at 14px and 3px at the perimeter, with 50ms exponential follow and 120ms smooth return. Its nearest-perimeter profile has a quiet centre beyond 56px edge distance. The cursor-reactive edge highlight and bloom were removed at the user’s request on 2026-10-08; they are not part of either behavior. Downloading/Ring colours and the static Surface border remain unchanged.

For explicit fallback or comparison, run `cargo run --release -- --magnetic a` or `cargo run --release -- --magnetic b`, then press **M** to alternate. Every toggle retires both behaviors' offsets and velocity before starting the selected behavior from rest. Selection is process-local and never writes a preference; each normal launch starts with B. `--hover off` suppresses either behavior for the Repair B comparison. Full magnetic only translates the existing single Surface/content/border/normal-shadow visual group. Native bounds, the 228px Full hitbox, and the unshifted rest anchor retain their existing owners.

**B** follows the single outer object in [Magnetic Nested](https://github.com/ibelick/motion-primitives/blob/main/app/docs/magnetic/magnetic-nested.tsx), using the versioned [Motion 11.12.0 spring generator](https://github.com/motiondivision/motion/blob/v11.12.0/packages/framer-motion/src/animation/generators/spring/index.ts). Its rest-centre vector is `d = pointer - [100,100]`, `r = length(d)`, with target `d * 0.12 * max(0, 1-r/200)`. Nested outer intensity 0.2 is scaled by 0.6, producing a natural 6px vector peak at r=100, then continuous falloff toward the native gutter and zero at r=200. Exact centre is zero, with nonzero nearby targets. Native-inside eligibility is unchanged; there is no sensing outside the HWND or independent inner-object motion.

Nested's `springOptions={bounce:0.1}` overrides its core physics defaults. B resolves each axis with Motion 11.12.0's default duration 800ms, mass 1, and damping ratio 0.9. Its `findSpring` coefficients use the current velocity converted to `-v/1000`, initial frequency guess `5/0.8`, and 11 Newton updates from the tagged source. At zero velocity this gives frequency 10.6010560649 rad/s, stiffness 112.3823896914, damping 19.0819009168. Position and its exact derivative are evaluated in f64 from the analytical underdamped solution; the presentation fields are rounded to f32. Coefficients are recalculated at a changed axis target, with velocity continuity. The independent axes finish at 800ms from their own last target change, snapping to target and zero velocity; unchanged axes never restart. Duration-resolved springs use this endpoint rather than an early rest-threshold stop.

B tracks from the start of Full intent when normal native pointer interaction is eligible, initially with zero visual weight. At each native render sample B first evaluates the outgoing active trajectories at the current time, then immediately starts changed axes from the capped unweighted position and analytical velocity. A new target after sleep begins at this input time, so prior idle time cannot advance it. There is no target queue, one-frame deferred start, numerical integration, or 50ms cap for this stable analytical B. Late callbacks evaluate the actual elapsed time and reach the 800ms endpoint. Repair B's existing 50ms cap, 4ms substeps and event-time ownership remain unchanged.

B target, raw Spring position and final visual vectors stay within 6 logical pixels, allowing only floating-point rounding at the presentation boundary. Raw output is projected radially, removing outward velocity while preserving tangent/inward velocity. Projection does not restart an unchanged analytical axis; subsequent retargets use its capped unweighted position and corrected velocity. This cap is a native adaptation absent from the reference. Native leave and drag/drop/menu locks aim B at zero while Full intent remains; the existing 80ms leave grace still owns collapse. Reversal toward Compact, Reduced Motion and `--hover off` immediately retire all B segments, raw position/velocity and visible offset. Settled Compact has no tracking or visible motion. A retains its existing settled-only suppression/return behavior.

Polish E adds a late-expansion visual fade without changing the Spring axes. It is driven by protected normal travel fullness `x`, excluding the Surface settle pulse: weight 0 for x≤0.9, weight 1 for x≥1, otherwise `u=(x-0.9)/0.1`, `w=6u^5-15u^4+10u^3`. Its exact time derivative is `w_dot=30u²(1-u)²/0.1 * fullness_velocity`, zero at both endpoints. Final offset is `w * spring_position`; final velocity is `w * spring_velocity + w_dot * spring_position`. Target updates remain unweighted, and no phase change resets or retargets a Spring. The same axes carry through landing, the entire expansion Surface settle and settled Full.

The onset follows the actual Repair B trajectory: a standalone probe of the unchanged Rust Motion at 4/16/33ms cadence shows normal Surface about 186px at fullness 0.9, leaving its last 14px growth for fade. At 16ms cadence onset is around 144ms, Full endpoint around 260ms, and rest around 432ms. Thus early travel remains visually fixed; fade reaches full weight at the normal endpoint, with zero derivative before the 170ms settle finishes. These timestamps describe a supplied-clock code trace, not native runtime timing guarantees. Full intent already owns hidden Spring motion before onset.

The native 228px window, 200px/r20 Full Surface and 14px gutters are unchanged. At maximum 6px translation the leading side has only about 8px shadow margin, and normal Surface settle can still add its existing size residual. Polish E native evidence confirmed a normal-shadow cutoff at the bottom HWND edge: Night 7/255 and Light 3/255 against the owned neutral backdrop. The experiment stopped and reported that conflict before user acceptance and authorization to adopt B. Default adoption does not fix the shadow or change the window bounds, shadow recipe or amplitude; the cutoff remains recorded as unresolved.

In `--measure` frame JSON, existing `hover` fields remain available. `variant` is `a` or `b`; `velocity` is B's final visual derivative in logical px/s (A reports `[0,0]`, not applicable). For revised B, `integrated_target` names the outgoing active axis targets evaluated **before retargeting**, with zero for inactive axes; `target_offset` names the latest pointer target. `step_ms` is elapsed time since the previous sample when any B segment was active, without a 50ms cap; it can exceed the remaining segment duration, whose evaluation finishes at 800ms. Sleep/new input and immediate suppression report 0. A's old-target follow telemetry and zero step_ms remain unchanged. `target_changed` compares consecutive selected-candidate targets. B `q` is target magnitude divided by 6; `distance` and `nearest_point` remain rest-perimeter diagnostics for both variants.

B telemetry also includes `tracking` (Full intent, enabled, non-RM), `full_intent`, `fade_weight`, `fade_velocity` (weight derivative per second), `spring_position`/`spring_velocity` (unweighted capped values), `axis_generation`, `axis_started_ms` (active segment timestamp or null) and `max_offset:6`. Existing `current_offset` is final visual offset, and `velocity` is its product-rule derivative. Axis generation increments only on changed target; it is retained across suppression and reset by the existing M candidate reset. Unchanged identity/start time through `settlephase` transitions proves the same Spring handoff. Existing frame `rawfullness`, travel `velocity`, `settlephase`, native bounds/anchor and shadow fields keep their original meanings. A telemetry is unchanged.

This is source-derived reference alignment with explicit adaptations, not browser scheduling equivalence. MotionValue estimates browser velocity from finite differences and schedules starts through `frame.update`; B uses an analytical derivative and the latest pointer sampled at native render time, without reconstructing mouse movement between callbacks. The source/lock reference is Motion 11.12.0; the live website's deployed version is not proven. Existing actual render interval, CPU/native and shadow measurements do not measure GPU presentation. The user accepted B's native feel and authorized its default adoption on 2026-10-08. Historical tanh/Euler B and settled-only analytical 3px B have recoverable source/executable snapshots in their tasks. Polish E baseline preserves the latter before this single 6px revision; a separate pre-adoption snapshot preserves the accepted B release with A still selected by default. The inherited GPUI Windows border alpha/AA defect remains open.

`--motion baseline`, `--motion a-soft`, `--motion a-crisp` and `--motion b` remain explicit historical comparison/recovery modes from Repair A, not alternate product defaults. The preserved Repair A executable and R1 snapshot remain the authority for their original visuals. `--motion converged` explicitly selects the current default. Measurement controls (`--measure`, `--native-metrics`, `--native-probe`, `--probe-period-ms`, `--dt`) remain diagnostic tools; normal window motion keeps the 50ms dt cap, 4ms integration substeps and native flags unchanged. These window-motion controls do not change analytical magnetic B.

Polish F changes only the Full/Compact Surface paint composition. Pinned GPUI 0.2.2's default style emits rounded background and border separately; on its Windows transparent target the repeated fringe coverage encounters additive target-alpha blending. A local canvas now submits the same fill and 1px solid border through one public `paint_quad(quad(...))`. The existing GPUI shader composites border over fill internally, then applies outer coverage once. Surface colours, Light border and Night white/15% border, clamped radii, logical bounds, the original 1px layout inset and pointer handlers retain their values. The canvas and all content remain in the existing magnetic visual group. Normal shadow and other UI painting retain their original paths. This candidate uses no custom AA mask, blur, thicker stroke, dependency or renderer patch. Native paired PNG/pixel and dynamic validation determine the repair result; code/build checks alone do not establish edge quality. The Windows global alpha blend and the separately deferred shadow tail remain unchanged, with other platforms/DPI pending actual verification.

## Local presentation controls

| Key | Action |
| --- | --- |
| `0` | Idle |
| `1` | Resolving |
| `2` | Downloading, fixture progress |
| `3` | Transcoding, fixture progress |
| `4` | Success, 1500 ms retention |
| `5` | Failure, 5000 ms retention |
| `T` | Light / Night |
| `R` | Toggle reduced motion |
| `M` | Alternate local magnetic A/B, clearing both candidates' residual motion |
| `+` / `-` | Progress fixture updates; progress does not move backwards |
| Right click | Local fixture menu |
| `Escape` | Close fixture menu |

The Failure copy icon places a clearly marked Phase 1 mock diagnostic on the clipboard. Reduced motion initially follows the Windows client-area animation preference.

## Verification

For the accepted default and explicit historical fallback, use `python scripts/polish_e_default_validate.py --exe target/release/ameow-next.exe --out evidence/polish-e-default/check`, add `--night` for Night or `--fallback` for explicit A. Historical Polish C/D scripts with 3px/default-A assertions remain paired with their preserved releases; they do not verify the current 6px default.

```powershell
cargo test
cargo fmt --check
cargo check
cargo clippy -- -D warnings
cargo build
python scripts/glow_removal_validate.py --exe target/release/ameow-next.exe --out evidence/glow-removal/current
python scripts/windows_validate.py
python scripts/windows_telemetry.py
python scripts/windows_cross_monitor.py
python scripts/windows_shadow.py
```

The Windows runtime script requires Python and Pillow. It launches its own executable with `CREATE_NO_WINDOW`, sends real pointer/keyboard input to its owned HWND, checks native rectangles, records per-frame telemetry, and captures only tight window crops or a compact state sheet. It closes only the process it launched. Because it moves the real pointer during the native workflow, do not interact with the prototype while it runs. Results, including failures, are stored in `evidence/windows-validation.json`.

Runtime evidence covers native geometry, surface anchor, hover reversal, real hitbox, task/menu locks, Success/Failure retention, reduced motion, screen-edge drag, clipboard copy, and the Light/Night state matrix. Read the actual JSON results; a successful build alone does not prove runtime behavior.

Polish C and hover-tune scripts/evidence are historical baseline records that require their preserved executables and original glow telemetry. Use `glow_removal_validate.py` for the current no-glow build; it checks both themes with real pointer input, fixed native bounds, retained magnetic follow, Reduced Motion, locks and collapse, and records lossless static-border crops.

`windows_telemetry.py` checks recorded native-frame observations, including viewport size, anchor rounding, monotonic progress, completed blue hold before orange, and actual retention timestamps. `windows_cross_monitor.py` performs a separate real drag onto a second attached monitor, using an owned neutral backdrop and a tight final-window crop. It records `NOT VERIFIED` when fewer than two monitors are present. Mixed-DPI behavior and OS file-drop runtime behavior remain unverified.

`windows_shadow.py` records a focused shadow-only follow-up for Full/Compact in both themes. `evidence/shadow-followup/shadow-sheet.png` supersedes shadow appearance in the earlier state matrix and GIFs; the earlier workflow results remain applicable. Its edge observations measure every native outer-edge pixel against the owned neutral backdrop, with a maximum allowed difference of 1/255.

macOS: **NOT VERIFIED**. This Phase 1 native adapter is Windows-only.

## Stage A Rust download engineering probe

The reusable `download` library now owns one immutable YouTube/Bilibili intent, pinned official runtime preparation, native Windows process settlement, format selection, ffprobe validation and atomic no-replace delivery. The ordinary prototype entry remains the existing UI. The opt-in same-app window and headless example use the identical coordinator; they are development probes rather than an accepted queue/product workflow.

Use an isolated Cargo target to preserve the accepted UI executable:

```powershell
$env:CARGO_TARGET_DIR = 'target/stage-a'
cargo build --bin ameow-next --example download_job
target/stage-a/debug/ameow-next.exe --download-test-bridge --url 'https://www.youtube.com/watch?v=jNQXAC9IVRw' --output 'D:/existing-output' --bridge-log 'D:/probe.jsonl'
target/stage-a/debug/examples/download_job.exe --url 'https://www.bilibili.com/video/BV1vL411G7N7' --output 'D:/existing-output' --quality balanced
```

Quality is `highest` (unlimited), `balanced` (1080p cap), or `saver` (480p cap). Maximum available resolution within the cap precedes H264, HEVC, VP9, AV1 codec preference at equal resolution. Bilibili anthologies require explicit `?p=N`; playlists/ambiguous identities fail before transfer. Canonical single-video URLs are required in Stage A. The output directory must already exist.

`--runtime-root` overrides the app-owned cache root (default `%LOCALAPPDATA%/AmeowNext/stage-a`); first preparation acquires only fixed HTTPS releases from the embedded manifest and verifies all hashes/version probes. No updater/PATH/config/default-plugin fallback is used. See `assets/runtime-notices.md` for provenance and licenses. Snapshot JSON records job/attempt/revision, retained workspace, diagnostics, settlement facts and `resources_released`. Close/Cancel wait for proved ownership release; Held keeps the window open until explicit Retry cleanup succeeds. `--safe-exit-after-ms` requests the same safe cancellation/close. Headless `--cancel-after-ms` requests cancellation once.

The engine supports explicit Direct or one static HTTP(S) proxy without URL-sensitive bypass. Automatic/PAC, scheme-dependent routes and URL-sensitive bypass fail with `E_NETWORK_ENGINE_ROUTE_UNSUPPORTED`; host network settings are never changed. Runtime HTTP redirects use read-only Windows URL resolution. Opaque engine requests/redirects cannot be resolved individually through WinHTTP, so no per-request PAC guarantee is claimed. On the current validation host, the static proxy has URL-sensitive bypass: both specified public samples fail at this Network Gate before site extraction, and real-site successful transfer remains **BLOCKED / NOT VERIFIED**.

Production tests are `tests/download_contracts.rs` and `tests/windows_process_supervisor.rs`, plus library ownership/fault tests. Genuine-runtime tests are opt-in (`--include-ignored`) with `AMEOW_RUNTIME_TEST_ROOT` pointing to a task-owned production-prepared cache. Synthetic FFmpeg media verifies the output boundary only; it does not substitute for the blocked public samples. The earlier packaged-provider EJS test remains explicitly offline/test-only. Stage B queue and Stage C portable distribution remain separately gated.
