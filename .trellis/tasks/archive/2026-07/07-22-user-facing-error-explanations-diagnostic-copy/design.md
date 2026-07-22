# User-facing error explanations and diagnostic copy design

## Scope

MVP covers only the existing center outcome prompt for:

- video download failures;
- video transcode failures.

MVP does not redesign Settings support-log export or other error surfaces.

## Architecture

### Runtime failure shape

The current runtime already has `DownloadRuntimeError` with:

- `code`;
- `classification`;
- `message`;
- optional `context`;
- fallback eligibility.

The renderer currently receives only `DownloadResultPayload.error`. MVP should extend the runtime-to-renderer result payload for failures so the frontend does not need to infer every category from a truncated string.

Recommended failure detail shape:

```ts
type RuntimeFailureDiagnostic = {
  code?: string;
  classification?: string;
  rawMessage: string;
  userUrl?: string;
  context?: Record<string, unknown>;
};
```

`DownloadResultPayload` can add an optional `failure?: RuntimeFailureDiagnostic`.

Download failure emit sites must preserve structured data at the point where it is still available. The active request URL should be forwarded in the failure payload instead of reconstructed later from a task map.

Important download paths to inspect and update during implementation:

- orchestrated download failures that currently emit only `runtimeError.message`;
- cancellation paths, which should remain cancellation states and should not produce diagnostic-copy failure UI;
- advanced-quality probe failures, which should either produce structured failure details or intentionally fall back to the generic failure category.

Transcode failures currently arrive as `VideoTranscodeTaskPayload.error`. MVP can either add a matching optional `failure` field to transcode task payloads or build a transcode-specific failure diagnostic in the renderer from the task payload plus recent runtime logs. Prefer adding a matching field if the backend has enough structured information at the transcode failure emission point.

Transcode must not be treated as user cancellation merely because it is unsuccessful. Add a lightweight transcode failure diagnostic/category path. Most true transcode failures can map to `transcode_merge`, while output/write and network-like patterns may map to their more specific approved categories when reliable.

### User-facing explanation layer

Add a small shared helper that maps structured failure data to an app-localized prompt category and translation key.

The helper should:

- accept `code`, `classification`, `rawMessage`, and optional context;
- classify into the approved MVP categories;
- return a stable category id and i18n key;
- avoid returning raw stderr/code as visible copy.

MVP category ids:

- `auth_login_state`;
- `network_proxy`;
- `content_unavailable`;
- `output_write`;
- `quality_format_unavailable`;
- `runtime_downloader_unavailable`;
- `transcode_merge`;
- `unclassified`.

### Center prompt interaction

`ForegroundOutcomeOverlay` should support an optional diagnostic copy action for failure prompts.

Changes needed:

- Keep success/cancel prompt behavior unchanged.
- For real failures, render one compact localized sentence plus a local lucide-style copy icon.
- Make only the copy icon/button interactive; avoid turning the full prompt into a panel.
- Failed prompts stay visible for 5 seconds.
- Copy success dismisses the transient center prompt immediately.
- Existing `dismissTransientCenterOverlay()` already interrupts transient prompts when new download/transcode progress starts; keep using that path.
- Add or extend center outcome state so `showForegroundTaskOutcome(...)` can carry optional failure diagnostic data through to the overlay.
- Do not drive real failure UI through a `cancelled` boolean. Keep cancellation and failure distinct enough that cancellation hides copy UI and uses short timing, while real failure shows the compact message and copy icon.

The current overlay has `pointerEvents: "none"` at multiple levels. Implementation must carefully enable pointer events only around the copy button, without making the whole overlay intercept unrelated dragging/hover behavior.

Recommended overlay-facing props:

```ts
type ForegroundOutcomeOverlayProps = {
  outcomeVisible: boolean;
  cancelled: boolean;
  errorMessage: string | null;
  showCopyAction?: boolean;
  onCopyDiagnostic?: () => void;
  copyDiagnosticLabel?: string;
  // existing color/icon props...
};
```

### Copy icon

Do not add `lucide-react` or another icon package.

Add a local `CopyIcon` to `src/components/icons/AppIcons.tsx` using lucide-compatible SVG path data and the existing `BaseIcon` styling.

### Diagnostic copy payload

The copy button should copy valid JSON to the clipboard. The intended support workflow is that users paste this content back to the developer, and the developer may hand it to AI-assisted tooling for structured analysis.

Include:

- app version;
- platform and arch when available;
- timestamp;
- trace id;
- failure surface (`download` or `transcode`);
- visible localized message;
- original user URL when available;
- raw error code and classification when available;
- raw technical message;
- safe context fields;
- recent 120 runtime log lines after redaction.

Recommended JSON shape:

```ts
type ErrorDiagnosticCopyPayload = {
  schemaVersion: 1;
  generatedAt: string;
  app: {
    version: string;
    platform?: string;
    arch?: string;
    language?: string;
  };
  failure: {
    surface: "download" | "transcode";
    traceId?: string;
    userMessage: string;
    category: string;
    url?: string;
    code?: string;
    classification?: string;
    rawMessage?: string;
    context?: Record<string, unknown>;
  };
  runtimeLog: {
    excerptLineCount: number;
    lines: string[];
  };
  redaction: {
    applied: true;
    preservedOriginalUrl: true;
  };
};
```

The actual copied text should be JSON serialized from this structure with multi-line indentation, for example `JSON.stringify(payload, null, 2)`. If a field is unavailable, omit it or use an explicit `null` only when the distinction matters.

### Clipboard bridge

The renderer bridge currently exposes only `clipboard.readImage()`. Browser `navigator.clipboard.writeText(...)` may work depending on Electron permissions, but a stable Electron-owned command is safer.

Recommended implementation:

- add a renderer command such as `copy_error_diagnostics`;
- build or fetch the diagnostic text in the main process when practical;
- use Electron clipboard in main process to write the text;
- return success/failure to the renderer so the UI can dismiss only after successful copy.
- add the new command to `AmeowRendererCommand`;
- register a main-process controller for the command, following the existing command-controller pattern.

Decision: use a main-process command for MVP. Do not rely on `navigator.clipboard.writeText(...)` for the primary path.

### Runtime log excerpt

Reuse the runtime log source used by `electron/supportLogExport.mts` where possible.

Diagnostic copy should include the most recent 120 runtime log lines. If the log cannot be read, include a clear placeholder such as `<runtime log unavailable: ...>` instead of failing the copy operation.

### Redaction

Apply redaction to context and runtime log excerpts before copying.

Minimum redaction targets:

- `Cookie` / `cookies` values;
- `Authorization` headers;
- bearer tokens;
- common token/password/session key names;
- raw account identifiers when they appear as explicit fields.

Original user URLs are intentionally preserved for reproduction.

### Documentation

Keep the existing Settings support-log export as a separate complete diagnostic export.

This task may share redaction helpers with support-log export if useful, but it should not replace full export with clipboard copy.

Docs-site troubleshooting/error pages must be updated during wrap-up so users know the center failure prompt can copy diagnostic JSON. The docs should keep the feature explanation user-facing: when a download or transcode failure appears, click the copy icon and paste the copied JSON to the developer for troubleshooting.

## Compatibility

- Existing success prompt timing and visuals should remain unchanged.
- User-initiated cancellation should remain a short localized cancellation prompt, without diagnostic copy.
- Existing raw error logs should continue to log original technical details.
- `DownloadResultPayload` additions must be optional to avoid breaking older tests and intermediate event producers.

## Risks

- Center prompt width is small, especially for English. Copy must be short and clamped/wrapped safely.
- Pointer event changes in the center overlay can interfere with compact/full window interaction if applied too broadly.
- Runtime log excerpts can contain sensitive values unless redaction is centralized and tested.
- If only renderer-side string parsing is used, classifications may drift from runtime behavior.
- JSON copied to chat is less human-friendly than a prose diagnostic report, but it better serves the expected AI/developer analysis flow.

## Validation Strategy

- Unit tests for failure-to-category mapping.
- Unit tests for diagnostic text building.
- Unit tests that copied diagnostics parse as valid JSON with the expected schema fields.
- Unit tests for redaction.
- Type-check payload additions.
- UI/layout checks for zh-CN and en center prompt text.
- Manual packaged or dev Electron check that copy writes to clipboard and dismisses the prompt.
