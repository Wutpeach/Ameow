# README media

The four GIFs illustrate real product interfaces with isolated example states.
Both READMEs share them, with localized copy and alternative text. They are
**not live download or account-validation recordings**.

| GIF / static poster | Source and scope |
| --- | --- |
| [Desktop cat](desktop-cat.gif) / [poster](desktop-cat-poster.png) | Native Windows Gallery: Compact idle, Full, then the paw-first Compact entrance. The pointer is an editorial overlay; scene changes are injected. Compact → Full uses an editorial cut; Full → Compact retains the recorded shrink and paw-first entrance. |
| [Paste a link](paste-link.gif) / [poster](paste-link-poster.png) | Native Gallery's idle, resolving and downloading states for the same synthetic job. Ctrl + V is an editorial hint, with no physical input or clipboard access. Timing does not measure network speed. |
| [Clip selection](clip-selection.gif) / [poster](clip-poster.png) | The owner-approved product-frontend GIF from #71, reused byte-for-byte. PR64's unchanged Peek UI runs in a local example player using Ameow's public homepage dancer clip. Marker at 1s, range to 4s; no download submission. |
| [Session sync](session-sync.gif) / [poster](session-sync-poster.png) | PR63's unchanged extension popup, rendered headlessly. A synthetic, already-authorized bilibili.com site moves from pending to synced through a local transport fixture. Microsoft Edge · 示例来源 and its source ID are examples. No permission dialog, Cookie, Native host or account is accessed. |

Clips and session sync are development previews, absent from the 0.5.0 release.
The session GIF starts **after site authorization** and shows an explicit sync;
it does not depict browser permission confirmation or prove that a website will
accept the cached session. The older #24 image saying “成功；当前无会话 Cookie”
is not used or edited.

The approved clip GIF is 560 × 552, 6.8s, 290,186 bytes. Its SHA256 is
`a185f9c069426b852a87e6f248feb6ff44fab7ec5f51fc5433144c175d36233d`;
the poster's is
`f069e0c1394ad40fdeb788633a9e4df73546cf73e3a37b6d57852214be02bb94`.
It originated in the read-only #71 review tree at
`docs/issue71-review/preview/readme-clip/`. The public dancer is Ameow's own
generated homepage artwork; provenance remains in
[the homepage asset notes](../../../site/src/assets/homepage/SOURCES.md).

Product source references: `src/mascot_motion.rs`, `src/mascot_reveal.rs`,
`src/preview.rs`, and `src/download_ui.rs` for the desktop; PR63
`13107cefd22c3397b238daf05dce74625c00017b` for the popup; PR64
`cd2fb9eeea04aadce8fda6f6ab7204f4f1733123` for Peek. Native capture identifies
its cached 0.5.0 EXE by SHA256
`e8f2f4bcbcadd40e63b8c1607876b0d0c430d9b5e4466d05452d93776825faf8`.
Its exact build commit is unknown; it is not labelled as a new build of the
README branch. The mascot motion/reveal and Gallery reference files are unchanged
between the existing cfc6ad60 baseline and this branch's 884fce40 starting point.

The reusable [capture, preview and checking commands](../../readme-media/README.md)
keep transient frames and cached GitHub CSS outside Git. No production app code,
dependencies, download mechanism or authentication behavior is changed.
The cat capture's two incomplete compositor frames were removed without
interpolation; the expansion is a cut, not continuous-motion evidence. The native
media use one uniform crop that preserves the full window and recorded action.
The extension bundle was independently rebuilt with its locked esbuild 0.28.2
and compared byte-for-byte, then pinned in the capture script.

## Earlier native stills

These are unchanged native Windows captures of Ameow 0.5.0, using the isolated
[Gallery scene renderer](../../preview.md). Task titles, counts and progress are
example data; the images show interface states rather than live download recordings.
Earlier README versions shared these stills, with localized alternative text.

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
