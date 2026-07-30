## Scenario: Video Download Source Completion and Transcode Queue Contract

### 1. Scope / Trigger

- Trigger: Any change to backend download success handling, transcode queue state, transcode retry/remove commands, or transcode event payloads in `src-tauri/src/lib.rs`.
- Why this needs code-spec depth: The model now spans multiple runtime boundaries (`download worker` -> `download queue events` -> `transcode queue state` -> `frontend listeners`) and can silently regress if source-complete and transcode-complete semantics blur together again.

### 2. Signatures

Current command/event boundary signatures:

```rust
#[tauri::command]
async fn retry_transcode(app: AppHandle, trace_id: String) -> Result<bool, String>

#[tauri::command]
async fn remove_transcode(app: AppHandle, trace_id: String) -> Result<bool, String>

#[derive(serde::Serialize, Clone)]
struct VideoTranscodeQueueCountPayload {
    #[serde(rename = "activeCount")]
    active_count: usize,
    #[serde(rename = "pendingCount")]
    pending_count: usize,
    #[serde(rename = "failedCount")]
    failed_count: usize,
    #[serde(rename = "totalCount")]
    total_count: usize,
    #[serde(rename = "maxConcurrent")]
    max_concurrent: usize,
}

#[derive(serde::Serialize, Clone)]
struct VideoTranscodeTaskPayload {
    #[serde(rename = "traceId")]
    trace_id: String,
    label: String,
    status: VideoTranscodeTaskStatus, // "pending" | "active" | "failed"
    stage: Option<VideoTranscodeStage>, // "analyzing" | "transcoding" | "finalizing_mp4" | "failed"
    #[serde(rename = "progressPercent")]
    progress_percent: Option<f32>,
    #[serde(rename = "etaSeconds")]
    eta_seconds: Option<u64>,
    #[serde(rename = "sourcePath")]
    source_path: Option<String>,
    #[serde(rename = "sourceFormat")]
    source_format: Option<String>,
    #[serde(rename = "targetFormat")]
    target_format: Option<String>,
    error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct VideoTranscodeCompletePayload {
    #[serde(rename = "traceId")]
    trace_id: String,
    label: String,
    #[serde(rename = "sourcePath")]
    source_path: String,
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "sourceFormat")]
    source_format: Option<String>,
    #[serde(rename = "targetFormat")]
    target_format: String,
}
```

### 3. Contracts

- Source-complete boundary:
  - `video-download-complete` means the source file finished downloading successfully or failed terminally.
  - Successful `video-download-complete.file_path` must point to the downloaded source media path before any downstream transcode replacement happens.
  - Backend must emit `video-download-complete` before enqueueing any downstream transcode task for the same `traceId`.
- Download queue contract:
  - Existing `video-queue-count` / `video-queue-detail` remain the download queue contract.
  - They must not be widened to include transcode rows during Phase 1 backend work.
- Transcode queue contract:
  - `video-transcode-queue-count` reports `activeCount`, `pendingCount`, `failedCount`, `totalCount`, `maxConcurrent`.
  - `maxConcurrent` is always `1`.
  - `video-transcode-queue-detail.tasks` order is `active` -> `pending` -> `failed`.
  - Each detail row may expose `stage`, `progressPercent`, `etaSeconds`, `sourcePath`, `sourceFormat`, `targetFormat`, and `error`.
  - `targetFormat` is currently always `"mp4"`.
  - Failed transcode rows are operational queue state, not unbounded session history.
    - Backend must retain only the newest bounded set of failed rows.
    - Dropping old failed rows must not change event names or payload shape for retained rows.
- Scheduling contract:
  - At most one transcode may be active at a time.
  - Backend must not start a new transcode while download work is still blocking queue priority.
  - Any non-editing-compatible completed download source may enqueue a transcode task, regardless of legacy `aeFriendlyConversionEnabled`.
- Retry/remove contract:
  - `cancel_transcode(traceId)` only targets pending or active transcode rows for the matching `traceId`.
  - `cancel_transcode` must stop the current transcode flow and settle the row through the existing cancelled/removed path.
  - If GPU ffmpeg work was interrupted because of `cancel_transcode`, backend must not reinterpret that interruption as a GPU failure or start CPU fallback transcoding.
  - `retry_transcode(traceId)` only targets failed transcode rows.
  - `retry_transcode` must requeue the preserved local source path; it must not recreate a network download.
  - `remove_transcode(traceId)` only removes a failed transcode row from backend queue state.
  - `remove_transcode` must not delete the local source file.
- Completion contract:
  - `video-transcode-progress` represents the active transcode lifecycle.
  - Active ffmpeg transcode paths should run with streaming progress enabled (`-progress pipe:1 -nostats`) instead of waiting only on final process exit.
  - When media duration is known, backend should derive `progressPercent` from ffmpeg-reported processed time versus total duration.
  - When ffmpeg exposes `speed=`, backend should derive `etaSeconds`; if `speed=` is absent, backend may fall back to wall-clock throughput using processed media seconds divided by elapsed wall time.
  - `etaSeconds` is optional and must reset to `null` when a task is retried, fails, or transitions into a non-progress-reporting stage.
  - `video-transcode-complete.filePath` is the final replaced editing-compatible output path.
  - `video-transcode-failed.error` must be actionable text suitable for inline queue recovery UI.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Source download succeeds and file is already editing-compatible | Download success follow-up | `video-download-complete` fires, no transcode task is enqueued, editing handoff uses source path | Keep transcode queue unchanged |
| Source download succeeds and file is not editing-compatible | Download success follow-up | `video-download-complete` fires first, then `video-transcode-queued` / transcode queue state appears | Enqueue transcode task with same `traceId` |
| Probe for editing compatibility fails | Download success follow-up | Backend still queues fallback transcode instead of skipping silently | Emit transcode probe warning and queue task |
| ffprobe JSON probe succeeds | Media probe path | Summary includes duration when ffprobe returns `format.duration` | Request `duration` in `-show_entries` and parse it into `duration_seconds` |
| ffprobe unavailable or unsupported | Media probe fallback path | Backend may still derive duration from ffmpeg `Duration:` header | Parse fallback stderr header and keep `duration_seconds` optional |
| Download work is still active or pending | Transcode scheduler gate | No new transcode starts | Leave task pending until download pressure clears |
| Active ffmpeg transcode emits `out_time=` and `speed=` | Streaming progress path | Queue row updates incrementally with `progressPercent` and `etaSeconds` | Parse stdout progress lines and emit `video-transcode-progress` deltas |
| Active ffmpeg transcode lacks duration or speed | Streaming progress path | UI remains stable with stage-only or percent-only updates | Leave `progressPercent` / `etaSeconds` absent when indeterminate |
| `cancel_transcode` called for active GPU transcode | Command/runtime boundary | Backend kills ffmpeg, skips CPU fallback, and settles the task as cancelled/removed | Return `Ok(true)`, preserve source file, and emit cancellation removal events |
| Active transcode succeeds | Transcode worker | Queue row disappears from active state, `video-transcode-complete` emits final path, local AE handoff uses final path | Emit complete payload and remove active row |
| Active transcode fails | Transcode worker | Row remains visible as `failed` with `error` populated | Push task into failed section and emit `video-transcode-failed` |
| Failed transcode retention exceeds cap | Queue-state retention | Oldest failed rows are pruned while newest failed rows remain retryable/removable | Trim failed queue before emitting updated queue state |
| `retry_transcode` called for unknown trace | Command boundary | No crash, return `false` | Leave queue unchanged |
| `retry_transcode` called but source file is missing | Command boundary | Return `Err(String)` describing missing local source | Keep failed row intact |
| `remove_transcode` called for unknown trace | Command boundary | No crash, return `false` | Leave queue unchanged |
| `remove_transcode` called for failed trace | Command boundary | Failed row disappears, local source file remains on disk | Emit `video-transcode-removed` |

### 5. Good / Base / Bad Cases

- Good:
  - A `best` yt-dlp download finishes to `movie.mkv`, emits `video-download-complete` with `movie.mkv`, then enters the transcode queue and later emits `video-transcode-complete` with the editing-compatible MP4 replacement path.
  - A full ffmpeg transcode with known source duration emits incremental `video-transcode-progress` payloads such as `progressPercent=67.0` and `etaSeconds=83`, and the queue row reflects both.
  - A GPU transcode is actively running, the user clicks cancel, and the task emits the existing cancelled/removed queue transition without any CPU fallback attempt.
  - A direct-download MP4/H.264/AAC source emits `video-download-complete` and never creates a transcode row.
  - A failed transcode row is retried from the same local file and does not touch network download state.
- Base:
  - A transcode queue can be empty while the legacy download queue still works unchanged.
  - `video-transcode-progress` may omit `progressPercent` and/or `etaSeconds` when ffmpeg progress is indeterminate, as long as `stage` remains accurate.
- Bad:
  - Backend delays `video-download-complete` until after transcode completes, recreating the old inline-late-stage contract.
  - Backend requests ffprobe JSON without `format.duration`, so ETA silently disappears even when ffprobe is available.
  - Backend treats a user-cancelled GPU transcode as a generic ffmpeg failure and falls back to CPU transcoding.
  - Backend injects transcode rows into `video-queue-detail` and breaks the current Phase 1 frontend.
  - `remove_transcode` deletes the preserved local source file or causes the same task to silently reappear without user action.

### 6. Tests Required (with assertion points)

- Compile/type:
  - `cargo check` passes after adding `etaSeconds` to the transcode payload structs/events and wiring streaming ffmpeg progress.
- Download success handoff:
  - Complete an editing-compatible source and assert `video-download-complete` fires with no `video-transcode-queued`.
  - Complete a non-editing-compatible source and assert `video-download-complete` arrives before transcode queue/progress events for the same `traceId`.
- Failed queue retention:
  - Force more failed transcodes than the retention cap and assert `failedCount` stops at the cap.
  - Assert `video-transcode-queue-detail.tasks` keeps only the newest failed rows in `failed` section order.
  - Assert retained failed rows still support `retry_transcode` and `remove_transcode`.
- Parsing/unit:
  - Add unit tests for ffprobe duration parsing, ffmpeg fallback `Duration:` parsing, and ffmpeg `out_time=` / `speed=` progress parsing.
- Scheduler:
  - Queue multiple downloads plus a transcode candidate and assert no new transcode starts while download work is still blocking priority.
  - Queue multiple transcode candidates and assert only one active transcode row exists at a time.
- Recovery:
  - Start an active GPU transcode, call `cancel_transcode`, and assert the task emits cancelled/removed state without any CPU fallback transcode starting.
  - Force one transcode failure, call `retry_transcode`, and assert the failed row becomes pending/active without any new download row.
  - Force one transcode failure, call `remove_transcode`, and assert the row disappears while the local source file remains on disk.
- Completion:
  - Complete a transcode and assert `video-transcode-complete.filePath` points to the final replaced output path.

### 7. Wrong vs Correct

#### Wrong

```rust
command.args([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_entries",
    "format=format_name:stream=codec_type,codec_name",
]);

run_ffmpeg_capture_output(&app, ffmpeg_args, "ffmpeg task", Some(trace_id)).await?;
```

#### Correct

```rust
command.args([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_entries",
    "format=format_name,duration:stream=codec_type,codec_name",
]);

run_ffmpeg_with_transcode_progress(
    &app,
    with_ffmpeg_progress_pipe_args(ffmpeg_args),
    trace_id,
    VideoTranscodeStage::Transcoding,
    duration_seconds,
)
.await?;
```

---
