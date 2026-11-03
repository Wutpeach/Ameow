# Product: Ameow Next

<!-- impeccable:product-schema 1 -->

Updated 2026-11-03 from the existing product record and current repository evidence. This is an incremental context refresh, not a new positioning, redesign, release, or acceptance decision.

## Platform

desktop

The active implementation is a native Rust / GPUI desktop application, currently developed and evaluated on Windows. macOS-specific branches in the source are not proof of a verified macOS product.

Impeccable 4.8.0 / engine 0.1.18 has no native desktop platform enum: it resolves this factual value to `null`. Do not relabel this project as web, iOS, Android, or adaptive to satisfy the parser. See `.impeccable/README.md`.

## Users

Ameow is for desktop users who need a low-friction way to collect material into a controlled output folder during lightweight, frequent work. The existing product record identifies creators and operators as example users, not measured audience research.

## Product Purpose

Keep a compact collector available at the desktop edge while the user works elsewhere. In Next, users submit download sources, see preparation and transfer state, manage a queue, and find their output without keeping a large application window open.

The legacy product scope includes files, images and web video. This context refresh does not claim every Electron intake or browser-extension feature has been ported to Next.

## Positioning

The established mechanism is a persistent compact floating surface that expands to expose task state and controls, with a queue, tray entry and separate settings window. This is a description of the implementation, not a claim of market uniqueness, speed superiority, or user adoption.

## Operating Context

- Work continues in other desktop applications; Ameow should expose task state without taking over the user's main workspace.
- Current native sources are under `ameow-next/`; root `src/` and `electron/` are frozen reference code, and `site/` is the documentation website. Root npm development commands launch the historical Electron application.
- Next provides a floating main surface, an in-surface queue and menu, a tray, and settings pages for general preferences, downloads, components and about information.
- Users can choose light/dark/system appearance and Simplified Chinese/English/system language. Availability of a setting in source is not evidence that every OS configuration has been accepted.
- Download preparation, component updates, connectivity failures and cleanup waits are normal states to explain within the task flow.

## Capabilities and Constraints

- Rust / GPUI is the current development line; see `.trellis/spec/index.md` and `ameow-next/Cargo.toml`.
- Queue snapshots and coordinator command replies supply UI state. Presentation does not own download outcomes, runtime selection or persistence.
- Settings expose output location, quality/preferences, component status, update/recovery actions and diagnostics. Actions must reflect their actual pending, disabled, failure and recovery states.
- UI-only documentation does not authorize changes to download, process, security or persistence contracts.
- Scope and product acceptance remain separate from evidence that code or a setting exists. Native macOS behavior and complete feature parity remain unclaimed here.

## Brand Commitments

Preserve the name Ameow and its existing brand assets under `ameow-next/assets/brand/`. The previous product record's personality—compact, intentional, polished, utility-first and calm under pressure—is retained. “Slightly neon” describes restrained state feedback, not a requirement to restore Electron gradients or hover glow.

The current visual rules and source-specific exceptions belong in `DESIGN.md`, not in this product record.

## Evidence on Hand

- Product-line authority: `.trellis/spec/index.md` and `.trellis/spec/rust/index.md`.
- Implementation: `ameow-next/src/main.rs`, `tokens.rs`, `model.rs`, `download_ui.rs`, `settings_window.rs`, `settings_components.rs`, and `tray.rs`.
- Runtime and queue boundaries: the applicable Rust contract links in the Rust spec index.
- Existing assets and capture/check helpers: `ameow-next/assets/` and `ameow-next/scripts/`. A helper's existence is not a passing result.
- The 2026-11-03 Doctor review compared source and context files; it did not perform a new native visual acceptance. Prior Electron product/design records are preserved under `.impeccable/archive/electron-2026-05-23/`.
- No customer counts, testimonials, comparative benchmarks or new distribution promises are established by this record.

## Product Principles

1. Keep frequent collection work available with little interruption to the user's primary desktop task.
2. Present real task and component state, including pending work and safe-cleanup limits.
3. Keep immediate controls compact, and move detailed preferences and diagnostics to the relevant secondary surface.
4. Preserve queue/runtime authority and user choices across presentation changes.
5. Use current Next implementation and scoped native evidence when evaluating behavior; historical Electron guidance does not imply feature parity.

## Accessibility & Inclusion

Preserve the implemented Chinese fallback fonts, language selection, keyboard focus/navigation and reduced-motion paths. Native visual and interaction checks must cover the relevant language, DPI and motion state. No formal accessibility conformance claim is established by this documentation.
