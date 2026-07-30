## Scenario: Startup Language Bootstrap Contract

### 1. Scope / Trigger

- Trigger: Any change to app language bootstrap, `get_config` / `save_config` language handling, native tray language loading, or frontend startup consumption of config language.
- Why this needs code-spec depth: The startup language is a cross-layer contract (`config JSON` -> `Rust bootstrap` -> `native tray labels` -> `frontend i18n bootstrap`) that can drift silently if each layer resolves locale independently.

### 2. Signatures

Current Rust signatures and helpers:

```rust
#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<String, String>

#[tauri::command]
fn save_config(app: tauri::AppHandle, json: String) -> Result<(), String>

fn resolve_current_app_language(app: &tauri::AppHandle) -> Result<&'static str, String>

pub fn detect_system_locale() -> Option<String>

pub fn resolve_startup_language_from_config_str(
    config_raw: &str,
    system_locale: Option<&str>,
) -> StartupLanguageDecision

pub fn persist_resolved_language_in_config(config_raw: &str, language: &str) -> Option<String>
```

Frontend startup consumer:

```ts
const configStr = await invoke<string>("get_config");
const initialLanguage = resolveAppLanguageFromConfigString(
  configStr,
  navigator.language,
);
```

Config key contract:

```json
{
  "language": "en" | "zh-CN"
}
```

### 3. Contracts

- `config.language` is the canonical app-language preference once it exists and normalizes to a supported value.
- Supported app languages remain exactly:
  - `en`
  - `zh-CN`
- Normalization rules:
  - English variants such as `en`, `en-US`, `en_GB` normalize to `en`
  - Chinese variants such as `zh`, `zh-CN`, `zh_Hans`, `zh-TW` normalize to `zh-CN`
  - Unsupported locales normalize to no value and fall back to English
- Startup authority contract:
  - Rust `resolve_current_app_language(...)` is the authoritative startup-language resolver for native surfaces.
  - Native tray creation must use the language returned by `resolve_current_app_language(...)`.
  - Frontend startup must continue to read `get_config` and bootstrap i18n from the returned config string.
- First-launch persistence contract:
  - If config JSON exists and is a valid object but `language` is missing or unsupported, Rust may resolve from system locale and must persist the normalized result back into config before native tray labels are created.
  - If config JSON exists but is invalid/non-object, Rust must still resolve a runtime startup language from system locale or English fallback, but must not overwrite the invalid config blob during startup recovery.
  - If the config file does not yet exist, startup may resolve from system locale for the current boot without forcing an immediate file write through `get_config`.
- Save contract:
  - `save_config` compares the incoming language against the effective current app language, not only the raw saved config value.
  - When `save_config` receives a valid normalized next language that differs from the effective current language, backend must call `notify_language_changed(...)`.
  - If incoming config JSON is invalid, `save_config` must still write the raw JSON and skip language synchronization with a log message.
- WebSocket contract:
  - `get_language` must report the same effective language that native tray bootstrap uses.
  - `language_info.language` must always be one of `en` or `zh-CN`.
- Frontend contract:
  - `invoke<string>("get_config")` remains unchanged.
  - `resolveAppLanguageFromConfigString(configStr, navigator.language)` may still use `navigator.language` as a defensive fallback, but under normal startup it should receive the Rust-persisted language from config and therefore match native tray language.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Config contains valid `language` | Rust startup resolver | Saved language wins over system locale | Return normalized saved language without persistence |
| Config object missing `language` and system locale is supported | Rust startup resolver | App starts in normalized system language | Persist normalized language to config when config JSON is an object |
| Config object missing `language` and system locale is unsupported | Rust startup resolver | App starts in English | Persist `en` to config when config JSON is an object |
| Config JSON is invalid | Rust startup resolver | App still chooses runtime language safely | Do not overwrite config during startup; use system locale or English for runtime only |
| No config file exists yet | Rust startup resolver | App still chooses runtime language safely | Use system locale or English; allow config file to be created later through normal save flow |
| User changes language in Settings | `save_config` path | Active UI and tray update immediately | Compare against effective current language, write config, then emit change event |
| WebSocket client requests `get_language` | WS request path | Returned language matches tray/frontend startup language | Route through `resolve_current_app_language(...)` |

### 5. Good / Base / Bad Cases

- Good:
  - On first launch with config `{}` and system locale `zh-Hant`, Rust resolves `zh-CN`, persists it into config, tray labels start in Chinese, and frontend bootstrap reads `zh-CN` from `get_config`.
  - With saved config `{ "language": "en" }` and system locale `zh-CN`, both tray and frontend still start in English.
  - With invalid config JSON and system locale `zh-CN`, app starts in Chinese for the current session but does not overwrite the invalid config blob during startup.
- Base:
  - `resolveAppLanguageFromConfigString(...)` may still fall back to `navigator.language` if `get_config` fails entirely.
  - Unsupported locales such as `fr-FR` degrade to `en`.
- Bad:
  - Tray startup reads raw config and falls back to English while frontend independently chooses `navigator.language`, producing mixed startup languages.
  - `save_config` compares only the raw stored value and misses a change from effective runtime language to the newly saved language.
  - Startup writes a brand-new config file from `get_config` on every first run even though no explicit save occurred.

### 6. Tests Required (with assertion points)

- Rust unit tests:
  - Config language wins over system locale.
  - Missing config language resolves from supported system locale and marks persistence required when config JSON is an object.
  - Invalid config JSON resolves a runtime language safely and does not mark persistence required.
  - Persist helper updates `language` without clobbering unrelated config keys.
- Frontend tests:
  - `resolveAppLanguageFromConfigString(...)` still prefers config language over `navigator.language`.
  - Existing desktop language save tests keep writing `language` through `save_config`.
- Manual runtime checks:
  - Start the app with config `{}` and a Chinese system locale, then verify tray labels and main window both start in Chinese.
  - Start the app with config `{ "language": "en" }` and a Chinese system locale, then verify tray labels and main window both stay in English.
