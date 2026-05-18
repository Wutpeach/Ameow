# Disable Auto Rename by Default and Add Manual Toggle

## Goal
Make media downloads preserve source filenames by default, and allow users to manually enable rename behavior from Settings.

## Requirements
- Replace the current Settings toggle label "Save Videos to Separate Folder" with a rename-focused setting.
- New users (no config key) should have rename disabled by default.
- Video downloads should preserve source title/name when rename is disabled.
- Image downloads should preserve source filename when rename is disabled whenever a source name is available.
- Existing separate-folder behavior should not be controlled by the renamed toggle.

## Acceptance Criteria
- [ ] Settings page shows a toggle for enabling rename behavior.
- [ ] With no rename config present, video and image downloads prefer source names.
- [ ] Enabling rename makes downloaded media use sequence-number style naming.
- [ ] Config read/write remains backward compatible and does not break existing users.

## Technical Notes
- Introduce a dedicated config key for rename behavior and avoid coupling with `videoSeparateFolder`.
- Keep robust fallback naming when source filename is unavailable.
- Minimize scope to settings + download naming logic.

## Code-Spec Depth (Cross-Layer Contract)

### Contract
- Config key: `renameMediaOnDownload` (boolean)
- Default when missing: `false` (rename disabled)
- Behavior mapping:
  - `false` -> preserve source name when available
  - `true` -> sequence-number naming
- Backward compatibility:
  - For video path, if `renameMediaOnDownload` missing but legacy `videoKeepOriginalName` exists, infer rename from legacy value (`rename = !videoKeepOriginalName`).

### Validation & Error Matrix
- Missing config key -> should default to preserve-source-name behavior.
- Invalid/missing source filename -> should fallback to sequence-number naming.
- Legacy config only (`videoKeepOriginalName`) -> should keep prior user intent.
- Config parse error -> command returns descriptive Rust error via existing `Result<_, String>` flow.

### Good/Base/Bad Cases
- Good: `renameMediaOnDownload=false`, URL has filename -> saved as source filename.
- Base: `renameMediaOnDownload=true` -> saved as sequence number.
- Bad: source filename is empty/invalid -> fallback sequence name, no panic.
