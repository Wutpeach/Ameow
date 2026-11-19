# Homepage assets

These are the final assets of the owner-approved Ameow pixel homepage. The
Astro page and browser controller use these files directly; generation inputs,
raw model videos, alternate designs and review recordings are not site assets.

- The mascot identity derives from Ameow's approved Light/Night character in
  assets/mascot/, with owner-authorized AI pose derivation for the website.
- Static illustrations and the dancer/flower prints were generated for Ameow
  with Pixmax Seedream 5.5. The selected three-scene composition was approved
  before site integration. The rear pose's generated asset is
  1f1e3e9b-ab88-6a89-bc9a-4fec363fb5b8.
- The isolated paw and dancer clips used Seedance 2.5 draft-to-final generation.
  Final source assets: paw 1f1e3fd6-7137-6db3-bc9a-4fec363fb5b8; dancer
  1f1e3fd7-186f-67f6-bc9a-4fec363fb5b8.
- The shipped sprites are deterministic derivatives: fixed palette/grid,
  background removal, paw registration to the approved body and 8 fps holds.
  Rear movement and local eyelids are deterministic pixel edits. The dancer
  loop uses a held forward/reverse phrase. The browser moves the file container
  independently at display frame rate; these are not full-page generated videos.
- The selected third scene remains the original raster. Only the separately
  stored eye patches change during its blink.

NotoSansSC.woff is Noto Sans SC, licensed under the SIL Open Font License 1.1.
The unmodified license is distributed in site/public/licenses/NotoSansSC-OFL.txt.
The repository's MIT license covers the site code; this font keeps its own
license. No third-party platform footage is included.

All PNG/JPEG/WebP/MP4/font files were copied byte-for-byte from the accepted
candidate. Sprite dimensions and contact/release frame indices are maintained
in site/src/data/homepage-motion.json; the controller loads the same assets
through Vite URLs so the configured deployment base is preserved.
