## Scenario: Electron Managed Runtime Bootstrap Module Contract

### 1. Scope / Trigger

- Trigger: Any task that changes managed runtime path resolution, pinned runtime downloads, checksum verification, runtime install steps, or the Electron runtime dependency gate bootstrap callback path.
- Why this needs code-spec depth: The flow crosses Electron main, managed runtime installers, runtime status inspection, renderer recovery UI, network download behavior, filesystem replacement, and release-pinned checksum policy.

### 2. Signatures

Bootstrap module:

```ts
// electron/managedRuntimeBootstrap.mts
type ManagedRuntimeStage = "checking" | "downloading" | "installing" | "verifying";

type ManagedRuntimeActivity = {
  component: RuntimeDependencyManagedComponent;
  stage: ManagedRuntimeStage;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
};

type ManagedRuntimeBootstrapOptions = {
  configDir: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  fetch: typeof fetch;
  log?(message: string): void;
  onActivity?(activity: ManagedRuntimeActivity): void | Promise<void>;
  now?(): number;
};

function currentManagedRuntimeTarget(
  platform?: NodeJS.Platform,
  arch?: NodeJS.Architecture,
): string;

// electron/ytDlpBaseline.mts
function ensureBundledYtDlpBaselineReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { baselineRoot: string },
): Promise<string>;

function ensureManagedGalleryDlRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string>;

function ensureManagedFfmpegRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string>;

function ensureManagedDenoRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string>;

// electron/managedYtDlpRelease.mts (stage-only; never attempt selection)
function stageManagedYtDlpRelease(
  releaseId: string,
  options: ManagedYtDlpReleaseOptions,
): Promise<ManagedYtDlpStageResult>;
```

Electron main adapter:

```ts
// electron/main.mts
function buildManagedRuntimeBootstrapOptions(
  missingComponents?: RuntimeDependencyManagedComponent[],
): ManagedRuntimeBootstrapOptions;
```

### 3. Contracts

- `electron/main.mts` owns runtime dependency gate state, UI Lab overrides, IPC command entrypoints, log routing, and event emission.
- `electron/managedRuntimeBootstrap.mts` owns managed runtime target/path helpers, bundled-Python-backed downloader venv bootstrap, Deno/FFmpeg artifact specs, runtime asset download, checksum verification, archive extraction, executable chmod, and file replacement.
- Bootstrap functions must receive Electron-specific dependencies through `ManagedRuntimeBootstrapOptions`; they must not import `app`, `BrowserWindow`, IPC handlers, or renderer event emitters.
- `buildManagedRuntimeBootstrapOptions(...)` must pass `configDir: getUserDataDir()`, `platform: process.platform`, `arch: process.arch`, `fetch: fetchWithDesktopSession`, bundled Python paths, `logInfo`, and an `onActivity` adapter into `updateRuntimeDependencyGateDownloadActivity(...)`.
- `ytDlp` is an immutable packaged wheel baseline (`yt-dlp` plus `yt-dlp-ejs`) materialized offline into `<userData>/runtimes/yt-dlp/<target>/baseline/`; `galleryDl` remains a managed Python package. Neither may fall back to direct binary releases, system Python, machine JavaScript, or a network package install during yt-dlp baseline materialization.
- Managed Python downloader package pins must have one app-owned source of truth: `electron/managedPythonPackageManifest.mts`. Scripts that need those pins must read the compiled Electron manifest instead of defining duplicate version/source constants.
- The packaged yt-dlp manifest and exact two wheels are mechanically checked against `managedPythonPackageManifest.mts` before packaging and from each packaged artifact. Runtime only rehashes local packaged bytes; it performs no release discovery or baseline download.
- `ensureMissingManagedRuntimesReady(...)` must prepare the bundled yt-dlp baseline, then `galleryDl`, `ffmpeg`, and `deno`, with a fresh runtime status snapshot between components.
- Runtime path helpers in `ytDlpBaseline.mts`, `managedRuntimeBootstrap.mts`, and `src/electron-runtime/runtimePaths.ts` must agree on the baseline cache and shared `real/` paths.
- `resolvePinnedManagedPythonPackage(...)` must throw for unsupported downloader tool ids instead of returning `undefined`.
- Shared Python package bootstrap must use per-tool in-flight promise joining so concurrent ensure calls for the same downloader reuse one install/rebuild flow instead of racing `rm`/`venv`/`pip install`.
- Managed `ffmpeg` and `deno` bootstrap must use component-and-target in-flight promise joining so startup prewarm and first real download do not download/extract the same managed binary concurrently.
- `replaceFile(...)` must preserve the old Electron main algorithm: try `unlink(target)`, then `rename(temp, target)`, and fall back to `copyFile(temp, target)` plus cleanup.
- Electron main must route every bootstrap/repair/reinstall mutation through one target-scoped runtime-set coordinator. A download attempt, advanced yt-dlp probe, FFprobe analysis, or FFmpeg transcode acquires a lease atomically with readiness and releases it only after its child process tree settles; a mutation while leased fails busy instead of replacing a referenced path.
- `buildAttemptContext` is the yt-dlp pin boundary: it receives one `{ lease, binaries, identity }` binding after the baseline and shared FFmpeg/FFprobe/Deno facts are verified. Internal runner retries reuse that binding; a new engine attempt resolves another binding. A binding error releases any acquired lease before it escapes.
- Managed-release candidate path joins must validate a single canonical release ID segment; deriving a digest does not make a caller- or file-provided version path-safe. Catalog records with unsafe IDs are corrupt and must not reach marker reads.
- A managed-release catalog with corrupt JSON or unsupported schema is not an empty catalog. An explicit stage write must preserve those bytes and fail rather than discard other candidate facts.
- Stage must recheck marker presence inside `runMutation`. An invalid marker appearing after preflight still protects its directory from removal; record a quarantine outcome instead of rebuilding it in place.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Existing committed yt-dlp baseline cache | `ensureBundledYtDlpBaselineReady(...)` | Return its entrypoint only when `baseline.json`, Python identity, package set, and probe match | Keep gate state unchanged except later refreshed status |
| Missing Deno/FFmpeg runtime | `select*RuntimeArtifactSpec(...)` + download/extract | Download pinned archive, verify size/checksum, extract executable(s), chmod on non-Windows, replace final file | Surface activity stages through `onActivity` |
| Missing/corrupt yt-dlp baseline cache | `ensureBundledYtDlpBaselineReady(...)` | Rebuild a staging venv from verified packaged wheels using offline hash-locked pip, then write `baseline.json` last | Do not execute a partial/stale cache or contact the network |
| Missing gallery-dl runtime, stale baseline marker, package/Python/layout mismatch, or entrypoint missing | relevant ensure function | Rebuild only the affected cache/venv under the mutation coordinator | Leave unrelated runtime roots untouched |
| Unsupported platform/arch | `currentManagedRuntimeTarget(...)` | Throw unsupported managed runtime target error | Gate surfaces bootstrap failure |
| Unsupported downloader tool id | `resolvePinnedManagedPythonPackage(...)` | Throw `Unsupported managed Python package tool: <id>` | Do not continue with undefined metadata |
| Download stalls or all fallback URLs fail | `downloadRuntimeAssetWithFallbacks(...)` | Remove temp file and throw `Failed to download managed <component> runtime: ...` | Gate remains recoverable for retry |
| Checksum or size mismatch | `verifyDownloadedRuntimeAsset(...)` | Throw mismatch error before replacing final binary | Leave existing final binary untouched |
| Unsafe managed release ID/version | approved manifest/catalog parse and candidate path derivation | Reject before candidate path access | No download or traversal |
| Corrupt/unsupported managed candidate catalog | catalog writer | Throw without replacing catalog bytes | Do not invent an empty catalog |
| Invalid candidate marker appears after stage preflight | mutation-time marker recheck | Quarantine without directory removal | Preserve marker and payload |

### 5. Good / Base / Bad Cases

- Good: `electron/main.mts` materializes the checked packaged yt-dlp wheel set offline and reports `checking`, `installing`, and `verifying` through `onActivity`.
- Base: all runtimes already exist, so bootstrap functions return paths and no network request is made.
- Bad: importing `app.getPath(...)` or `updateRuntimeDependencyGateDownloadActivity(...)` inside `managedRuntimeBootstrap.mts`, which would couple installer logic back to Electron main state.
- Bad: changing baseline cache paths or packaged-wheel verification without updating `runtimePaths.ts`, causing status inspection to disagree with the attempt binding.
- Good: a raced invalid managed marker and its payload remain byte-identical after staging returns quarantined.
- Base: a missing catalog can be created by an explicit stage operation.
- Bad: treating a parse failure as permission to delete an immutable candidate or replace a catalog.

### 6. Tests Required

- `electron/managedYtDlpRelease.test.mts`: path-bearing canonical versions reject before fetch; unsafe catalog IDs yield corrupt with no candidates; corrupt and unsupported catalog bytes survive a failed write; a marker appearing between preflight and mutation retains its sentinel payload and skips materialization.
- Run explicit repository-root test paths with `--exclude .trellis/** --exclude .cindy-worktrees/**`; duplicated task checkouts are not additional root acceptance evidence.

### 7. Wrong vs Correct

- Wrong: `loaded.catalog?.candidates ?? []` silently converts corrupt or unsupported state into a writable empty catalog.
- Correct: reject `loaded.state === "corrupt" || loaded.state === "unsupported"` before building the replacement record set; only `missing` can begin empty.


## Scenario: P2-B approved release staging and passive observation

### 1. Scope / Trigger

An explicit `stage_managed_ytdlp_release` stages a target-local immutable candidate. It never selects a runtime. `main.mts` composes `prepareManagedYtDlpCandidateProbeInputs` directly from bundled Python and app-owned FFmpeg/FFprobe/Deno; it must not prepare a bundled yt-dlp venv or add a shared readiness capability. Bundled binding, attempt pinning, leases, retry/cancel, and selection remain unchanged.

### 2. Signatures

- `stageManagedYtDlpRelease(releaseId, options): Promise<ManagedYtDlpStageResult>` returns `{releaseId, stage: "committed", eligibility}` or throws `ManagedYtDlpStageError` with category `approval | download | integrity | materialization`.
- `inspectManagedYtDlpCandidates(options): Promise<ManagedYtDlpCandidateInspection>` is file-read-only.
- `validateYtDlpWheelArchive(bytes, packageInfo, packages, {pythonPath?, runtimeTargets?}): Promise<void>` is the shared runtime/preparation validator in `scripts/managed-ytdlp-package-set.mjs`; Electron emits and imports this canonical module.

### 3. Contracts

- Packaged allowlist is the only authority. Package `provenanceUrl` is exact HTTPS PyPI metadata provenance or an exact approved file URL. Optional `downloadUrl` separates transport from provenance: metadata-provenance managed entries require an exact HTTPS `files.pythonhosted.org` wheel URL. Legacy file-provenance entries may use that exact URL. Credentials, query/fragment, other hosts, redirects, and caller URLs are rejected. Runtime never fetches metadata or derives a transport URL.
- Managed identity includes `downloadUrl`. Baseline overlap compares every common field (including provenance, bytes, policy, probe, minimum Python, targets); transport is validated independently because baseline has no transport field. Baseline bytes, pins, provenance, and identity are unchanged.
- Size/hash and archive verification finish before `runMutation`. Bundled Python runs isolated `zipfile` plus its installed pip-vendored `packaging` parser: local-header/CRC/bounds validation, safe unique case-insensitive paths, no symlinks/encryption, one matching METADATA/WHEEL identity and universal tag, active base dependency versions and environment markers. The lock requests no extras, so inactive optional dependencies are not required; active unapproved extras/URLs are rejected. Expansion is capped at 256 MiB/20,000 members.
- Venv, offline pip, installed metadata, and probe use explicit timeouts and app-owned paths. Shared utility calls default to 60 seconds, covering low-level dependency readiness/extraction calls as well. Python/PIP/VIRTUAL_ENV ambient overrides are stripped; user-site, safe-path, no-bytecode, no-index, pip-version-check and null pip-config controls are set. Probe disables configs/plugins/remote components and binds absolute Deno/FFmpeg paths.
- The mutation holds through marker-last commit and probe/child settlement. Utility children own a POSIX process group; Windows timeout uses native `System32/taskkill.exe /PID <pid> /T /F`. Neither a timer, killer error, nor root exit alone proves timed-out tree settlement. Failed OS termination retains ownership and retries while the root remains owned; an exited Windows root with unknown descendants stays unsettled without retrying a potentially reused PID. Successful tree termination still awaits child close. A timed-out late exit zero remains failure.
- Immutable marker adds `materializationDigest`: sorted installed venv paths/content hashes, including interpreter, launcher and bytecode. Cache validation rehashes it before executing cached Python, rehashes retained wheels, and compares complete marker/catalog/package/probe/current dependency identity inside mutation. Current Python identity includes manifest digest, version, target and executable hash; media identity includes approved artifact/version and observed hash. No committed repair/rewrite occurs.
- Catalog eligibility persists `pythonIdentityDigest` plus Python manifest and complete media identity digests. Digests are 64 lowercase hex; release IDs, versions and package-set strings are bounded/path-safe. Failed probe output is not persisted as a version; external process/error text never determines failure category.
- Observations have `observation: consistent | marker_only | marker_mismatch` independently of optional persisted `eligibility`. Marker-only has no eligibility; marker mismatch preserves the prior persisted outcome. Corrupt/unsupported catalogs expose `observationError` and retain safe marker observations. Diagnostics imports this inspection type and projects those facts without lifecycle calls, payload hashing, writes, cleanup, or invented outcomes. Effective selection is always `bundled`.
- Source/package checks run in the packaging entrypoint. Package verification loads compiled canonical JS and its Electron wrapper under Windows `win-unpacked/resources/app` and macOS `mac`/`mac-arm64/*.app/Contents/Resources/app` and verifies exact resource content.

### 4. Validation & Error Matrix

| Condition | Result and ownership |
| --- | --- |
| Unapproved ID, malformed contract/transport | `approval`, no download |
| Network/response failure | bounded `download`, temporary bytes removed |
| Locally wrong size/hash/ZIP/METADATA | `integrity`, before mutation |
| Venv/pip/metadata/current dependency failure | bounded `materialization`, no marker; committed state never removed |
| Probe mismatch/spawn failure | committed marker plus persisted failed eligibility, no raw output version |
| Missing/changed installed bytes, stale complete proof | immutable quarantine, no cached execution |
| Corrupt/unsupported catalog | preserve original bytes; fail write |
| Timed-out process or termination rejection | no success; hold mutation until confirmed settlement |
| Marker exists but catalog absent | `marker_only`, eligibility omitted |

### 5. Good / Base / Bad Cases

- Good: a baseline-compatible fixture preserves PyPI provenance and declares a separate exact file URL; acquisition fetches only that URL.
- Base: production allowlist is empty, so no real managed release is authorized.
- Bad: retained clean wheels do not justify running a changed installed launcher; a marker mismatch does not authorize Diagnostics to invent quarantine.

### 6. Tests Required

Root `managedYtDlpRelease`, `managedRuntimeBootstrapProcess`, `diagnostics`, canonical package-set, and package verifier tests cover pre-mutation ordering, corruption with clean wheels, full dependency/cache proof, typed sensitive-error rejection, immutable races/catalog preservation, marker-only projection, real baseline archives, adversarial ZIP/METADATA, complete overlap and all supported layouts. Real process tests prove PID/descendant termination on the host; simulated POSIX failure/group tests are not a macOS release gate. Focused checks exclude `.trellis/**` and `.cindy-worktrees/**`.

### 7. Wrong vs Correct

- Wrong: `spawn(process.env.ComSpec, taskkillArgs)` or rejecting on the timer while children remain alive.
- Correct: use native tree termination, await its success and child close, and retain mutation ownership on termination failure.
- Wrong: compare only wheel hashes on cache hits or compare transport URL against baseline metadata provenance.
- Correct: verify installed venv bytes before execution; preserve shared provenance equality while validating explicit managed transport separately.
