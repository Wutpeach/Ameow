# Third-party notices

Ameow {{VERSION}}

Full license and copyright material is available offline in Settings → About →
Third-party licenses and in the adjacent files. Rust notices share identical
full texts while preserving each component, copyright and complete license wording.
The package license-inputs.json identifies the exact source commit and material
hashes. Original source texts and the full engineering audit remain in that source
commit under distribution/notices; those audit files are not needed to read the
licenses offline.

## Ameow — MIT

<!-- include: LICENSE -->

## JetBrains Mono — SIL Open Font License

<!-- include: assets/fonts/OFL.txt -->

## Icons — ISC and Feather MIT

<!-- include: distribution/notices/icon-licenses.txt -->

## Rust dependencies and standard library

The Windows normal/build dependency graph is retained conservatively, including
build tools and procedural macros; it is not a claim that every package is linked.
Original license-text hashes, component mappings, standard-library notices and
complete shared terms follow.

<!-- include: distribution/notices/rust-notices.txt -->

## Separately acquired tools

yt-dlp, FFmpeg, Deno and gallery-dl are acquired from upstream on demand; they are
not members of the Windows portable ZIP. Their own licenses and source obligations
remain separate. The matching source commit records acquisition versions, hashes
and license references in assets/runtime-manifest.json and
distribution/notices/runtime-acquisition.md.

## Source review limits

mac@0.1.1 declares MIT/Apache-2.0 in its locked source but did not include a
LICENSE file. This distribution uses its declared Apache-2.0 option and supplies
the ASF's complete standard text, retaining the original declaration in the source audit.
seahash@4.1.0 declares MIT; its upstream directly following commit adds the missing
MIT license text, which is supplied here and identified as a later supplement.
Neither locked source supplied a copyright notice; no replacement was invented.
The source inventory records these upstream omissions separately from supplied texts.
Exact historical tags for three
icons, brand redistribution rights, applicable MSVC terms and separately acquired
runtime/source obligations remain in the source audit. These notices do not
constitute legal approval or claim that those open questions have been resolved.

End of third-party notices for Ameow {{VERSION}}.
