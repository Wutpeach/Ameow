# Reduce YouTube Extraction Latency On Injected Downloads

## Goal

Reduce the time spent in the renderer's `preparing` / `Resolving media...` state for YouTube downloads started from extension-driven flows, without regressing download success rate for authenticated or extractor-fragile cases.

## Problem Summary

Current YouTube downloads feel slow even after removing the old metadata pre-probe because the most common extension/injected path still triggers the heavy yt-dlp extractor mode before any real `[download]` progress appears.

Observed causes in the current code:

- The old metadata title probe is already gone. Runtime now downloads immediately and renames after completion using the same yt-dlp invocation.
- The renderer emits an early `video-download-progress` event with `Resolving media...` before the engine produces real byte progress.
- The current heavy YouTube extractor gate is too wide:
  - `selectionScope === "current_item"`
  - or `cookies` present
  - or `pageUrl` present
- Extension/injected flows almost always include `pageUrl`, `selectionScope: "current_item"`, and extension cookies.
- Highest-quality yt-dlp selection still needs full format enumeration (`bestvideo+bestaudio/best`, format sort, optional merge), so the user remains in `preparing` until yt-dlp resolves media streams.

## What We Already Know

- Runtime emits the early preparing state in [src/electron-runtime/service.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/service.ts#L649).
- YouTube yt-dlp mode selection currently lives in [src/electron-runtime/ytDlpDownload.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/ytDlpDownload.ts#L14).
- Heavy mode currently appends:
  - `--extractor-args youtube:player_js_variant=tv`
  - `--remote-components ejs:github`
  - `--js-runtimes ...`
- Extension background currently fetches cookies eagerly for injected video-selection requests in [browser-extension/background.js](/Users/mabel/Documents/FlowSelect/browser-extension/background.js#L1972).
- Injected YouTube downloads always send `pageUrl` and `selectionScope: "current_item"` in [browser-extension/youtube-detector.js](/Users/mabel/Documents/FlowSelect/browser-extension/youtube-detector.js#L884).

## Constraints

- Preserve current command and event names.
- Do not reintroduce the removed metadata pre-probe.
- Keep the success path compatible with current title-after-download rename behavior.
- Respect existing cross-layer schemas and provider intent flow.
- Documentation/spec updates are only needed if we change cross-layer executable contracts.

## Scope

### In Scope

- Introduce an explicit cross-layer hint for YouTube extractor mode selection.
- Default extension/injected YouTube downloads to a light extractor path.
- Retry YouTube yt-dlp with extended mode when the first light attempt fails with known extractor/auth/signature symptoms.
- Stop sending extension cookies by default for standard injected YouTube downloads.
- Add targeted tests for the new hint flow and fallback behavior.

### Out of Scope

- Progressive-first then best-quality background replacement flow.
- Extractor result caching / TTL caches.
- Bilibili-specific performance redesign.
- Frontend copy changes beyond existing progress text unless needed for clarity.

## Success Criteria

- Public YouTube downloads started via injected controls no longer default to extended yt-dlp mode.
- Standard injected YouTube downloads no longer attach cookies unless explicitly requested.
- Light mode failures caused by known YouTube auth/signature/extractor issues retry once with extended mode.
- Plain pasted YouTube URLs keep the existing lightweight behavior.
- Existing authenticated / fragile cases continue to succeed after fallback or fail with clearer logs.

## User-Facing Acceptance Criteria

- [ ] Injected YouTube download of a public video reaches real yt-dlp download progress faster than the current baseline path.
- [ ] Pasted plain YouTube URL still downloads successfully.
- [ ] Injected YouTube download no longer depends on cookies by default for public videos.
- [ ] A known auth/challenge case retries with extended mode before surfacing terminal failure.
- [ ] No regression in title-after-download rename behavior.

## Technical Design

### 1. Cross-Layer Hint Contract

Add explicit extractor-mode hints on the request payload instead of inferring heavy mode from `pageUrl` alone.

New request field:

```ts
extensionData?: {
  youtube?: {
    forceExtended?: boolean;
    allowCookies?: boolean;
    source?: "injected" | "pasted" | "context_menu";
  };
}
```

Affected layers:

- Browser extension payload creation
- Electron command router payload normalization
- `RawDownloadInput`
- Provider intent mapping into `VideoDownloadIntent.extensionData`
- yt-dlp runtime execution

Why `extensionData`:

- It is already part of the intent contract.
- It is better suited for execution hints than `diagnostics`, which should remain observational.

### 2. Light-First YouTube Mode

Replace the current heavy-mode gate with an explicit mode resolver:

```ts
type YouTubeMode = "light" | "extended";
```

Initial mode rules:

- `extended` if:
  - `intent.extensionData?.youtube?.forceExtended === true`
  - or cookies are explicitly attached
- otherwise `light`

The existence of `pageUrl` alone must not force extended mode.

### 3. Extended Retry Strategy

For YouTube only:

1. Run yt-dlp once with the resolved initial mode.
2. If mode was `light` and the failure matches a known extended-only symptom, retry once with `extended`.
3. Re-throw the final error if the retry also fails.

Retry-trigger categories:

- cookies/login/auth required
- bot / challenge messages
- signature / nsig extraction issues
- player-response / extractor-fragile messages

This is a same-engine retry, not a provider fallback.

### 4. Extension Cookie Policy

Injected YouTube requests should not fetch or forward cookies by default.

Default behavior:

- `allowCookies: false`
- no `getCookiesForUrl(...)`

Only allow cookies when:

- detector/background explicitly marks a hard case
- or a later known hard-case path is added intentionally

### 5. Logging / Observability

Extend existing injection-debug/runtime logs with:

- `youtubeMode`
- `fallbackToExtended`
- `fallbackReason`
- `cookiesIncluded`

This allows us to verify mode selection without reproducing the issue manually every time.

## Files Expected To Change

- `browser-extension/background.js`
- `browser-extension/youtube-detector.js`
- `src/core/types/raw-download-input.ts`
- `src/core/schemas/raw-download-input-schema.ts`
- `src/electron-runtime/commandRouter.ts`
- `src/sites/youtube.ts`
- `src/sites/bilibili.ts`
- `src/sites/generic.ts`
- `src/electron-runtime/ytDlpDownload.ts`
- related tests

## Validation Matrix

| Scenario | Expected Mode | Cookies | Retry |
|----------|---------------|---------|-------|
| Pasted plain YouTube URL | light | no | no |
| Injected public YouTube download | light | no | only on matching error |
| Injected hard-case YouTube download with explicit `forceExtended` | extended | optional by hint | no initial retry |
| Light YouTube failure with auth/signature symptom | light -> extended | extended may include cookies | one retry |
| Non-YouTube yt-dlp download | unchanged | unchanged | unchanged |

## Test Plan

### Unit / Runtime

- `ytDlpDownload.test.ts`
  - light mode for public injected request with `pageUrl/current_item`
  - extended mode when `forceExtended=true`
  - light failure retries once with extended on matching error
  - light failure does not retry on unrelated terminal errors

### Command / Cross-Layer

- `commandRouter.test.ts`
  - preserves new `extensionData.youtube.*` fields

### Extension

- background tests or targeted unit coverage
  - injected public YouTube request does not fetch cookies by default
  - `allowCookies=true` path fetches and forwards cookies

## Risks

- Some currently successful injected YouTube downloads may rely on the old always-extended behavior.
- Retry classification that is too broad can waste time by retrying failures that will not benefit from extended mode.
- Retry classification that is too narrow can reintroduce failures for challenge-gated videos.

## Mitigations

- Keep fallback as a single retry only.
- Add explicit mode + fallback logs.
- Cover both public and auth/challenge-like failure strings in tests.

## Implementation Plan

### Phase 1

- Add request/intent `extensionData.youtube` contract.
- Thread the field through router and providers.

### Phase 2

- Implement light/extended mode selection and same-engine fallback in `ytDlpDownload.ts`.

### Phase 3

- Update extension/background to stop sending cookies by default.

### Phase 4

- Run targeted tests, then broader lint/type-check/test.

## Open Questions

- Should Bilibili also adopt the same explicit light/extended hint contract now, or should this PR limit behavior changes to YouTube and only thread the generic field through Bilibili for future use?
- Do we want a persistent telemetry signal for `light -> extended` fallback counts, or are debug logs sufficient for this phase?
