## Scenario: Browser Extension WS `save_data_url` Contract

### 1. Scope / Trigger

- Trigger: Browser extension (`background.js`) requests screenshot save through WS action `save_data_url`.
- Why this needs code-spec depth: This is a cross-layer runtime contract (`content script` -> `extension background` -> `WS` -> `Rust`) where field drift silently breaks fallback behavior.

### 2. Request / Response Signatures

Request action:

```json
{
  "action": "save_data_url",
  "data": {
    "requestId": "req_...",
    "dataUrl": "data:image/png;base64,...",
    "originalFilename": "title@00-12-34.png",
    "requireRenameEnabled": true
  }
}
```

Rust response envelope:

```json
{
  "success": true | false,
  "message": "optional detail",
  "data": {
    "requestId": "req_...",
    "code": "optional_error_code"
  }
}
```

### 3. Field Contracts

- `action` must be exactly `save_data_url`.
- `data.requestId` is required for request-response matching in extension pending map.
- `data.dataUrl` must be a `data:` URL payload accepted by backend `save_data_url`.
- `data.originalFilename` is optional and used by backend naming path.
- `data.requireRenameEnabled`:
  - `true`: backend must reject with code `rename_disabled` when rename toggle is off.
  - `false`/absent: backend may save regardless of rename toggle.

### 4. Validation & Error Matrix

| Condition | Backend Result | `data.code` | Extension Behavior |
|-----------|----------------|-------------|--------------------|
| Rename enabled + save succeeds | `success: true` | absent | Keep FlowSelect save path |
| Rename disabled + `requireRenameEnabled=true` | `success: false` | `rename_disabled` | Fallback to browser download |
| Invalid payload (missing `dataUrl`) | `success: false` | `missing_data_url` | Fallback to browser download |
| Save failure (`save_data_url` command error) | `success: false` | `save_data_url_failed` | Fallback to browser download |
| WS closed/timeout on extension side | local failure | `ws_closed` / `request_timeout` | Fallback to browser download |

### 5. Good / Base / Bad Cases

- Good:
  - Response echoes matching `requestId`.
  - Rename toggle on -> screenshot save uses FlowSelect path.
  - Rename toggle off + strict mode -> explicit `rename_disabled`.
- Base:
  - Missing optional `originalFilename` still saves with backend default naming.
- Bad:
  - Response omits `requestId` and pending request never resolves.
  - Backend changes `code` literals without extension fallback mapping update.

---
