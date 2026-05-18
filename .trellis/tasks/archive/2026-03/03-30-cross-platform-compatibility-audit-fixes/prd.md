# Cross-platform Compatibility Audit and Fixes

## Goal
Audit FlowSelect's Windows and macOS compatibility boundaries, reproduce cross-platform defects with automated tests where possible, and implement minimal fixes that reduce macOS-specific and mixed-platform regressions before the app is tested on real macOS hardware.

## Requirements
- Review Electron main, preload/runtime utilities, packaging scripts, and cross-platform helpers for Windows/macOS assumptions.
- Prioritize defects that can break startup, path handling, runtime downloads, packaging, or core window behavior on macOS.
- Add regression tests before each concrete fix whenever the issue can be reproduced in unit/integration tests.
- Keep fixes minimal and aligned with existing desktop bridge and runtime contracts.
- Report any gaps that cannot be fully validated on the current Windows machine.

## Acceptance Criteria
- [ ] At least one concrete cross-platform defect is identified and reproduced with an automated test before the fix.
- [ ] The chosen defect is fixed with minimal changes.
- [ ] Relevant automated tests pass after the fix.
- [ ] Broader verification runs succeed or any limitations are reported explicitly.
- [ ] Remaining macOS-specific risks are summarized for future on-device validation.

## Technical Notes
- Current development/test/build host is Windows; macOS verification must rely on static analysis plus platform-agnostic automated tests unless a fix is directly testable.
- Focus on runtime path handling, platform gating, packaging contracts, and Electron window/runtime behavior that differs across Windows and macOS.
- `ace-tool` is not available in this session, so repository search falls back to `rg` plus direct inspection.
