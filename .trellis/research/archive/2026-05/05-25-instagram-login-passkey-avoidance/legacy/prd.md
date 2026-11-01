# Site login native prompt avoidance

## Goal

Improve site-session capture reliability before adding WebAuthn/passkey interception: harden capture-window permissions, make the Electron login window closer to a normal browser environment, and supplement saved cookies from additional observed browser sources when feasible.

## Confirmed Facts

- Site-session capture opens a real visible Electron `BrowserWindow` from `electron/main.mts`.
- The capture window is a real Chromium-backed Electron web page, but it is not the user's default system browser and does not use the user's normal Chrome / Edge / Firefox profile.
- The capture window uses an isolated Electron session partition and loads `site.loginUrl`.
- Instagram's passkey prompt is triggered by the official Instagram page through browser WebAuthn / credential APIs, not by Ameow storing cookies directly.
- Current code has no site-specific handling for WebAuthn, passkeys, or authenticator prompts.
- Electron 41's local type definitions expose `session.setPermissionCheckHandler(...)` and `session.setPermissionRequestHandler(...)`, but the permission unions do not include a dedicated `webauthn` or `passkey` permission.
- Electron 41 exposes session preload script registration through `registerPreloadScript({ filePath, type: "frame" })`; this may allow an Instagram-only capture-window script to run before page scripts.
- Stored cookie capture must remain confirmation-based and must not claim background or silent auto-login.
- Claude second-opinion review agreed that Electron 41 has no robust per-window/per-session WebAuthn disable API.
- Claude recommended avoiding global Chromium WebAuthn flags because they affect the whole app and are not stable enough for this scoped capture-window behavior.
- Claude recommended a combined approach:
  - site-specific preload interception of `navigator.credentials.get/create` for passkey-prone capture windows;
  - session permission hardening for capture windows to deny unrelated native prompts such as camera, HID, USB, serial, notifications, and external-open requests;
  - user-facing fallback guidance when a Windows-owned prompt still appears.
- Permission handlers can help with non-passkey native prompts, such as camera/media prompts, but do not gate Windows Hello / passkey WebAuthn requests.
- The reference project `jiji262/douyin-downloader` uses Playwright to open a real browser for manual Douyin login, then saves cookies from `context.storage_state()` after the user confirms in the terminal.
- `douyin-downloader` observes request cookie headers and `msToken` values from URLs / headers / document cookies / localStorage / sessionStorage to supplement cookies that are not present in the normal browser cookie jar.
- `douyin-downloader` does not contain WebAuthn / passkey-specific handling, `navigator.credentials` interception, Playwright permission denial, or a Chromium flag intended to disable Windows Security prompts.
- `douyin-downloader`'s runtime browser fallback uses Chromium launch args for automation evasion and sandbox/runtime compatibility (`--disable-blink-features=AutomationControlled`, `--disable-dev-shm-usage`, `--no-sandbox`), but these are not passkey or Windows Security mitigations.
- The useful upstream reference is therefore the manual-browser-container + explicit confirmation + multi-source cookie extraction model, not a direct solution for OS-owned security prompts.
- Ameow's current capture flow uses an in-app Electron `BrowserWindow` with an isolated session partition, while `douyin-downloader` uses Playwright to launch a separate browser context.
- Directly opening the user's default system browser would make login feel familiar, but Ameow cannot reliably read cookies from that browser afterward because browser cookie stores are encrypted, browser-specific, profile-specific, often locked while the browser is running, and not consistently accessible across Chrome / Edge / Firefox / Safari.
- A Playwright-launched browser is technically closer to `douyin-downloader`, but it would add another browser automation/runtime dependency to the desktop app and still would not guarantee avoiding Windows Security prompts.
- The current Electron capture-window approach is better aligned with Ameow's Settings-managed site-session model because it keeps cookie capture scoped, explicit, cross-platform, and under app-owned storage without importing the user's whole browser profile.

## Requirements

- Site-session capture should reduce avoidable native prompts when the prompt source can be blocked through ordinary Electron session permission handling.
- The Electron login window should look less like an Electron app page and more like a normal desktop Chromium browser from the site perspective, without importing the user's real browser profile.
- Cookie capture should continue to use the Electron cookie jar as the primary source and may merge additional same-site cookie values observed during the capture window session.
- The implementation must be scoped to site-session capture windows and must not change normal browsing or downloader execution behavior.
- The implementation must preserve the existing manual login flow: user logs in on the official site page, then returns to Settings and confirms saving cookies.
- The task must not collect, request, or store passkeys, Windows Hello credentials, or account passwords.
- The task should keep the app-owned capture-window model unless later evidence shows a Playwright/system-browser flow provides a clearly better login-success rate without weakening privacy or packaging reliability.
- Active `navigator.credentials` / WebAuthn interception is intentionally deferred until after these lower-risk changes are observed.

## Acceptance Criteria

- [ ] Starting any site-session capture applies capture-window permission hardening for permissions the app does not need.
- [ ] Starting a site-session capture uses a normal-browser-like capture environment, including a sanitized user agent and appropriate language/window defaults.
- [ ] Confirming a capture can save same-site cookies from the Electron cookie jar plus safe supplemental sources observed during the capture.
- [ ] The capture window still loads `https://www.instagram.com/` and can save `instagram.com` cookies after login.
- [ ] The Douyin capture window still loads `https://www.douyin.com/` and can save `douyin.com` cookies after login.
- [ ] The implementation does not add active `navigator.credentials.get/create` interception in this task.
- [ ] Focused tests cover permission hardening decisions, supplemental cookie merging, same-site filtering, and existing Instagram/Douyin readiness behavior.
- [ ] Type-check and lint pass.

## Out Of Scope

- Active WebAuthn/passkey or `navigator.credentials.get/create` interception.
- Reading cookies from the user's default system browser profile.
- Switching login capture from Electron to Playwright.
- Storing passwords, passkeys, Windows Hello credentials, or any credential material other than site cookies required by downloaders.

## Notes

- Windows Security passkey prompts are OS-owned UI. Ameow can try to prevent the web page from requesting passkeys, but it cannot control the OS chooser once Chromium has started the WebAuthn request.
