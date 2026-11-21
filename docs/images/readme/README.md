# README media

The four GIFs illustrate real product interfaces with isolated example states.
Both READMEs share them, with localized copy and alternative text. They are
**not live download or account-validation recordings**.

| GIF / static poster | Source and scope |
| --- | --- |
| [Desktop cat](desktop-cat.gif) / [poster](desktop-cat-poster.png) | Native Windows Gallery: Compact idle, Full, then the paw-first Compact entrance. The pointer is an editorial overlay; scene changes are injected. Compact → Full uses an editorial cut; Full → Compact retains the recorded shrink and paw-first entrance. |
| [Paste a link](paste-link.gif) / [poster](paste-link-poster.png) | Native Gallery's idle, resolving and downloading states for the same synthetic job. Ctrl + V is an editorial hint, with no physical input or clipboard access. Timing does not measure network speed. |
| [Clip selection](clip-selection.gif) / [poster](clip-poster.png) | PR64's unchanged Peek UI runs in a local example player using Ameow's public homepage dancer clip. Marker at 1s, range to 4s; no download submission. |
| [Session sync](session-sync.gif) / [poster](session-sync-poster.png) | PR76's unchanged extension popup, rendered headlessly from the frozen product build. A synthetic, already-authorized bilibili.com site moves from an unknown result to an updated snapshot through the product's local response fixture. The popup shows only the current webpage's site; Microsoft Edge, timestamps and installation IDs are examples. No permission dialog, Cookie, Native host or account is accessed. |

Clips and session sync are development previews, absent from the 0.5.0 release.
The session GIF starts **after site authorization** and shows an explicit sync;
it does not depict browser permission confirmation or prove that a website will
accept the cached session.

The session GIF is 640 × 760, 7s, 58,290 bytes, SHA256
`06ebb3cae5aa006fd706f770a90d9eabba5e804aef69ef8bca6fe4a90a6669e2`;
the poster is 41,712 bytes, SHA256
`a35713ed893b7f586c5e4a25405aabe6a7f517bad07cc15db0bf6d1257dc107a`.

The clip GIF is 560 × 552, 6.8s, 290,186 bytes. Its SHA256 is
`a185f9c069426b852a87e6f248feb6ff44fab7ec5f51fc5433144c175d36233d`;
the poster's is
`f069e0c1394ad40fdeb788633a9e4df73546cf73e3a37b6d57852214be02bb94`.
The public dancer is Ameow's own generated homepage artwork; provenance remains in
[the homepage asset notes](../../../site/src/assets/homepage/SOURCES.md).

Product source references: `src/mascot_motion.rs`, `src/mascot_reveal.rs`,
`src/preview.rs`, and `src/download_ui.rs` for the cat and paste demos; PR76
`01c2fad5d24ea7e0cc35f8aad8fe0fc9657e156b` for the popup; PR64
`cd2fb9eeea04aadce8fda6f6ab7204f4f1733123` for Peek. Native capture identifies
its cached 0.5.0 EXE by SHA256
`e8f2f4bcbcadd40e63b8c1607876b0d0c430d9b5e4466d05452d93776825faf8`.
Its exact build commit is unknown.

The reusable [capture, preview and checking commands](../../readme-media/README.md)
keep transient frames and cached GitHub CSS outside Git. No production app code,
dependencies, download mechanism or authentication behavior is changed.
The cat capture's two incomplete compositor frames were removed without
interpolation; the expansion is a cut, not continuous-motion evidence. The native
media use one uniform crop that preserves the full window and recorded action.
The popup uses the product task's frozen build, with source SHA256
`07012443c03404331e38659fdb434b45d2937e80b8009b0e54890efa2178bdc9`
and popup.js SHA256
`7ad0231c14d3b6eda2eee31e586f7346714ec5a62e966d71c423aaaaef354953`.
HTML, CSS and cat SVG are also pinned in the capture script. HTML/CSS agree with
the product Git object after normalizing line endings; the capture serves the
exact frozen bytes. This documentation task did not rebuild the product.
The [synthetic response contract](../../readme-media/session-sync/sample-contract.json)
is copied from that product asset package with repository line endings. Its
SHA256 after normalizing CRLF to LF is
`a91e8b808e3cc6b655f0f86ecc65b6971e8807a11b9a30f4b61cbbb2c51c703b`
(the frozen original is `bef944f08f3f2d08ef928aabe56c550b7c21859341ac151bbb1bdccbf25c923a`).
The capture adds a pointer overlay and controls example response timing; it
does not measure sync speed or verify browser registration or sign-in validity.

## Native stills

These are unchanged native Windows captures of Ameow 0.5.0, using the isolated
[Gallery scene renderer](../../preview.md). Task titles, counts and progress are
example data; the images show interface states rather than live download recordings.

| Image | Native scene |
| --- | --- |
| [compact.png](compact.png) | compact.idle |
| [download.png](download.png) | full.downloading |
| [queue.png](queue.png) | queue.concurrent |
| [quality.png](quality.png) | menu.root |
| [save-folder.png](save-folder.png) | full.directory-saved |

The README reuses the existing [application icon](../../../site/public/ameow-logo.png).
Artwork provenance remains in the [brand](../../../assets/brand/README.md) and
[mascot](../../../assets/mascot/README.md) source notes. No application UI was redrawn.
Third-party terms remain in the [license notices](../../../THIRD_PARTY_NOTICES.md).
