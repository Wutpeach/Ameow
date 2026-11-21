<h1 align="center"><img src="site/public/ameow-logo.png" alt="Ameow app icon" width="48" align="middle"> Ameow</h1>

<p align="center">Your little desktop download cat. Just paste a link.</p>

<p align="center">
  <a href="https://github.com/Wutpeach/Ameow/releases/latest"><img src="https://img.shields.io/github/v/release/Wutpeach/Ameow?style=flat-square&amp;labelColor=30363d&amp;label=&amp;color=0b78d0&amp;logo=github&amp;logoColor=white" alt="Latest stable Ameow release" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/releases/tag/v0.5.0"><img src="https://img.shields.io/badge/Windows-x64-0b78d0?style=flat-square&amp;labelColor=30363d" alt="Windows x64" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/releases/tag/v0.5.0"><img src="https://img.shields.io/badge/macOS-arm64-0b78d0?style=flat-square&amp;labelColor=30363d&amp;logo=apple&amp;logoColor=white" alt="macOS Apple Silicon arm64" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/blob/main/Cargo.toml"><img src="https://img.shields.io/badge/Rust-GPUI-0b78d0?style=flat-square&amp;labelColor=30363d&amp;logo=rust&amp;logoColor=white" alt="Rust / GPUI" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0b78d0?style=flat-square&amp;labelColor=30363d" alt="MIT license for the application code" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/actions/workflows/rust.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/Wutpeach/Ameow/rust.yml?style=flat-square&amp;labelColor=30363d&amp;branch=main&amp;label=CI&amp;logo=githubactions&amp;logoColor=white" alt="Ameow Rust Windows CI on the main branch" height="20"></a>
</p>

Clips and browser session sync preview a future version; the current **0.5.0** release does not include them. The GIFs use isolated example states.

## Your desktop cat

The cat waits quietly on your desktop. Move closer to expand it, then move away to tuck it back in.

<p align="center">
  <img src="docs/images/readme/desktop-cat.gif" alt="The Ameow desktop cat waits, expands into the download window as the pointer approaches, then returns when it leaves." width="400">
</p>

## Paste a link

Paste a media link and let the cat take over. Follow its progress in the floating window.

<p align="center">
  <img src="docs/images/readme/paste-link.gif" alt="After a link is pasted into Ameow, the same example task moves from accepted to downloading." width="400">
</p>

## Keep the part you want

Mark a section on the video page and send it to the cat. Fast cuts may start or end near a keyframe.

<p align="center">
  <img src="docs/images/readme/clip-selection.gif" alt="Add a Marker at one second in Peek and drag it to four seconds to create a clip range, with the playhead staying independent." width="560">
</p>

## Browser session sync

Configure the browser connection in Ameow and copy the extension folder path. On the extensions page in the same Chrome or Edge browser, enable developer mode, load the unpacked extension, paste the path and select the folder.

Then open the extension on a webpage, confirm the site scope and authorize it to sync the existing session for downloads. Sync does not sign you in or guarantee that the site still accepts the session.

<p align="center">
  <img src="docs/images/readme/session-sync.gif" alt="Click Sync now for an already-authorized bilibili.com example; the popup shows only the current webpage's site as its result changes from unknown to Snapshot updated, with Microsoft Edge as the source." width="560">
</p>

## Development and building

See [Contributing](CONTRIBUTING.md) for setup and build instructions. Scripts and agents can use ameow-cli to work with the same desktop queue; see the [CLI user guide](https://github.com/Wutpeach/Ameow/blob/2c916bc78a593cae3e5cc2f8961cb07374002def/site/src/content/docs/en/docs/cli.md) (development candidate; CLI is not included in the 0.5.0 release).

---

[User manual](https://wutpeach.github.io/Ameow/en/docs/) · [简体中文](README.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [GIF sources](docs/images/readme/README.md)
