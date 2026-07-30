## Scenario: Protected Image Browser-Context Fallback Contract

### 1. Scope / Trigger

- Trigger: Frontend image drag/drop calls `download_image` with an optional protected-image fallback hint, and backend may ask the browser extension to resolve image bytes when direct/native fetch is rejected.
- Why this needs code-spec depth: This is a four-hop contract (`drag payload` -> `frontend invoke` -> `Rust WS broadcast` -> `extension resolution result`) where request IDs and field names must stay aligned for the synchronous fallback path to complete.

### 2. Command / WS Signatures

Frontend command usage:

```ts
await invoke<string>("download_image", {
  url: "https://cdn.example.com/protected.jpg",
  targetDir: "D:\\Downloads",
  protectedImageFallback: {
    token: "opaque-token",
    pageUrl: "https://www.example.com/page",
    imageUrl: "https://cdn.example.com/protected.jpg",
  },
});
```

Rust command boundary:

```rust
#[tauri::command]
async fn download_image(
    app: AppHandle,
    url: String,
    target_dir: Option<String>,
    protected_image_fallback: Option<ProtectedImageFallbackInput>,
) -> Result<String, String>
```

Desktop -> extension WS action:

```json
{
  "action": "resolve_protected_image",
  "data": {
    "requestId": "protected-image-1",
    "token": "opaque-token",
    "imageUrl": "https://cdn.example.com/protected.jpg",
    "pageUrl": "https://www.example.com/page",
    "targetDir": "D:\\Downloads"
  }
}
```

Extension -> desktop WS result:

```json
{
  "action": "protected_image_resolution_result",
  "data": {
    "requestId": "req_123",
    "correlationRequestId": "protected-image-1",
    "success": true,
    "filePath": "D:\\Downloads\\protected.jpg"
  }
}
```

### 3. Field Contracts

- Frontend `download_image` payload:
  - `url: string` is still the canonical direct-download target.
  - `protectedImageFallback?: { token: string; pageUrl?: string | null; imageUrl?: string | null }`
  - `protectedImageFallback.token` must be non-empty when provided.
  - `pageUrl` / `imageUrl` are advisory hints only; backend must normalize and validate them before use.
- Rust direct/fallback ownership:
  - Backend must try direct `download_image` first.
  - Backend may attempt protected-image fallback only when:
    - `protected_image_fallback` exists, and
    - direct failure is hotlink-like (`401`, `403`, HTML/text response, or equivalent).
  - Backend must keep this flow synchronous from the command caller's point of view.
- Desktop -> extension `resolve_protected_image`:
  - `data.requestId` is the desktop-generated correlation key for the waiting oneshot.
  - `data.token` is required and must match a registered short-lived drag token in extension background.
  - `data.imageUrl` is the preferred image target to resolve in browser context.
  - `data.pageUrl` is optional page-context validation.
  - `data.targetDir` is optional convenience context; actual persistence still goes through backend `save_data_url`.
- Extension -> desktop `protected_image_resolution_result`:
  - Extension transport request still carries its own `data.requestId` for normal pending-map resolution.
  - `data.correlationRequestId` must echo the original desktop `resolve_protected_image.data.requestId`.
  - `data.success` controls whether backend resolves or rejects the waiting fallback path.
  - `data.filePath` is required on success.
  - `data.code` / `data.error` are optional but strongly recommended on failure.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior |
|-----------|------------------|-------------------|
| `protectedImageFallback` absent | Rust command entry | Direct image path only |
| Direct image fetch succeeds | Rust direct path | Do not broadcast `resolve_protected_image` |
| Direct image fetch fails with `403` / HTML rejection | Rust fallback gate | Broadcast `resolve_protected_image` and wait synchronously |
| Extension token missing/expired | Extension background registry | Send `protected_image_resolution_result` with failure code `protected_image_token_missing` |
| Content script cannot resolve bytes | Extension content script | Send failure with actionable `code` / `error` |
| `save_data_url` succeeds after browser resolution | Extension background + Rust save path | Reply with `success=true` and final `filePath` |
| `correlationRequestId` missing in result | Rust WS handler | Reject response as invalid and keep no stale pending sender |
| No extension result before timeout | Rust timeout path | Fail command with protected-image timeout error and runtime breadcrumb |

### 5. Good / Base / Bad Cases

- Good:
  - Direct image request returns `403 text/html`, backend broadcasts `resolve_protected_image`, extension resolves bytes, calls `save_data_url`, and backend returns the saved path from the original `download_image` command.
- Base:
  - Public image drag succeeds directly and never touches the protected-image WS path.
- Bad:
  - Extension sends only its local `requestId` and forgets `correlationRequestId`, leaving backend waiting until timeout.
  - Backend retries protected-image fallback for every image error, including DNS or malformed-URL failures.

### 6. Tests Required (with assertion points)

- Rust/unit:
  - Support-log runtime evidence retains `protected_image_fallback_requested` and `protected_image_fallback_complete`.
  - Hotlink-like error classifier matches `403` / HTML rejection but does not trigger on unrelated errors.
- Extension/runtime:
  - Dragging a protected browser image registers a token in background before drop completes.
  - Background receives `resolve_protected_image` and sends `protected_image_resolution_result` with matching `correlationRequestId`.
- End-to-end:
  - Protected image drag that fails direct fetch still saves into FlowSelect `outputPath`.
  - Public image drag continues to resolve through direct path only.
  - Disconnected extension or expired token fails clearly instead of hanging indefinitely.

### 7. Wrong vs Correct

#### Wrong

```json
{
  "action": "protected_image_resolution_result",
  "data": {
    "requestId": "req_123",
    "success": false
  }
}
```

#### Correct

```json
{
  "action": "protected_image_resolution_result",
  "data": {
    "requestId": "req_123",
    "correlationRequestId": "protected-image-1",
    "success": false,
    "code": "protected_image_token_missing",
    "error": "Protected image drag token was missing or expired"
  }
}
```

---
