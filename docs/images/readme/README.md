# README media

The four GIFs illustrate real product interfaces with isolated example states.
Both READMEs share them, with localized copy and alternative text. They are
**not live download or account-validation recordings**.

| GIF / static poster | Source and scope |
| --- | --- |
| [Desktop cat](desktop-cat.gif) / [poster](desktop-cat-poster.png) | Native Windows Gallery: Compact idle, Full, then the paw-first Compact entrance. The pointer is an editorial overlay; scene changes are injected. Compact → Full uses an editorial cut; Full → Compact retains the recorded shrink and paw-first entrance. |
| [Paste a link](paste-link.gif) / [poster](paste-link-poster.png) | Native Gallery's idle, resolving and downloading states for the same synthetic job. Ctrl + V is an editorial hint, with no physical input or clipboard access. Timing does not measure network speed. |
| [Clip selection](clip-selection.gif) / [poster](clip-poster.png) | The current Peek UI runs in a local example player using Ameow's public homepage dancer clip. A synthetic Marker at 1s and range to 4s, with Precise initially off; no download submission. |
| [Session sync](session-sync.gif) / [poster](session-sync-poster.png) | The current 240px compact Popup, rendered headlessly from the unchanged product build. One synthetic, already-authorized bilibili.com page moves from Sync status unknown to Synced. Page tools stays on independently, with the copy-only Diagnostics row. The transport adapts the approved preview's safe responses; no permission dialog, Cookie, Native host or account is accessed. |

The session GIF starts **after site authorization** and shows an explicit sync;
it does not depict browser permission confirmation or prove that a website will
accept the cached session.

The session GIF is 480 × 434, 7s, 44898 bytes, SHA256
`9b428117be6cb21c26ee6bf490f16c6400fbc1e53ab3a615d0bbc1bd4b1f58b5`;
the poster is 19704 bytes, SHA256
`2de6ec54b324b4d8fd57990e32fe4b928cf1c923bacfb1ebfc9c4486c4298bff`.

The clip GIF is 560 × 592, 6.8s, 84858 bytes. Its SHA256 is
`13c979579209022032de59a30dfd181ada661d0ea854a4daa433bb54e1b092a8`;
the poster's is
`6aec763f0c83619a843bc86e2bac37daf7eb0f7a06382e9b86498e5afd028064`.
The public dancer is Ameow's own generated homepage artwork; provenance remains in
[the homepage asset notes](../../../site/src/assets/homepage/SOURCES.md).

Product source: browser-extension at 24efab16ef72a4f8071105bbef22e14bd881996c.
The source hash computed by the extension build is
716ba16ea769dba633900f0ef6b5ba6b1365a72b74e8edee12dfa7b9facb8df8;
popup.js SHA256 is e10a4c9c1558a780efdfa8d3435633aa381a3d587c79dc911bf3dbdec47d1a87.
The session GIF uses the unchanged product build, a synthetic response and an
editorial pointer; it does not test account access or sync speed. The clip GIF
uses the current product Peek bundle and a synthetic range, with no download.
Both READMEs share the same media. Earlier approved media remain in Git history.
Native cat and paste captures retain their original bytes and the cached 0.5.0
EXE SHA256 e8f2f4bcbcadd40e63b8c1607876b0d0c430d9b5e4466d05452d93776825faf8;
its exact build commit is unknown.

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
