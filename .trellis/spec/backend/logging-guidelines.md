# Logging Guidelines

> How logging is done in Ameow backend.

---

## Overview

Ameow uses runtime-owned logging with a consistent `>>>` prefix for human-facing terminal output.

- Rust/Tauri paths use `println!`.
- Electron main paths use `console.log/info/warn/error`, but the emitted message should still follow the `>>> [Scope] ...` shape when it is meant for terminal diagnostics.
- Support-log export must include recent runtime output, not only static config snapshots.

---

## Log Format

**Standard format:**
```rust
println!(">>> [Rust] {action}: {details}");
```

**Examples from codebase:**
```rust
println!(">>> [Rust] Receiving files to process: {:?}", paths);
println!(">>> [Rust] Target directory: {:?}", final_target_dir);
println!(">>> [Rust] Downloading image from: {}", url);
println!(">>> [Rust] Saved to: {:?}", dest_path);
println!(">>> [Rust] Saving data URL");
```

*Reference: `src-tauri/src/lib.rs:120-215`*

Electron main example:

```ts
console.log(`>>> [Electron] ${message}`);
console.error(">>> [WS] Server error:", error);
```

---

## Support Log Export Contract

Source of truth:
- `electron/main.mts`
- renderer trigger: `src/pages/SettingsPage.tsx`
- command name: `export_support_log`

Required exported sections:

```text
[environment]
[settings]
[runtime]
[recent-runtime-log]
```

Rules:
- `export_support_log` must write the support file into `getLogsDir()`.
- The exported file must include `runtimeLogPath=<...>` in `[environment]`.
- `[recent-runtime-log]` must contain recent runtime lines from the durable runtime log file/buffer, not only derived status JSON.
- If no runtime lines are available yet, write a clear placeholder such as `<no runtime log lines captured>`.

Current runtime log sources:
- Electron main `console.log/info/warn/error`
- renderer `webContents.on("console-message", (details) => ...)`
- non-progress `yt-dlp` child-process output

Do not include:
- sensitive payloads such as raw cookies or tokens
- every progress marker line from `__AMEOW_PROGRESS__=...`
- repeated queue/UI chatter already represented by structured events

---

## What to Log

- Function entry with parameters
- Target paths and directories
- Download URLs
- File save locations
- Important state changes

---

## What NOT to Log

- Sensitive data (passwords, tokens)
- Full file contents
- High-frequency events (mouse moves)
- Internal loop iterations
- Repetitive UI positioning chatter such as `set_window_position(...)`
- Queue count/detail chatter on every progress tick when the same state is already represented by structured events

## High-Frequency CLI Progress

For streaming sidecar tools such as `yt-dlp` and `ffmpeg`, do not emit every progress tick as its own `println!` line.

Why:
- CLI download/transcode progress can update dozens of times per second.
- Per-line logging makes PowerShell/CMD scroll aggressively and hides actual warnings/errors.

Preferred pattern:

```rust
if is_terminal_progress_output_line(line) {
    render_terminal_progress_line(">>> [yt-dlp] ...");
} else {
    finish_terminal_progress_line();
    println!(">>> [yt-dlp] {}", line);
}
```

Rules:
- Use single-line carriage-return refresh for progress-only output.
- Call `finish_terminal_progress_line()` before printing a normal log line or returning from the loop.
- Keep the runtime log/event pipeline as the durable source of truth; terminal single-line progress is only a developer-facing convenience.
- For known transient retry diagnostics from sidecars, prefer suppressing duplicate raw terminal warnings when the backend already records them in buffers/runtime logs and handles them through a structured retry path.
