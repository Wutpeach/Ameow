# Site login capture hardening design

## Scope

This task keeps Ameow's existing app-owned Electron capture-window model. It improves the capture window before attempting WebAuthn/passkey interception:

- deny unneeded capture-session permissions;
- make the capture window closer to a normal desktop Chromium browser;
- supplement cookie capture from observed same-site cookie sources.

Active `navigator.credentials` / WebAuthn interception is explicitly out of scope for this task.

## Architecture

`electron/main.mts` remains responsible for creating the visible `BrowserWindow` and wiring Electron-specific session behavior. `electron/siteSessionManager.mts` remains responsible for lifecycle, filtering, validation, and writing `<userDataDir>/site-sessions/<siteId>.json`.

The site-session manager should gain a narrow supplemental-cookie contract so tests can exercise merging without depending on Electron:

```ts
readSupplementalCookies?(partition: string): Promise<Record<string, string>>;
```

The manager will merge supplemental cookies with cookie-jar cookies after applying the same allowed-domain boundary. Cookie-jar cookies stay primary because they include domain/path/secure/expires metadata needed for the Netscape cookie file. Supplemental cookies only fill missing cookie names in the persisted `cookies` / `cookieHeader` records unless a later implementation can safely map metadata.

## Permission hardening

For each capture partition, configure Electron permission handlers before `loadURL`.

The capture window does not need device or notification access. Permission check/request handlers should deny at least:

- camera / microphone / media;
- notifications;
- geolocation;
- midi;
- pointer lock / fullscreen-like disruptive prompts when represented as permissions;
- HID / USB / serial / Bluetooth-like device APIs when Electron surfaces them as permissions;
- unknown permission requests by default unless the app explicitly needs them.

This does not stop OS-owned WebAuthn/passkey prompts once Chromium starts a WebAuthn request, but it should reduce unrelated Windows-native prompts.

## Browser environment

The capture window should keep the isolated Electron partition and official site URL, but remove obvious Electron-specific traits where Electron exposes stable APIs:

- set a sanitized desktop Chrome-like user agent for capture windows by removing Electron-specific product tokens;
- set accept-language from the app/system language when available, with a safe fallback such as `zh-CN,zh;q=0.9,en;q=0.8`;
- keep a normal desktop viewport/window size;
- keep `contextIsolation: true`, `nodeIntegration: false`, and site isolation from the user's real browser profile.

The goal is compatibility, not stealth. Do not import the user's Chrome/Edge/Firefox profile and do not globally alter Electron app behavior.

## Supplemental cookies

The reference `douyin-downloader` project collects cookies from `storage_state()` and supplements `msToken` from request headers, URLs, `document.cookie`, and web storage. Ameow can apply the same principle inside the Electron capture session:

- observe `webRequest.onBeforeSendHeaders` for same-site requests and parse `Cookie` headers;
- optionally evaluate safe page-side values such as `document.cookie`, `localStorage`, and `sessionStorage` at confirmation time;
- parse only cookie-like `name=value` pairs;
- filter resulting names/values through existing cookie record sanitization;
- never store passwords, passkeys, authorization headers, or arbitrary localStorage blobs.

Same-site filtering is mandatory. Supplemental values must be associated with the site being captured and must not leak cross-site cookies into a saved site session.

## Compatibility and rollback

The change is scoped to site-session capture partitions. If a site fails because a permission is denied or the sanitized user agent causes regressions, rollback is localized to capture-window setup in `electron/main.mts`.

Stored session file format can remain backward-compatible. Adding supplemental cookies only changes the `cookies` object and `cookieHeader`; the existing `cookiesNetscape` string remains generated from real Electron cookie-jar records.

