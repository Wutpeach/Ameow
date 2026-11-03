# Ameow brand icons

Copied unchanged from the approved `Ameow-Brand-Assets-TRA29` delivery for GitHub #16.
`source-manifest.json` retains the export provenance and original validation/hashes;
only the application ICO and 28 tray PNGs needed by this application are copied here.
B/D2 retain the user's nose highlight adjustments. No artwork or raster was redrawn/rescaled.

`build.rs` embeds A's ten-frame `ameow.ico` as the first Windows icon group (resource 1).
EXE identity, shortcuts and any future installer application icon must stay A.
The current portable build consumes the same Cargo binary; no installer is implemented here.

Tray groups 101/102/103/104 wrap the delivered A/B/C/D2 PNG bytes in ICO containers at
build time, without image conversion. Runtime picks the delivered frame nearest to the
taskbar monitor's small-icon metric, preferring the larger frame on ties. Windows owns
the icon rasterization; the UI thread caches owned handles by resource and size until
shutdown. Windows may scale them for nonstandard DPI beyond the provided sizes.
Follow Appearance maps Light to A and Night to B; Blue and Apricot remain fixed.
