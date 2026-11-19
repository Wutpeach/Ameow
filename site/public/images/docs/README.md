# Native screenshot provenance

These retained PNGs are Windows Rust / GPUI captures. The current user manual uses
[workflow illustrations](../../../src/components/manual/README.md); these captures
record earlier application states and do not establish current UI or Mac validation.

| Asset | Source | Processing |
| --- | --- | --- |
| rust-compact-themes.png | #18 repair, evidence commit 5a76c480; Compact light/dark only | Original image bytes; withdrawn from user pages because the small capture and pointer obscure the product |
| rust-settings-zh-general.png, rust-settings-en-general.png | #15 four-page settings acceptance, light-*-general.png | Window crop [8,1,572,432]; controls unchanged |
| rust-settings-zh-download.png, rust-settings-en-download.png | Same #15 acceptance, light-*-download.png | Same crop; solid rectangle [146,172,540,216] redacts the personal path without inventing a replacement |

Sources: [#15](https://github.com/Wutpeach/Ameow/issues/15),
[settings report](https://github.com/Wutpeach/Ameow/blob/eb7f5ac56aaac736da7d5f51ed4368dfc96b64e5/.trellis/research/tra28-r10-settings-master-report.md),
[#18 native report](https://github.com/Wutpeach/Ameow/issues/18#issuecomment-6610225897),
[#18 repair receipt](https://github.com/Wutpeach/Ameow/blob/5a76c480/docs/issue18-repair-receipt.json).
The settings captures predate the formal executable rename and cover their recorded
states only. New captures should identify source revision, executable identity and
real state, redact personal data, and use a reviewable crop.

Published SHA-256 values:

- rust-settings-zh-general.png: dcc804cba6c013f917bdfa79af2484e94e9b9e9ad0488f930f9699be2241958b
- rust-settings-zh-download.png: d0ead781246a09f8651b48d4c2bb8c077e1edb7b4f9180bc6362b5e19a103512
- rust-settings-en-general.png: 02547b43165b38fb86a97bf0b7f523ab7509ae97be266ec476d7338fa987e7c8
- rust-settings-en-download.png: 9f6ec9ef908a39d947e50dcc471ffcae2c78a778df683e224c7ef27892400a24
- rust-compact-themes.png: 6309df66b1dca2975addf07fd60d5e8cd6f23efcb4c87c1094a3f675ce257d18
