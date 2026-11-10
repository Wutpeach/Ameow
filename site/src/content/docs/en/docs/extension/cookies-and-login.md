---
title: Cookies and login
description: Current Rust does not import browser sessions.
---

Current Rust / GPUI handles public media links; it does not provide the old extension's cookie or browser-session import. A browser being able to play content restricted by login, membership, or region does not mean the current app can download it.

Do not submit cookies, tokens, or login details in issue reports. For historical Electron / extension behavior, see the [v0.3.1 source](https://github.com/Wutpeach/Ameow/tree/v0.3.1) and [release](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1).
