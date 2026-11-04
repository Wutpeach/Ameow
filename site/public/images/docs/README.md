# Rust documentation screenshots / Rust 文档截图

These are real Windows Rust / GPUI captures reused from existing acceptance evidence, not new #19 captures or generated UI. / 以下均为既有验收的真实截图，不是 #19 新截图或生成界面。

| Asset | Provenance and use / 来源与用途 | Processing / 处理 |
| --- | --- | --- |
| rust-compact-themes.png | #18 repair, final evidence commit 5a76c480; Compact light/dark theme persistence only / 仅 Compact 明暗主题 | Byte-for-byte copy of docs/evidence/issue18-repair-native.png |
| rust-settings-zh-general.png, rust-settings-en-general.png | #15 accepted four-page settings; archived tra28-r10-pages.local light-*-general.png / 常规页，不代表本轮重新验收 | Crop [8,1,572,432] to window, no control changes / 只裁窗口外背景 |
| rust-settings-zh-download.png, rust-settings-en-download.png | Same #15 acceptance, light-*-download.png / 下载目录设置 | Same crop; solid rectangle [146,172,540,216] covers personal path / 实色遮盖个人路径，未替换为虚构目录 |

Source evidence: [#15](https://github.com/Wutpeach/Ameow/issues/15), [settings report](https://github.com/Wutpeach/Ameow/blob/eb7f5ac56aaac736da7d5f51ed4368dfc96b64e5/.trellis/research/tra28-r10-settings-master-report.md), [#18 final native report](https://github.com/Wutpeach/Ameow/issues/18#issuecomment-6610225897), [#18 repair receipt](https://github.com/Wutpeach/Ameow/blob/5a76c480/docs/issue18-repair-receipt.json). General and download controls retain the accepted layout through the #18 root promotion. These settings captures predate the formal executable rename and do not establish acceptance for every latest setting or platform.

#17/T04 process captures with hover tooltips were inspected but are not included. No old Electron SVG mock is presented as a Rust screenshot. No Full/queue screenshot is claimed from the Compact image. Future captures must identify their source revision and real state, redact private data, and preserve a reviewable crop.

Local source and output hashes are retained in the #19 evidence receipt. Published output SHA-256:
- rust-settings-zh-general.png: dcc804cba6c013f917bdfa79af2484e94e9b9e9ad0488f930f9699be2241958b
- rust-settings-zh-download.png: d0ead781246a09f8651b48d4c2bb8c077e1edb7b4f9180bc6362b5e19a103512
- rust-settings-en-general.png: 02547b43165b38fb86a97bf0b7f523ab7509ae97be266ec476d7338fa987e7c8
- rust-settings-en-download.png: 9f6ec9ef908a39d947e50dcc471ffcae2c78a778df683e224c7ef27892400a24
- rust-compact-themes.png: 6309df66b1dca2975addf07fd60d5e8cd6f23efcb4c87c1094a3f675ce257d18
