## Scenario: Browser Extension WS `sync_download_preferences` Contract

### 1. Scope / Trigger

- Trigger: Browser extension `background.js` sends `sync_download_preferences` when the desktop WebSocket connects or when extension local-storage preference keys change.
- Why this needs code-spec depth: This is the contract that keeps desktop-side pasted-link downloads aligned with extension popup settings even before the next `video_selected_v2` request.

### 2. Request Signature

Request action:

```json
{
  "action": "sync_download_preferences",
  "data": {
    "ytdlpQualityPreference": "balanced"
  }
}
```

### 3. Field Contracts

- Source files:
  - Extension sender: `browser-extension/background.js`
  - Extension storage keys: `browser-extension/direct-download-quality.js`
  - Rust receiver + config persistence: `src-tauri/src/lib.rs`
- `data.ytdlpQualityPreference`:
  - Optional string.
  - Accepted values: `"best"`, `"balanced"`, `"data_saver"`.
  - When valid, Rust must write config key `defaultVideoDownloadQuality`.
- `data.aeFriendlyConversionEnabled`:
  - Optional boolean.
  - Deprecated legacy field from older extension builds.
  - Current extension flows should not send it after popup AE-toggle removal.
  - When present, Rust may still write config key `aeFriendlyConversionEnabled` as a backward-compatibility field.
- At least one of the two fields must be present; otherwise the WS action must fail.
- Rust response payload should echo the resolved stored quality in `data.quality`; it may continue echoing `data.aeFriendlyConversionEnabled` while backward compatibility remains.

### 4. Validation & Error Matrix

| Condition | Backend Behavior |
|-----------|------------------|
| Valid quality only | Persist `defaultVideoDownloadQuality`; keep existing AE flag |
| Valid AE flag only | Persist `aeFriendlyConversionEnabled`; keep existing quality; do not let the flag bypass transcode queue creation |
| Both fields valid | Persist both and return stored values |
| Neither field present | Return `success: false` with descriptive error |
| Config parse / serialize / write failure | Return `success: false` with descriptive error |

### 5. Good / Base / Bad Cases

- Good:
  - Current extension connects, sends a quality-only sync action once, and a subsequent pasted-link download uses the synced quality.
  - Changing popup quality triggers storage change sync without needing a browser-triggered download first.
- Base:
  - Older extension builds may still sync one field at a time, and Rust preserves the missing field from current config.
- Bad:
  - Current extension still depends on the removed AE storage key to trigger sync, leaving quality-only changes stale.
  - Extension changes local storage but never sends sync, leaving pasted-link downloads stale.
  - Rust accepts an empty payload and silently keeps unknown state.

### 6. Tests Required (with assertion points)

- Connection sync:
  - Start desktop app, let extension connect, and assert one quality-only `sync_download_preferences` request is emitted from `background.js`.
- Storage-change sync:
  - Change quality in popup and assert a follow-up `sync_download_preferences` request is sent without waiting for `video_selected_v2`.
- Rust persistence:
  - After sync, inspect config or support log and assert `defaultVideoDownloadQuality` was updated; a legacy `aeFriendlyConversionEnabled` value may remain unchanged when not sent.
- Main-window behavior:
  - After sync only, paste a supported video URL into the desktop app and assert the download path reflects the stored quality/container choice.
- Backward compatibility:
  - Simulate an older sync payload that still includes `aeFriendlyConversionEnabled` and assert Rust still accepts it.

---
