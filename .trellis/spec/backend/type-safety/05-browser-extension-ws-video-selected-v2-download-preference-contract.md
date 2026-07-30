## Scenario: Browser Extension WS `video_selected_v2` Download Preference Contract

### 1. Scope / Trigger

- Trigger: Browser extension sends `video_selected_v2` over WebSocket to queue a desktop video download.
- Why this needs code-spec depth: Quality preference and the deprecated AE compatibility flag cross the extension-storage -> WS payload -> Rust queue/finalization boundary and can silently drift.

### 2. Request Signature

Request action:

```json
{
  "action": "video_selected_v2",
  "data": {
    "url": "https://example.com/watch?v=123",
    "pageUrl": "https://example.com/watch?v=123",
    "title": "Example",
    "ytdlpQualityPreference": "best"
  }
}
```

### 3. Field Contracts

- `data.ytdlpQualityPreference`:
  - Optional string.
  - Accepted values: `"best"`, `"balanced"`, `"data_saver"`.
  - If present and valid, it overrides the desktop app's persisted preference for this queued download.
  - If present and valid, Rust must also persist it to config key `defaultVideoDownloadQuality` for future paste / queue defaults.
  - Missing/invalid values must fall back to the desktop app's persisted preference.
- `data.aeFriendlyConversionEnabled`:
  - Optional boolean.
  - Deprecated legacy compatibility field after popup AE-toggle removal in Phase 3.
  - Current extension popup/background flows should not send it.
  - If present from an older client, Rust may still persist it to config key `aeFriendlyConversionEnabled` for backward compatibility and support-log visibility.
  - It must not suppress the new transcode-queue model: `video-download-complete` still represents source download completion, and any non-editing-compatible source may enqueue a transcode task regardless of this flag.
- Direct-download and yt-dlp success paths both follow the same source-first completion model; downstream transcode queueing is no longer a yt-dlp-only inline tail.
- Desktop defaults used by `download_video` / `queue_video_download`:
  - Read from `src-tauri/src/lib.rs` persisted config keys `defaultVideoDownloadQuality` and `aeFriendlyConversionEnabled`.
  - Current extension flows actively sync only `defaultVideoDownloadQuality`; `aeFriendlyConversionEnabled` may remain in config as a legacy field but is no longer user-configurable from the popup.
  - If no preference has been synced yet, default to `balanced` + `false`.

### 4. Validation & Error Matrix

| Condition | Backend Behavior |
|-----------|------------------|
| Current extension payload with valid quality only | Persist `defaultVideoDownloadQuality`, keep the legacy AE flag unchanged if the field is absent, emit `video-download-complete` for the source file, then enqueue transcode if the source is not editing-compatible |
| Legacy payload with valid quality + `aeFriendlyConversionEnabled` | Preserve quality routing, persist both values, emit `video-download-complete` for the source file, then enqueue transcode if the source is not editing-compatible |
| Invalid/missing quality value | Use persisted `defaultVideoDownloadQuality` value |
| No persisted config keys yet | Use desktop fallback `balanced` + `false` |

### 5. Good / Base / Bad Cases

- Good:
  - Current extension sends only `ytdlpQualityPreference`, Rust queues the download successfully, and later pasted-link downloads reuse the synced quality.
  - Older extension payloads that still include `aeFriendlyConversionEnabled` remain accepted for backward compatibility.
- Base:
  - Desktop app has never received a preference sync and pasted-link downloads use `balanced` + `false`.
- Bad:
  - Current extension continues sending an `aeFriendlyConversionEnabled` field even though the popup no longer exposes that setting.
  - Rust still lets `aeFriendlyConversionEnabled=false` bypass transcode queue creation and silently revives the old inline/skip split.
  - Rust falls back to `Best` for pasted-link downloads and reintroduces unintended `mkv` output when the user selected `Balanced` in the extension.

### 6. Tests Required (with assertion points)

- WebSocket payload:
  - Trigger one current extension `video_selected_v2` request and assert the request succeeds when the payload includes `ytdlpQualityPreference` but omits `aeFriendlyConversionEnabled`.
  - Simulate one older extension `video_selected_v2` payload with `aeFriendlyConversionEnabled` present and assert the backend still accepts it without changing transcode-queue semantics.
- Persistence + paste path:
  - Set extension quality to `Balanced`, reconnect extension or change the popup setting, then paste a Bilibili URL into the main window and assert the queued yt-dlp run uses `balanced` instead of `best`.
  - Set extension quality to `Highest`, reconnect extension or change the popup setting, then paste a supported video URL and assert the queued yt-dlp run uses `best`.
- source-complete vs transcode handoff:
  - With the current quality-only payload, complete a non-editing-compatible yt-dlp download and assert `video-download-complete` fires before any `video-transcode-progress` / `video-transcode-complete` activity.
  - With the current quality-only payload, complete an already editing-compatible download and assert no transcode task is enqueued.
- Backward compatibility:
  - Send or simulate an older `video_selected_v2` payload with or without `aeFriendlyConversionEnabled` and assert the backend still completes successfully.

---
