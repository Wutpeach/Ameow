## Scenario: Electron Download Runtime Core

### 1. Scope / Trigger

- Trigger: any change touching the Electron-owned runtime package under `src/electron-runtime/`, shared download payload types in `src/types/videoRuntime.ts`, or the TS/node toolchain needed to compile those files.
- Why this needs code-spec depth: the migration introduces a second native runtime implementation path (`Node/Electron`) that must preserve the same queue, progress, and runtime-dependency contracts currently consumed by the renderer.

### 2. Signatures

- Runtime factory:
  - `createElectronDownloadRuntime(options: ElectronDownloadRuntimeOptions) -> ElectronDownloadRuntime`
- Core methods:
  - `getRuntimeDependencyStatus() -> RuntimeDependencyStatusSnapshot`
  - `getRuntimeDependencyGateState() -> RuntimeDependencyGateStatePayload`
  - `refreshRuntimeDependencyGateState() -> RuntimeDependencyGateStatePayload`
  - `startRuntimeDependencyBootstrap(reason?: string) -> Promise<RuntimeDependencyGateStatePayload>`
  - `queueVideoDownload(request: QueuedVideoDownloadRequest) -> Promise<QueuedVideoDownloadAck>`
  - `cancelDownload(traceId: string) -> Promise<bool>`
- Core files:
  - `src/electron-runtime/service.ts`
  - `src/electron-runtime/runtimePaths.ts`
  - `src/electron-runtime/processRunner.ts`
  - `src/electron-runtime/galleryDlDownload.ts`
  - `src/electron-runtime/ytDlpDownload.ts`
  - `src/types/videoRuntime.ts`

### 3. Contracts

- Electron runtime ownership:
  - The Electron runtime package is intentionally framework-light: no direct `electron` imports, no Tauri imports, and no renderer globals.
  - Main/preload integration may wrap it later, but queueing, runtime-status inspection, and CLI execution contracts live in `src/electron-runtime/`.
- Hidden CLI spawning:
  - Electron-managed CLI processes must use Node `spawn(..., { windowsHide: true })` through the shared helper in `processRunner.ts`.
  - Once the Electron shell is wired to this runtime package, `flowselect-cli-proxy` is no longer the steady-state hidden-process strategy.
  - Do not reintroduce per-tool spawn styles; yt-dlp and gallery-dl launches should share the same hidden-window process path.
  - When `runStreamingCommand(...)` attaches an `AbortSignal` listener, it must remove the listener after child-process settlement so completed tasks do not retain task abort controllers or stream handlers.
- Runtime path resolution:
  - `yt-dlp` remains a bundled runtime resolved from `src-tauri/binaries/` in dev and `binaries/` in packaged layouts.
  - `gallery-dl` remains a bundled runtime resolved from `desktop-assets/binaries/` in dev and `binaries/` in packaged layouts.
  - Local Electron entrypoints that can exercise downloader flows (`npm run dev`, `npm run electron:dev`, `npm run build`, packaging scripts) must run the unified official-downloader ensure flow before launch/package so missing or non-official bundled runtimes fail early instead of surfacing as `spawn ... ENOENT` during a download task.
  - The official bundled-Python ensure flow writes `desktop-assets/binaries/.official-python-runtimes.json`; a stale or hand-dropped `python-<target>` directory without that manifest entry does not satisfy the repo-managed supply-chain contract.
  - `ffmpeg`, `ffprobe`, and `deno` remain managed runtimes resolved from `<configDir>/runtimes/<component>/<target>/...`.
  - On Windows, managed `ffmpeg` and `deno` use `real/` for the actual console binaries.
- Queue and event compatibility:
  - `queueVideoDownload(...)` must preserve `QueuedVideoDownloadAck { accepted, traceId }`.
  - Queue state remains emitted through `video-queue-count` and `video-queue-detail`.
  - Download progress remains emitted through `video-download-progress`.
  - Terminal download settlement remains emitted through `video-download-complete` for both success and failure.
  - Indeterminate `gallery-dl` tasks must not remain renderer-visible `preparing` for the whole run just because the tool does not expose byte-accurate progress.
  - `gallery-dl` runs must emit an early `video-download-progress` payload with `stage: "downloading"` once the child process has started, even if `percent` remains `-1`.
  - For `gallery-dl`, the `speed` field may carry i18n-friendly activity tokens such as `activity:galleryDl.resolvingMedia`, `activity:galleryDl.collectingMetadata`, or `activity:galleryDl.savingFile`; renderer status surfaces should translate those tokens as activity text instead of literal transfer-rate values.
- Executor routing:
  - `direct` is not a backend engine id; direct media URLs and candidates are hints only.
  - Provider planning may choose `gallery-dl` as the primary engine for Pinterest-style gallery/image-heavy inputs.
  - Remaining URLs default to the orchestrated `yt-dlp` / `gallery-dl` engine ladder rather than site-hardcoded executor branching.
- Toolchain contract:
  - Because `src/electron-runtime/` imports Node built-ins from TypeScript, the repo must carry `@types/node` and include Node types in `tsconfig.json`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Electron runtime TS files compile without Node types | `npm run type-check` | Node built-ins resolve and NodeJS namespace types are available | Keep `@types/node` in devDependencies and `types: ["node", "vite/client"]` in `tsconfig.json` |
| Electron runtime uses ad hoc spawn flags per downloader | code review / Windows runtime | one route may flash consoles while another stays hidden | route all CLI execution through `processRunner.ts` |
| yt-dlp path lookup prefers a missing dev candidate over an existing packaged candidate | runtime path resolution | packaged app would report a false missing-runtime state | resolve the first existing bundled candidate and only fall back to the first path for error reporting |
| managed ffmpeg status marks ready when only one of `ffmpeg` / `ffprobe` exists | runtime dependency status | media-tool readiness is overstated | require all expected files for the component before returning `state="ready"` |
| pending cancel path only removes the queue row | queue cancel command | renderer can get stuck waiting for terminal settlement | emit `video-download-complete` with a cancelled failure payload when a pending task is removed |
| active cancel path kills the child but leaves queue counts stale | active task cancel | queue badge/progress state lingers | remove active task on settlement and emit refreshed queue count/detail payloads |
| child process completes normally after an abort listener was attached | long-running desktop session | completed tasks retain abort listener closures and can accumulate memory/listener references | remove the exact abort listener in a `finally` path after `close` handling |
| `gallery-dl` emits little or no machine-readable progress detail for a task | renderer progress state | main window can look stuck on `Preparing...` until the task suddenly completes | emit an early indeterminate `downloading` event and map recognized tool lines to short activity labels |

### 5. Good / Base / Bad Cases

- Good:
  - The Electron runtime package type-checks under the main repo TS config, resolves the current target runtime paths, and passes queue/progress tests without importing `electron`.
  - On Windows, yt-dlp and gallery-dl execution both go through the shared hidden-window spawn helper.
  - Enqueueing three tasks with `maxConcurrent=2` yields two active tasks and one pending task until the first active task settles.
  - A Pinterest `gallery-dl` download transitions from `Preparing...` to a translated activity label backed by runtime tokens such as `activity:galleryDl.resolvingMedia` before completion, even when no numeric percent is available.
- Base:
  - A Pinterest page without a usable direct hint resolves to `gallery-dl`; missing bundled gallery-dl should be surfaced as a runtime dependency failure instead of silently falling through to `yt-dlp`.
  - Runtime dependency bootstrap may be injected by the host integration later; the runtime core keeps the gate-state contract even before the installer/download implementation is attached.
- Bad:
  - A new Electron executor imports `electron` or renderer globals directly.
  - A runtime-status helper reports managed tools as ready when only partial files exist.
  - The Electron runtime silently depends on `flowselect-cli-proxy` even after hidden CLI ownership moved to Node.

### 6. Tests Required (with assertion points)

- `npm run type-check`
  - Node-based runtime files compile under the repo TS config.
- `npm run lint`
  - The new runtime package stays within the repo lint baseline.
- `npm run test`
  - `src/electron-runtime/runtimePaths.test.ts` validates bundled and managed runtime status resolution.
  - `src/electron-runtime/ytDlpProgress.test.ts` validates yt-dlp progress normalization.
  - `src/electron-runtime/galleryDlDownload.test.ts` validates early indeterminate `downloading` events and tokenized `gallery-dl` activity labels.
  - `src/electron-runtime/processRunner.test.ts` validates stream line handling, pre-aborted signals, and abort-listener cleanup after child exit.
  - `src/electron-runtime/service.test.ts` validates queue concurrency and pending cancellation semantics.

### 7. Wrong vs Correct

#### Wrong

```ts
spawn(command, args, {
  shell: true,
});
```

```ts
return {
  ffmpeg: existsSync(ffmpegPath) ? ready(ffmpegPath) : missing("ffmpeg missing"),
  // ffprobe not checked
};
```

#### Correct

```ts
spawn(command, args, {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
```

```ts
const allExist = candidates.every((candidate) => existsSync(candidate));
if (allExist) {
  return readyStatus(candidates[0], "managed");
}
return missingStatus(`Missing managed ffmpeg runtime. Expected ${JSON.stringify(candidates)}`);
```
