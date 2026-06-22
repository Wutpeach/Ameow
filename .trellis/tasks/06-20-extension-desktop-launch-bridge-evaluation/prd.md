# Evaluate browser extension desktop app launch bridge

## Goal

Evaluate whether Ameow's browser extension can launch or wake the Ameow desktop app when the desktop app is not already running, and decide whether this capability should become a future implementation task.

User-facing value:

- Browser-side actions such as the page-edge cat launcher can recover from "desktop offline" instead of only failing with an instruction to open Ameow manually.
- The browser toolbar connection dot can become an actionable readiness signal rather than only a passive status indicator.
- Users who primarily interact from the browser can enter the Ameow workflow with less context switching.

## Confirmed Facts

### Current Ameow behavior

- The browser extension is Manifest V3 and currently uses a background service worker.
- `browser-extension/manifest.json` currently has no `nativeMessaging` permission.
- Repository search found no existing:
  - `chrome.runtime.connectNative(...)`;
  - `chrome.runtime.sendNativeMessage(...)`;
  - native messaging host manifest;
  - Windows registry registration scripts for native messaging;
  - `ameow://` custom protocol/deep-link registration.
- Current browser-to-desktop communication is WebSocket-based:
  - `browser-extension/background.js` connects to `ws://127.0.0.1:39527`;
  - when the desktop app is not running, WebSocket requests fail with `not_connected`;
  - browser-injected launcher feedback currently tells the user to open the desktop app.
- Ameow has two relevant Windows packaging modes:
  - installer build through `electron-builder` NSIS;
  - portable ZIP build through `scripts/package-portable.ps1`.
- The portable package currently copies the unpacked Electron app and browser extension ZIP, but does not register OS/browser integration.

### Browser platform facts

- Chrome native messaging allows an extension to communicate with a registered native application through `runtime.connectNative()` or `runtime.sendNativeMessage()`.
- Chrome starts the registered native messaging host as a separate process and communicates over stdio.
- Native messaging requires:
  - the extension manifest permission `nativeMessaging`;
  - a native messaging host manifest;
  - `allowed_origins` matching the extension ID;
  - OS/browser-specific host registration.
- Chrome native messaging host registration on Windows uses registry keys such as `HKCU\Software\Google\Chrome\NativeMessagingHosts\<host_name>`.
- Microsoft Edge supports the same native messaging model, with Edge-specific registry keys and fallback search through Chromium/Chrome native messaging host keys.
- Native messaging methods are available in extension pages and the service worker, not directly inside content scripts; content scripts must ask the service worker to call the native host.
- A custom protocol/deep link route such as `ameow://open` may also be technically possible, but it is less suited to structured health checks and response handling than native messaging.

Sources:

- Chrome Native Messaging docs: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- Microsoft Edge Native Messaging docs: https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging

## Candidate Approaches

### A. Native messaging launcher host

Shape:

- Add `nativeMessaging` permission to the browser extension.
- Provide a native messaging host named something like `com.ameow.desktop`.
- Register the host during installer setup, and possibly through a user-triggered setup command for portable builds.
- Extension service worker calls the host when WebSocket is offline and the user triggers a browser action.
- The host launches or focuses Ameow, then the extension waits for WebSocket readiness.

Pros:

- Official browser-extension-to-native-app bridge.
- Can return structured success/failure responses.
- Can support future health checks and repair guidance.
- Better fit for Chrome/Edge than opening arbitrary external URLs.

Cons:

- Requires stable extension IDs in `allowed_origins`.
- Requires OS/browser-specific registration.
- Adds installer and portable setup complexity.
- Requires careful native host protocol implementation; stdout must be reserved for native messaging frames.

### B. Custom protocol / deep link

Shape:

- Register an `ameow://...` protocol handler for the desktop app.
- Extension opens a URL such as `ameow://open` when desktop is offline.
- Extension then waits for the existing WebSocket to come online.

Pros:

- Conceptually simpler than native messaging.
- Can be useful outside the extension too, for docs or website "open Ameow" links.

Cons:

- Browser may show confirmation prompts.
- Harder to know whether launch succeeded.
- Weak fit for structured error reporting.
- Still requires OS registration and packaging work.

## Recommended Direction

Prefer native messaging for the browser-extension launch bridge evaluation.

Reasoning:

- The user action originates inside the extension, not a web page.
- The extension already has a service worker that can mediate content-script requests.
- We need reliable launch/health feedback, not only "try opening something".
- Chrome and Edge both document native messaging as the intended bridge to registered native applications.

Custom protocol may still be worth evaluating as a complementary future capability, but should not be the primary browser extension launch path unless native messaging is rejected for packaging or distribution reasons.

## Planning Requirements

- Decide the first supported platform/browser target before implementation planning.
- Evaluate installer and portable distribution separately, because they have different registration expectations.
- Define how the extension should behave when launch is unavailable:
  - keep current "Open desktop app" guidance;
  - optionally offer setup/repair guidance in the popup or docs.
- Do not implement launch behavior in this task until feasibility and scope are agreed.
- If implementation proceeds later, create a separate implementation task with `design.md` and `implement.md`.

## Acceptance Criteria For This Planning Task

- [ ] Feasibility of native messaging is documented for Ameow's current extension architecture.
- [ ] Feasibility of custom protocol/deep link is documented at comparison level.
- [ ] Platform and distribution constraints are called out, especially Windows installer vs Windows portable.
- [ ] The user chooses whether the next task should prototype native messaging, deep link, or defer the feature.
- [ ] No product code is changed as part of this planning-only task unless the user explicitly asks to proceed.

## Out Of Scope

- Implementing `nativeMessaging` permission or host registration.
- Implementing custom protocol registration.
- Changing the current WebSocket protocol.
- Changing toolbar connection dot visuals.
- Redesigning launcher/popup offline UI beyond feasibility notes.

## Open Questions

- Which target should define the first feasibility milestone: Windows installer only, Windows portable too, or cross-platform from the beginning?
