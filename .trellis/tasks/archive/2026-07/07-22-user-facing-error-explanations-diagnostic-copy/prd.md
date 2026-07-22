# Optimize user-facing error explanations and diagnostic copy

## Goal

Turn technical runtime/download errors that currently appear as English text, raw stderr, or `E_*` codes into localized user-facing explanations that are easy to understand in the main window, while preserving the original technical detail in logs and copyable diagnostic payloads for developer support.

User value:

- Users can understand why an operation failed without reading raw downloader output.
- Users see a short, plain-language explanation and a practical next step in the app language.
- Developers still receive the original error code, raw message, and relevant diagnostic context when the user copies error details.
- The small main window stays usable; the user-facing message must not become a dense support article.

## User Decisions So Far

- Error explanations must follow the current app language. Chinese UI shows Chinese explanations; English UI shows English explanations.
- The main visible error should be a translation/explanation of the underlying technical error, not a replacement for logs.
- The Settings page's existing full support-log export should remain a complete diagnostic export workflow for now.
- The per-error copy affordance should be scoped to the runtime error moment: when an error is shown, the user can click a small copy icon/button to copy diagnostic information for the developer.
- The copied diagnostic text should contain the original technical detail, not only the simplified user-facing message.
- Do not add a separate persistent failure UI component for this task. Put the copy affordance inside the existing center outcome prompt.
- First implementation scope is the existing center outcome prompt for download failures and transcode failures only. Other error surfaces are out of scope for now.
- The center prompt should use one compact localized sentence plus a copy icon, not a two-line reason/action layout.
- Generic unclassified failures should use the fallback center prompt copy:
  - zh-CN: `处理失败，可复制诊断信息反馈`
  - en: `Processing failed. Copy diagnostics to report it`
- User-initiated cancellation should not use the diagnostic-copy failure treatment. It should remain a short localized non-error cancellation prompt without the copy icon and without the 5-second failure duration.
- First-pass center-prompt categories should include:
  - auth/login state: zh-CN `登录状态可能失效，请重新同步`; en `Login may have expired. Sync again`
  - network/proxy failure;
  - inaccessible link/content/site;
  - output path or file write failure;
  - unavailable quality/format;
  - runtime/downloader unavailable;
  - transcode/merge failure;
  - unclassified failure fallback.
- The above first-pass categories are approved for MVP coverage.
- Approved MVP center-prompt copy:

  | Category | zh-CN | en |
  | --- | --- | --- |
  | auth/login state | `登录状态可能失效，请重新同步` | `Login may have expired. Sync again` |
  | network/proxy failure | `网络连接异常，请检查代理` | `Network issue. Check proxy` |
  | inaccessible link/content/site | `内容可能不可访问` | `Content may be unavailable` |
  | output path or file write failure | `保存位置可能不可用` | `Save location may be unavailable` |
  | unavailable quality/format | `当前画质可能不可用` | `Selected quality may be unavailable` |
  | runtime/downloader unavailable | `下载组件未准备好` | `Downloader is not ready` |
  | transcode/merge failure | `视频处理失败，可复制诊断信息` | `Video processing failed. Copy diagnostics` |
  | unclassified failure fallback | `处理失败，可复制诊断信息反馈` | `Processing failed. Copy diagnostics to report it` |
- Extend the failed-error center prompt duration to 5 seconds so users have time to read and copy.
- Clicking the copy button should dismiss/interruption-clear the center prompt immediately after copying.
- Starting or receiving progress for a new foreground task should interrupt the error prompt immediately.
- The copied diagnostic payload should preserve the user's original URL because it helps the developer reproduce and verify fixes with the same link.
- The copied diagnostic payload should include enough recent runtime log evidence to support real troubleshooting; convenience is not useful if the copied content is too sparse to diagnose the failure.
- The copied diagnostic payload should include the most recent 120 runtime log lines by default, after redaction.
- The copied diagnostic payload should be JSON, because user feedback will usually be handed back to AI/developer tooling for structured analysis.
- The copied diagnostic JSON should be pretty-printed with multi-line indentation for readability after the user pastes it into chat or an issue.
- Copying diagnostics should use a new Electron main-process renderer command rather than relying on `navigator.clipboard.writeText`, so clipboard writes, runtime-log collection, redaction, and JSON generation stay in a stable desktop-owned path.

## Confirmed Facts

- `src/core/errors/download-runtime-error.ts` already models runtime failures with `code`, `classification`, optional `context`, and a fallback eligibility flag.
- `src/core/constants/error-codes.ts` defines internal codes including `E_ABORTED`, `E_AUTH_REQUIRED`, `E_EXECUTION_FAILED`, `E_NO_ENGINE_SUCCEEDED`, `E_OUTPUT_NOT_FOUND`, and input/provider/runtime availability codes.
- `src/core/constants/error-classifications.ts` already classifies failures as `cancelled`, `auth_required`, `input_invalid`, `retry_same_engine`, `fallback_to_other_engine`, or `terminal_for_site`.
- `src/types/videoRuntime.ts` currently defines `DownloadResultPayload` with only `traceId`, `success`, optional `file_path`, optional `title`, and optional `error`; it does not expose `code`, `classification`, raw error detail, or copyable diagnostic detail to the renderer.
- `src/utils/downloadEventReducers.ts` currently summarizes a download error by taking the first non-empty line and truncating it to 96 characters.
- `src/App.tsx` passes that summarized string into `showForegroundTaskOutcome(...)` for failed video downloads.
- `src/components/ForegroundOutcomeOverlay.tsx` currently has a fixed narrow layout, `width: 170`, `fontSize: 9`, `pointerEvents: "none"`, and only renders the icon plus text. It cannot currently host a clickable copy icon.
- The foreground outcome display is currently short-lived; download failures are shown with `durationMs: 1500` in the observed video completion path.
- `src/App.tsx` already dismisses transient center overlays when download progress or transcode progress starts, through `dismissTransientCenterOverlay()`. This supports the requirement that a new foreground task interrupts the older error prompt.
- `package.json` does not currently include `lucide-react`; icons are local inline SVG components in `src/components/icons/AppIcons.tsx`.
- `AppIcons.tsx` uses a lucide-like style: `24x24` viewBox, `fill="none"`, `stroke="currentColor"`, rounded line caps and joins.
- Existing `AppIcons` search did not find a ready-made `CopyIcon` or `ClipboardIcon`, so implementation should add a local `CopyIcon` by using lucide-style SVG path data rather than adding a new icon package dependency.
- `src/electron-runtime/ytDlpErrorSummary.ts` already extracts a useful line from yt-dlp stderr and annotates some Windows exit codes, but it is not a localized user-facing explanation layer.
- `electron/supportLogExport.mts` builds a complete support log file with environment, settings JSON, runtime status, and recent runtime log lines.
- `src/pages/SettingsPage.tsx` currently invokes `export_support_log`, writes a support log file, opens the output folder when possible, and shows localized success/failure hints.
- A prior archived task, `06-12-localize-download-errors`, explicitly deferred UI localization and copy-detail affordances as a later phase after a docs-first pass.

## Requirements

- Add a localized error explanation layer for runtime/download failures.
- Limit MVP user-visible changes to center outcome prompt failures for:
  - video download failure;
  - video transcode failure.
- Do not change other error surfaces in this task unless required to support the two center-prompt failure paths.
- User-facing error explanations must be short enough for the main window:
  - Prefer one compact localized sentence, not a multi-line explanation.
  - Include the immediate next action only when it fits naturally within that compact sentence.
  - Avoid multi-paragraph explanations in the foreground overlay.
  - Preserve longer explanation details for docs, settings support log export, or copied diagnostics.
- The center-prompt sentence should prioritize the likely cause. It may include a short action only if the localized string remains compact.
- Center-prompt text must be designed against both Chinese and English length variance. It should degrade gracefully through wrapping/clamping and `title`/copied diagnostics rather than overflowing the main window.
- Error explanation copy must be available in at least `zh-CN` and `en`.
- Error explanations must distinguish:
  - internal Ameow `E_*` codes;
  - upstream downloader diagnostics such as `ERROR:`, `HTTP Error ...`, `ffmpeg exited ...`, and `gallery-dl exited ...`;
  - user cancellation versus actual failure.
- The original technical error must remain available for logs and diagnostics.
- The runtime-to-renderer contract should carry structured failure information where practical, instead of relying only on renderer-side string slicing.
- Add a per-error copy affordance near the visible failure message if the UI can remain coherent and clickable.
- The copy affordance should be implemented inside the existing center outcome prompt rather than as a new persistent error component.
- The copy affordance should sit with the compact sentence in the center prompt and should not force a second explanatory line.
- The copy affordance should use a local lucide-style `CopyIcon`; do not add `lucide-react` or another icon dependency solely for this task.
- The failed-error center prompt should stay visible for 5 seconds by default, longer than current success/cancel prompts.
- Copying diagnostics from the center prompt should immediately dismiss the prompt after successful copy.
- New foreground task progress should continue to dismiss any previous transient error prompt immediately.
- The copy affordance should copy a compact diagnostic packet useful for developer support, including at minimum:
  - app version;
  - platform/arch where available;
  - timestamp;
  - trace id;
  - original user URL when available;
  - operation type, when known;
  - internal error code, classification, and raw error message;
  - relevant context that is safe to share;
  - the most recent 120 runtime log lines when available, after redaction.
- Copied diagnostics should prefer support usefulness over being extremely short. They should still be structured, bounded, and redacted so the text remains practical to paste into chat or an issue.
- Copied diagnostic content must avoid leaking raw cookies, auth headers, bearer tokens, full account identifiers, or other sensitive secrets. Original URLs are intentionally preserved for developer reproduction unless future evidence shows a specific URL class must be redacted.
- The Settings page full support-log export should stay as a separate complete diagnostic export workflow in this task unless later evidence shows it must change.
- If the current 1.5-second foreground outcome cannot support a clickable copy action safely, the design must choose a stable failure detail surface or adjust failure display timing/layout deliberately.
- The center prompt must become interactive only for the copy affordance; avoid making the whole prompt a large interactive panel.
- Existing docs pages about troubleshooting/error messages should stay aligned if user-facing behavior changes materially.
- This MVP must update the docs-site troubleshooting/error guidance so users know the center error prompt can copy diagnostic JSON for developer feedback. Documentation work can happen during task wrap-up after the app behavior is implemented.

## Acceptance Criteria

- [ ] Failed runtime/download operations show a localized, plain-language user-facing explanation instead of only raw English/code text.
- [ ] MVP behavior covers center-prompt download failures and center-prompt transcode failures.
- [ ] Non-center-prompt error surfaces are not redesigned in this task.
- [ ] The visible main-window message does not overflow, crowd, or visually break the compact/full main window layout in Chinese or English.
- [ ] Center-prompt copy uses compact localized wording with tested length constraints for Chinese and English.
- [ ] Center-prompt failure UI uses one compact localized sentence plus a copy icon, not a two-line reason/action layout.
- [ ] Unclassified failures use the agreed localized fallback copy instead of raw error text.
- [ ] User-initiated cancellation remains a short localized cancellation state and does not show the diagnostic copy icon.
- [ ] Auth/login-state failures use the agreed localized copy, including zh-CN `登录状态可能失效，请重新同步`.
- [ ] Copy icon styling matches existing local AppIcons without adding an icon package dependency.
- [ ] Raw technical error text and internal error codes remain available in logs.
- [ ] A user can copy per-error diagnostic information from the failure UI or a stable failure detail surface.
- [ ] The copy affordance appears in the center error prompt without requiring a new persistent failure component.
- [ ] Copying diagnostics dismisses the center prompt after the copy succeeds.
- [ ] Starting a new foreground task interrupts the previous error prompt.
- [ ] Copied diagnostic content includes enough technical detail for developer triage while excluding obvious secrets such as cookies and authorization headers.
- [ ] Copied diagnostic content is valid JSON.
- [ ] Copied diagnostic JSON is multi-line pretty-printed, not compact single-line JSON.
- [ ] Copying diagnostics uses an Electron main-process command and succeeds in the desktop app environment.
- [ ] Copied diagnostic content preserves the original user URL when the failed request had one.
- [ ] Copied diagnostic content includes the most recent 120 runtime log lines, with sensitive fields redacted.
- [ ] Settings page support-log export remains available as a complete diagnostic export path.
- [ ] Tests cover error explanation mapping, locale behavior, copy payload construction, and sensitive-field redaction where practical.
- [ ] Existing download success/cancel flows are not regressed.
- [ ] If public troubleshooting copy changes, Chinese and English docs-site pages are updated together.
- [ ] Docs-site troubleshooting/error pages explain the new diagnostic-copy behavior and tell users they can paste the copied JSON to the developer.

## Notes

- This is a complex task. It should get `design.md` and `implement.md` before implementation starts.
- The task should inherit useful analysis from archived task `06-12-localize-download-errors`, but current implementation must target the Electron code paths.
- Current product direction: do not replace Settings support-log export with one-click copy. Treat full export and per-error copy as two different support tools.

## Open Questions

- Are the current PRD, design, and implementation plan ready for review before moving the task from planning to implementation?
