# Design: 本地化下载错误信息

## V1 Scope

After product discussion, V1 is docs-first:

- Keep the current desktop full-window error display unchanged.
- Do not add a copy button, popover, localized runtime payload, or frontend error normalization in V1.
- Update the public troubleshooting docs so users and support can search the exact raw errors currently shown by the app.
- Preserve the UI-localization design below as a later-phase direction, not the V1 implementation target.

## Architecture

This task should introduce one structured download-failure view model instead of letting the full-window overlay render raw stderr directly.

Proposed layers:

1. Runtime preserves structured facts.
   - Extend `DownloadResultPayload` with optional `errorCode`, `errorClassification`, and `rawError`.
   - Keep `error` for compatibility, but treat it as legacy summary text.
   - `ElectronRuntimeService` already converts failures to `DownloadRuntimeError`; it should emit `runtimeError.code` and `runtimeError.classification` with the complete message.

2. Frontend derives a localized failure view.
   - Add a pure helper such as `src/utils/downloadErrorMessages.ts`.
   - Input: `DownloadResultPayload`, current cancelling state, translator, and optional source/site hints if available.
   - Output:
     - `cancelled: boolean`
     - `summary: string`
     - `detail: string | null`
     - `code?: DownloadErrorCode`
     - `classification?: DownloadFailureClassification`
     - `messageKey` or `kind` for tests and future docs links

3. UI renders the view model.
   - `ForegroundOutcomeOverlay` should still be compact and state-focused.
   - Primary overlay copy should be a short localized summary, ideally one or two lines.
   - Raw technical detail should be retained as a secondary detail/title/copy path, not the first visible text.

## Data Flow

```text
yt-dlp/gallery-dl/douyin-dl stderr
  -> DownloadRuntimeError(code, classification, message)
  -> video-download-complete payload(error, errorCode, errorClassification, rawError)
  -> resolveDownloadCompleteOutcome / download error message helper
  -> App download outcome state
  -> ForegroundOutcomeOverlay summary + preserved detail
```

## Matching Precedence

The frontend failure helper should choose the most specific message first:

1. Explicit cancellation:
   - `isCancelling === true`
   - `errorCode === "E_ABORTED"`
   - `errorClassification === "cancelled"`
   - raw message contains `cancelled` or `canceled` as legacy fallback
2. Site-specific upstream pattern:
   - BiliBili `HTTP Error 412 Precondition Failed`
   - YouTube bot/sign-in messages
   - Douyin fresh cookies
3. Cross-site upstream pattern:
   - HTTP 403/404/416/429
   - timeout/network/DNS/connection failures
   - format unavailable/no formats found
   - ffmpeg/conversion failures
   - output path missing
4. Internal runtime code/classification:
   - auth required, invalid input, engine unavailable, no provider, no engine succeeded
5. Generic fallback:
   - localized “下载失败，请保留完整错误详情反馈”
   - original raw error retained as detail

## UI Copy Direction

Ameow is a compact product UI. The overlay should stay readable within two seconds and avoid large warning blocks.

Recommended overlay examples:

- Cancelled: `下载已取消`
- BiliBili 412: `BiliBili 拒绝了元数据请求`
- Auth required: `需要登录态或 Cookie`
- Network: `网络或代理连接失败`
- Format unavailable: `当前画质不可用`
- ffmpeg/conversion: `合并或转换失败`
- Output missing: `没有找到最终文件`

Recommended detail examples:

- BiliBili 412 detail: `请先在浏览器确认页面可播放，通过扩展重新发送或刷新 BiliBili 登录态；仍失败时更新 yt-dlp/Ameow，并反馈完整错误。`
- Network detail: `检查代理是否接管 Ameow 和下载器进程，换公开视频测试。`
- Format detail: `换较低质量或手动画质后重试；如果所有画质都失败，更新 yt-dlp/Ameow。`

## Component Boundary

`ForegroundOutcomeOverlay` currently accepts only `errorMessage: string | null` and renders it in a small `span` plus `title`.

Preferred change:

- Rename or extend props to accept:
  - `errorSummary: string | null`
  - `errorDetail?: string | null`
  - `errorTitle?: string | null`
- Keep the visible span concise and use `errorTitle` for raw details if no explicit copy UI is added.
- If a copy affordance is added, it should not make the ephemeral 1.5s overlay hard to use. A stable failure detail entry in the task queue or a compact details affordance is safer than a tiny timed button.

Clarified UI recommendation:

- Conceptually, yes: users need a way to copy the detailed raw error after seeing the short localized summary.
- Do not put a normal text button under the current transient center overlay unless the overlay becomes stable long enough to interact with. The current foreground outcome overlay is timed, compact, and mostly non-interactive, so a disappearing copy target would be frustrating.
- Preferred V1: full-window center overlay shows only the short localized summary; a stable failure detail surface, such as the failed task row or a compact details popover, provides an icon copy button with tooltip `复制错误详情` / `Copy error details`.
- If product wants the copy action directly in the center overlay, extend the failure outcome duration and make only a small icon button interactive. The visible copy should remain short, and raw stderr should not become the main text block in the overlay.

## Compatibility

- Keep `DownloadResultPayload.error` optional so older callers/tests stay valid during the migration.
- New fields should be optional and additive.
- Runtime telemetry can keep its existing `errorMessage`; it can optionally record code/classification later.
- Existing docs already list internal `E_*` codes; update the same pages instead of creating a second troubleshooting location.

## Risks

- Over-specific pattern matching can mislabel unrelated errors. Prefer concise summaries with preserved raw detail.
- Hiding raw details entirely will slow support triage.
- Showing long raw details in the 200x200 overlay will break Ameow’s compact UI and repeat the current problem.
- Sending `code`/`classification` to the renderer requires updating tests across runtime, reducer, and type contracts.
