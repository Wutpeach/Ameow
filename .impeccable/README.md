# Impeccable context for Ameow Next

Updated 2026-11-03. This is context maintenance, not a UI redesign or a new product acceptance.

## Authority and scope

- Root `PRODUCT.md` and `DESIGN.md` describe the current `ameow-next/` Rust / GPUI desktop application. They are the single active product and design record in this worktree.
- Root `src/`, `electron/`, and the root npm scripts describe frozen Electron reference code. `site/` is the documentation website; neither inherits the Next visual system as a design mandate. Give either surface its own context before doing design work there.
- The previous root product record, design record and sidecar are preserved byte for byte in `archive/electron-2026-05-23/`. The date identifies their last design commit, not their archive date. Do not load that archive as current guidance.
- The existing metaphor, “桌面边缘控制台”, is retained as descriptive language. No new visual direction, font, palette, animation, or product claim was approved by this repair.

## Version and native desktop limitation

Checked with Impeccable Skill 4.8.0 and engine 0.1.18. The Cindy and supplied Magpie `SKILL.md` and Doctor reference files had identical SHA-256 hashes. No Skill installation was changed.

This engine recognizes only `web`, `ios`, `android`, and `adaptive` in `## Platform`. The product's factual value is `desktop`; the engine consequently reports `platform: null`. That is an engine coverage limit, not permission to treat GPUI as web or mobile. Do not substitute `adaptive`: that value loads iOS/Android guidance.

The root remains the context root, deliberately, so ordinary invocations and `--target ameow-next/src/<file>.rs` share one record. No speculative `projectRoots` or duplicate child PRODUCT/DESIGN record is needed. Verify resolved paths with `doctor --json --target ameow-next/src/main.rs`.

## Surface briefs

Use the launcher's `surface-brief list` and `surface-brief read <target>` to inspect the three Operate briefs: main floating surface, settings, and queue. They describe existing behavior and verification needs, not authorization for new UI work. A shared file may implement several surfaces; mappings intentionally avoid ambiguous ownership. Name the target component when working in `download_ui.rs`.

## Hook and verification

The current design detector and automatic hook target web source extensions, not Rust / GPUI. Keep this project's Impeccable hook disabled through `impeccable hooks off`; do not register `.rs` as an HTML/text template merely to obtain a clean detector result. Existing Trellis hooks remain intact.

For native changes, inspect source contracts and the actual native window in light/dark themes, at the relevant DPI, language, keyboard state, and motion preference. Use existing focused checks where relevant. A documentation repair does not require rebuilding or launching the app.

Sidecar HTML/CSS snippets are labeled illustrative translations of GPUI primitives for the design panel. They are not production components, native rendering evidence, or an alternative implementation authority.

Doctor's `design-md-drift` uses the last committed DESIGN.md date and counts `src`, `site`, and `public` commits, not `ameow-next` commits. An uncommitted documentation refresh may keep that historical warning until committed. Do not create a commit or disable staleness checks just to clear it.

`buildPath` remains intentionally unset. These three application surfaces are Operate and are code-led regardless of that setting. No landing-page/showcase default was chosen in this maintenance task; a future Persuade/Experience request can make that choice when image generation is available. The current Doctor may report `config-build-path-unset` merely because briefs exist.
