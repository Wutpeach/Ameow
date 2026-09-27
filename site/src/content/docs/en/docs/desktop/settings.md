---
title: Common Settings
description: Adjust Ameow's output folder, shortcuts, launch-at-startup behavior, rename rules, download quality, and AE compatibility options.
---

import { Aside } from '@astrojs/starlight/components';

The settings page is where you tune Ameow for your workflow. You do not need to change everything up front. A good pattern is to finish one file drop and one download first, then adjust settings based on real use.

The first settings worth checking are simple: the output folder is correct, the shortcut fits your habit, and download quality stays on a steady default. Leave the rest until a concrete need appears.

[Screenshot: settings page sections for output folder, shortcut, quality, and AE compatibility]

## Output folder

The output folder decides where copied files and downloaded media are saved. You can confirm the current path in settings, or switch it quickly by dropping a folder onto the floating window.

Suggestions:

- project-based work: use a dedicated output folder per project;
- temporary collection: keep the default `Desktop/Ameow_Received`;
- missing files: open the current output folder from settings or the floating window first.

## Global shortcut

The global shortcut is useful when you move often between the browser, file manager, and editing tools.

After setting it, test it once:

1. switch to another app;
2. press the shortcut;
3. confirm Ameow appears where you expect it.

If it conflicts with another tool, choose a less common key combination.

## Launch at startup

If you want Ameow ready as a desktop collection point all the time, enable launch at startup. If you only download or organize media occasionally, keeping it off is fine.

## App updates

Ameow checks for app updates shortly after startup and continues checking periodically in the background while it is running. When a new version is available, the floating window and settings page show an update entry point.

Background checks only notify you. They do not automatically download, install, quit, or restart the app. You can still check manually from the settings page.

If you enable prerelease updates, both automatic and manual checks prefer beta / RC releases. Turn it off to return to the stable update channel.

## Rename rules

Rename rules help keep saved files organized. They are useful when you sort by project, date, source site, or media type.

After changing them, test with one small link first so you confirm the result before using them on a larger batch.

## Download quality preference

This setting controls whether Ameow favors quality, file size, or stability for web downloads.

- Highest quality: larger files, more conversion risk.
- Balanced: usually best for everyday use.
- Data saver: lighter files when bandwidth or storage matters.

If a site keeps failing on the highest setting, test the same link with Balanced first.

## AE-compatible formats

If you often move downloaded video into After Effects, pay attention to AE compatibility. The goal is to reduce cases where the download succeeds but the editing tool cannot use the result comfortably.

Suggested approach:

- reference-only media: Balanced is often enough;
- media headed into editing: favor compatibility;
- archive-quality media: accept larger files and longer processing time.

## Network proxy

The network proxy setting is located under "System & Support → Network Proxy." It controls which network path Ameow uses when downloading content.

Two modes:

- System proxy: follows the operating system's proxy settings. Most users can leave this on.
- Manual proxy: set a custom proxy address and port. Use this when your proxy tool does not capture the system proxy, or when you want Ameow to use a separate network path.

<Aside type="caution" title="When do you need manual proxy?">
	If YouTube plays in your browser but Ameow fails to download, it is usually because the browser uses a proxy that Ameow does not reach. Switch to manual proxy and enter your proxy address. See [Download Failures](../troubleshooting/download-failures/) for more.
</Aside>

## Local proxy

The local proxy is the reverse arrangement: instead of Ameow using a proxy, other programs can use Ameow. Ameow opens a port on the loopback address, you point a browser or another client at it, and Ameow takes over the outbound connection.

The setting lives under "System & Support → Local Proxy." It is off by default, with a default port of `21080`.

- HTTP and SOCKS5 share one port, so clients can use whichever protocol they support.
- It only listens on `127.0.0.1`; other devices on the same network cannot reach it.
- Outbound traffic still follows the "Network proxy" setting above: manual > system > environment > direct. The local proxy never picks a route itself.
- Do not point "Network proxy" back at the local proxy's own address: that loops. Ameow refuses such a self-route and says so in the log instead of dialing itself repeatedly.

<Aside type="note" title="How it differs from Network proxy">
	"Network proxy" decides how Ameow itself reaches the internet; "Local proxy" decides whether other programs can borrow Ameow's route. Both share the same outbound setting.
</Aside>

Typical uses:

- Set your browser's HTTP proxy to `127.0.0.1:21080` so the browser and Ameow use exactly the same network path.
- Tools that only speak SOCKS5 can use `socks5://127.0.0.1:21080`.

If the port is already taken, the status line reports the failure — pick another port between 1024 and 65535.
