# Claude Review

## Summary

Claude agreed with the Phase 2 direction: keep one logical motion/geometry model, but do not force Electron `BrowserWindow` bounds into a renderer Motion runtime. Motion for React should remain the renderer visual executor, while Electron main remains the native bounds executor.

## Must-Fix Architecture Invariants

- Do not use per-frame renderer-to-main IPC to drive native window bounds from Motion, react-spring, GSAP, or Web Animations API.
- Keep transition-token protection across native and visual executors.
- Add shared timing to the geometry/motion plan so native bounds and visual shell do not silently drift through different durations or easing.
- Cancel or ignore stale compact visibility/clamping moves when a newer expand transition starts.

## Design Adjustments

- Geometry should remain spatial. It can describe hotspot frame and radii, but should not own hotspot active/inactive state.
- Shell phase and interaction mode should decide when hotspot evaluation is active.
- macOS shadow gutter needs explicit modeling, including intermediate morph states before any visual tuning.
- Panel shadow ownership needs a decision before visible tuning: either keep it behavior-equivalent for the first milestone or move it under the visual motion owner later.

## Framework Conclusion

Changing animation frameworks does not materially improve native window morph safety. Every renderer-side framework faces the same Electron main-process boundary. The safer architecture is:

- Motion for React for renderer visual shell
- Electron main `animateBounds` adapter for native bounds
- one shared geometry/timing contract between them

## Validation Additions

- Geometry inset/shadow consistency tests for Windows and macOS.
- Stale native and visual completion tests.
- Timing contract tests.
- Compact visibility move cancellation tests.
- Hotspot hysteresis and lifecycle tests.
