# Implementation Plan

## Checklist

- [ ] Load relevant Trellis specs with `trellis-before-dev` before editing app code.
- [ ] Extend renderer command typing with a main-process diagnostic copy command such as `copy_error_diagnostics`.
- [ ] Add a main-process command controller or extend an existing command controller for error diagnostic copy.
- [ ] Register the diagnostic copy command in `electron/main.mts` command routing.
- [ ] Add diagnostic payload builder:
  - app version, platform, arch, language;
  - failure surface (`download` / `transcode`);
  - trace id;
  - localized user message and category;
  - original user URL when available;
  - raw code/classification/message/context when available;
  - recent 120 runtime log lines.
- [ ] Add redaction helper for diagnostic context and runtime log lines:
  - redact cookies;
  - redact authorization headers;
  - redact bearer tokens and obvious token/password/session keys;
  - preserve original user URL by design.
- [ ] Extend download failure payloads to carry structured failure data where practical.
- [ ] Update download failure emit sites so structured `DownloadRuntimeError` data is not discarded:
  - orchestrated download failure emits;
  - cancellation emits remain cancellation-only and do not show diagnostic copy;
  - advanced-quality probe failure emits either carry structured failure data or intentionally use generic failure copy.
- [ ] Add original request URL to download failure payloads when available.
- [ ] Extend transcode failure payloads or construct equivalent diagnostic data for transcode failures.
- [ ] Add a lightweight transcode failure category path:
  - default true transcode failures to `transcode_merge`;
  - map reliable output/write or network-like patterns to more specific categories when safe.
- [ ] Add localized error category mapping for approved MVP categories:
  - auth/login state;
  - network/proxy;
  - inaccessible content;
  - output/write failure;
  - quality/format unavailable;
  - runtime/downloader unavailable;
  - transcode/merge failure;
  - unclassified fallback.
- [ ] Add `CopyIcon` to local `AppIcons.tsx` using lucide-style inline SVG path data without adding `lucide-react`.
- [ ] Update `ForegroundOutcomeOverlay` to support one compact failure sentence plus copy icon.
- [ ] Extend `showForegroundTaskOutcome(...)` and center overlay state to carry optional failure diagnostic data.
- [ ] Fix video download completion handling so `outcome.cancelled` and real failure are not conflated.
- [ ] Fix transcode failure handling so real failures are not represented as user cancellation.
- [ ] Enable pointer events only for the copy icon/button inside the center overlay.
- [ ] Keep cancellation and success prompts unchanged except for localization fixes where needed.
- [ ] Set real failure prompts to 5 seconds.
- [ ] Dismiss the center prompt after successful diagnostic copy.
- [ ] Preserve existing new-task/progress interruption behavior through `dismissTransientCenterOverlay()`.
- [ ] Add or update zh-CN and en locale resources for center-prompt copy.
- [ ] During wrap-up, update docs-site troubleshooting/error pages to explain the center-prompt diagnostic-copy JSON workflow.

## Validation

- `npm run locales:sync`
- `npm run type-check`
- `npm run lint`
- `npm run docs:build`
- Focused tests for:
  - error category mapping;
  - diagnostic JSON builder;
  - JSON is pretty-printed and parseable;
  - redaction preserves original URLs but removes cookies/tokens/auth headers;
  - runtime log unavailable path still produces copyable JSON with a placeholder;
  - download failure payload compatibility;
  - transcode failure diagnostic copy path;
  - cancellation does not show copy diagnostics.
  - download completion handler passes cancellation and real failure through distinctly.
- Manual Electron check:
  - download failure shows localized compact prompt and copy icon;
  - transcode failure shows localized compact prompt and copy icon;
  - copy writes JSON to clipboard;
  - prompt dismisses after copy;
  - new task progress interrupts a previous failure prompt;
  - zh-CN and en text fit the center prompt.
  - compact/full window interaction still behaves correctly with copy-icon pointer events.

## Risk Points

- Pointer events in the center overlay can interfere with compact/full window interaction if enabled too broadly.
- Renderer-only string matching can drift from runtime failure classification; prefer structured payload data.
- Runtime log excerpts may expose sensitive information unless redaction is centralized and tested.
- Center prompt text must stay compact under both zh-CN and en.
- Optional payload additions must not break existing event producers/tests.

## Rollback Points

- Keep Settings support-log export unchanged so full diagnostics remain available if per-error copy has defects.
- Make new payload fields optional so UI can fall back to generic failure copy if structured data is missing.
- Keep raw technical logging unchanged for developer debugging.
