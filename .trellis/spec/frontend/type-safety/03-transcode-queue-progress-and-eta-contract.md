## Scenario: Transcode Queue Progress And ETA Contract

### 1. Scope / Trigger

- Trigger: Any change to `src/App.tsx` transcode queue listeners, transcode payload typing, queue-row status formatting, or the main floating-window primary transcode summary.
- Why this needs code-spec depth: The transcode queue is a cross-layer runtime contract (`Rust` events -> typed listeners -> React normalization -> queue/floating-window rendering) where optional progress and ETA fields can drift silently and degrade into stale or misleading UI.

### 2. Signatures

Shared frontend payload type:

```ts
type VideoTranscodeTaskPayload = {
  traceId: string;
  label: string;
  status: "pending" | "active" | "failed";
  stage?: "analyzing" | "transcoding" | "finalizing_mp4" | "failed" | null;
  progressPercent?: number | null;
  etaSeconds?: number | null;
  sourcePath?: string | null;
  sourceFormat?: string | null;
  targetFormat?: string | null;
  error?: string | null;
};
```

Typed listeners in `src/App.tsx`:

```ts
const unlistenDetail = listen<VideoTranscodeQueueDetailPayload>(
  "video-transcode-queue-detail",
  (event) => { ... },
);

const unlistenProgress = listen<VideoTranscodeTaskPayload>(
  "video-transcode-progress",
  (event) => { ... },
);
```

Formatting helpers:

```ts
const formatEtaClock = (etaSeconds: number): string => { ... };
const getTranscodeEtaLabel = (etaSeconds?: number | null): string | null => { ... };
const getTranscodeTaskStatusText = (
  task: VideoTranscodeTaskPayload,
  options?: { includePercent?: boolean },
): string => { ... };
```

### 3. Contracts

- Listener typing contract:
  - `video-transcode-queue-detail`, `video-transcode-progress`, `video-transcode-failed`, `video-transcode-queued`, `video-transcode-retried`, and `video-transcode-removed` must all use the shared `VideoTranscodeTaskPayload` shape.
  - Frontend must keep `etaSeconds` optional and accept both missing and `null` payloads.
- Normalization contract:
  - `normalizeVideoTranscodeTask(...)` must clamp `progressPercent` into `0..100` when numeric, else normalize to `null`.
  - `normalizeVideoTranscodeTask(...)` must normalize `etaSeconds` into a non-negative integer when numeric, else normalize to `null`.
  - Optional string fields such as `sourcePath`, `sourceFormat`, `targetFormat`, and `error` must be trimmed or normalized to `null`.
- Queue row rendering contract:
  - Active queue rows should show percent when `progressPercent` is available.
  - Active queue rows should append ETA text when `etaSeconds` is available.
  - Pending rows remain a waiting state; failed rows remain stage/error-driven and must not fabricate ETA.
- Main floating-window contract:
  - The primary transcode summary in the floating window should reuse the same status helper, but may omit the numeric percent to keep the compact UI readable.
  - The floating window must still tolerate `etaSeconds=null` and fall back to stage-only text.
- Copy/i18n contract:
  - ETA rendering should reuse the existing `desktop:app.downloadStatus.eta` string contract instead of introducing a second parallel ETA label for transcode.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Backend omits `etaSeconds` | Listener + render path | Queue and floating window still render stable stage text | Normalize to `null` and skip ETA label |
| Backend sends fractional or negative ETA | `normalizeVideoTranscodeTask(...)` | UI shows safe whole seconds or hides ETA | Clamp/floor positive values, else normalize to `null` |
| Backend sends percent outside `0..100` | `normalizeVideoTranscodeTask(...)` | Queue progress ring/text stays valid | Clamp into `0..100` |
| Queue row renders active transcode without percent | `getTranscodeTaskStatusText(...)` | Stage text still appears | Join stage and ETA without fabricating percent |
| Floating window shows verbose queue-row text | Main progress summary | Compact primary status remains readable | Call `getTranscodeTaskStatusText(task, { includePercent: false })` |
| Listener uses `any` or ad hoc shape | TS review / compile | Cross-layer drift reaches runtime | Reuse `VideoTranscodeTaskPayload` and typed `listen<T>()` |

### 5. Good / Base / Bad Cases

- Good:
  - Active queue row renders `67% · Transcoding · ETA 1:23` when both progress and ETA are present.
  - Floating window renders `Transcoding · ETA 1:23` for the same task, omitting percent for readability.
  - A failed transcode continues to render failed-stage text with no ETA.
- Base:
  - Analyzing/remux paths may render stage-only text if progress or ETA is unavailable.
  - Pending rows still render the waiting label with no extra timing hints.
- Bad:
  - Frontend treats missing `etaSeconds` as `0` and shows a misleading `ETA 0:00`.
  - Queue rows and floating window use different payload shapes or incompatible formatting rules.
  - Frontend creates a new transcode-only ETA translation key and drifts from the existing download ETA copy without product intent.

### 6. Tests Required (with assertion points)

- Type checks:
  - `npm run type-check` passes with typed transcode listeners and no `any` at the Tauri boundary.
  - `VideoTranscodeTaskPayload` includes optional `etaSeconds` everywhere the shared type is used.
- Runtime checks:
  - Start a full transcode and verify queue rows update from stage-only text to percent + ETA while ffmpeg runs.
  - Verify the floating window primary transcode summary shows ETA when available and falls back to stage-only text when not.
  - Retry or fail a transcode and verify ETA disappears instead of persisting stale timing.

### 7. Wrong vs Correct

#### Wrong

```ts
const unlistenProgress = listen<any>("video-transcode-progress", (event) => {
  const eta = event.payload.etaSeconds ?? 0;
  setStatus(`ETA ${eta}`);
});
```

#### Correct

```ts
const unlistenProgress = listen<VideoTranscodeTaskPayload>(
  "video-transcode-progress",
  (event) => {
    const normalized = normalizeVideoTranscodeTask(event.payload);
    if (!normalized) {
      return;
    }
    setTranscodeProgressByTrace((prev) => ({
      ...prev,
      [normalized.traceId]: normalized,
    }));
  },
);
```

---
