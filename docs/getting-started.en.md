# Getting Started

[中文](./getting-started.md) | [English](./getting-started.en.md)

New to Ameow? Follow the steps below and go from install to your first download in just a few minutes.

## 1. Download Ameow

Go to [GitHub Releases](https://github.com/Wutpeach/Ameow/releases) and download the build for your platform.

### Windows

- `Installer EXE`: standard installer build.
- `Portable ZIP`: unzip and run without installing.

### macOS

- `Apple Silicon DMG`: for M-series Macs.
- The current macOS package is distributed as an unsigned open-source DMG.

## 2. Install And First Launch

### Windows

1. Run the installer, or extract the Portable ZIP.
2. Launch `Ameow`.
3. After first launch, a small floating window will appear on the desktop.

### macOS

1. Open the DMG and drag `Ameow.app` into `Applications`.
2. Launch Ameow from `Applications`.
3. If macOS blocks the app on first launch, first try right-click `Open`, or allow it from `System Settings > Privacy & Security`.
4. If quarantine still blocks the app, run:

```bash
xattr -dr com.apple.quarantine "/Applications/Ameow.app"
```

## 3. Try It: Send Something To Ameow

Start with any of these common flows:

- Drag a local file into the floating window to copy it into the current output folder.
- Drag a folder into the window to make it the new output folder.
- Copy an image URL, video URL, or another supported page URL, then paste it with `Ctrl+V` or `Cmd+V`.
- On Windows, clipboard files can be pasted directly too.

## 4. Output Folder And Everyday Settings

- The default output folder is `Desktop/Ameow_Received`.
- Double-click the empty area of the main window to quickly open the current output folder.
- Right-click the main window to open the current output folder or choose a new one.
- In Settings, you can adjust:
  - theme
  - global shortcut
  - launch at startup
  - rename rules
  - After Effects integration
- Downloader runtimes are prepared automatically from the main window when first needed.

## 5. Want Browser-To-Desktop Handoff?

If you want to trigger downloads straight from the page or pass browser cookies into the desktop app, continue here:

- [Browser Extension](./browser-extension.en.md)

## 6. Need Help?

If launch, download, or connection issues get in the way, start here:

- [FAQ](./faq.en.md)
