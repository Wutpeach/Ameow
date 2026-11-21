# README media

The four GIFs illustrate real product interfaces with isolated example states.
Both READMEs share them, with localized copy and alternative text. They are
**not live download or account-validation recordings**.

| GIF / static poster | Source and scope |
| --- | --- |
| [Desktop cat](desktop-cat.gif) / [poster](desktop-cat-poster.png) | Native Windows Gallery: Compact idle, Full, then the paw-first Compact entrance. The pointer is an editorial overlay; scene changes are injected. Compact → Full uses an editorial cut; Full → Compact retains the recorded shrink and paw-first entrance. |
| [Paste a link](paste-link.gif) / [poster](paste-link-poster.png) | Native Gallery's idle, resolving and downloading states for the same synthetic job. Ctrl + V is an editorial hint, with no physical input or clipboard access. Timing does not measure network speed. |
| [Clip selection](clip-selection.gif) / [poster](clip-poster.png) | PR64's unchanged Peek UI runs in a local example player using Ameow's public homepage dancer clip. Marker at 1s, range to 4s; no download submission. |
| [Session sync](session-sync.gif) / [poster](session-sync-poster.png) | Approved Popup v2 from PR76, rendered headlessly from the unchanged frozen product build. One synthetic, already-authorized bilibili.com page moves from Sync status unknown to Synced. Page tools stays on independently, with Diagnostics collapsed. The transport adapts the approved preview's safe responses; no permission dialog, Cookie, Native host or account is accessed. |

Clips and session sync are development previews, absent from the 0.5.0 release.
The session GIF starts **after site authorization** and shows an explicit sync;
it does not depict browser permission confirmation or prove that a website will
accept the cached session.

The session GIF is 640 × 738, 7s, 47,641 bytes, SHA256
`5f9a18a134eb99f96222c085e4571e2f47b53cabd9789e6e306f51301ebbc70e`;
the poster is 27,486 bytes, SHA256
`0a30ce89c15a3bac8597fbfd6ac7f91b6f53ca8d83fba2de3a8ecdf6d637ccc4`.

The clip GIF is 560 × 552, 6.8s, 290,186 bytes. Its SHA256 is
`a185f9c069426b852a87e6f248feb6ff44fab7ec5f51fc5433144c175d36233d`;
the poster's is
`f069e0c1394ad40fdeb788633a9e4df73546cf73e3a37b6d57852214be02bb94`.
The public dancer is Ameow's own generated homepage artwork; provenance remains in
[the homepage asset notes](../../../site/src/assets/homepage/SOURCES.md).

Product source references: `src/mascot_motion.rs`, `src/mascot_reveal.rs`,
`src/preview.rs`, and `src/download_ui.rs` for the cat and paste demos; PR76
`c9f7ca43cbc1e0acda24207d232763c931222cc4` for Popup v2, merged with the same
tree at `a089cfaaf83c90202f2740125bc6242d537da51b`; PR64
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
`2e1d393c1a08a401e94e4e005bdbdf7424c733b1b27c6944082fc250ce7be2b3`
and popup.js SHA256
`f53bf2310efd39bd364b01e6157ebe3562632a1351f508af9256781edf4a66a5`.
HTML, CSS and cat SVG are also pinned in the capture script. HTML/CSS agree with
the product Git object after normalizing line endings; the capture serves the
exact frozen bytes. This documentation task did not rebuild the product.
The [synthetic response contract](../../readme-media/session-sync/sample-contract.json)
adapts the approved interactive preview's unknown/synced responses to one
bilibili.com example, fixed timestamps and independently enabled page tools. Its
SHA256 after normalizing CRLF to LF is
`7c8522c7e602a88dfd1b6f14b6136c2b111c830591957753f6d73211c129b135`.
The source preview HTML is identified by SHA256
`22b8c08584e19e02e25d0371cb3319b6ecdd0a7eb26f5b1cd26f3d2b2fdc62ea`;
the capture serves actual product files, rather than that preview wrapper.
The capture adds a pointer overlay and controls example response timing; it
does not measure sync speed or verify browser registration or sign-in validity.

The [previous capture's provenance](https://github.com/Wutpeach/Ameow/blob/ed22e5dcb32ae59e5c6cb78f53fc97e651383d88/docs/images/readme/README.md)
retains the older `01c2fad5` product identity and media hashes. The other three
GIFs and their posters retain their original bytes.

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
