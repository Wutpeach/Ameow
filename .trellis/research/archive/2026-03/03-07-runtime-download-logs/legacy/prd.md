# Persist lightweight runtime download logs

## Goal
Capture enough runtime download history to diagnose user issues without materially increasing system load.

## Requirements
- Persist a lightweight runtime log under the app logs directory.
- Record high-value download lifecycle events and sampled progress updates rather than every stdout line.
- Reuse the existing support-log export flow and append a recent runtime-log excerpt.
- Keep log file size bounded with simple rotation.
- Never fail app features if runtime-log writing fails.

## Acceptance Criteria
- [ ] Download start/route/progress/terminal events are appended to a runtime log file.
- [ ] Progress logging is sampled to avoid excessive IO.
- [ ] `export_support_log` includes a recent runtime-log tail when available.
- [ ] Runtime logging failures degrade silently except for stdout diagnostics.

## Technical Notes
- Use append writes to `logs/runtime.log` with size-based rotation.
- Track last-emitted progress per trace id in memory.
- Sanitize log lines by collapsing newlines.
