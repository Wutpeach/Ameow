# Manual illustrations

Static, bilingual workflow illustrations for the 0.5.0 user manual. They explain
controls and relationships; they are not screenshots or interactive app previews.
Each figure has localized alternative text and a short visible illustration caption.
The layout stacks on narrow screens and follows Starlight's light/dark selection.
Styles are scoped to these figures and do not change the site theme.

| Figure | Page | Source of product behavior |
| --- | --- | --- |
| start | docs index | Compact/Full and platform paste shortcut in desktop-interaction and macos-native specs |
| queue | desktop/links-and-queue | indicator.rs ring geometry; download_ui.rs queue rows and fixed 122/4/54 track layout |
| folder | desktop/output-folder | Verified against PR42 commit 22a5f05910c98d06eb0ed809c4d44d605d5cbe53: indicator::directory_feedback, ring_glow.rs, tokens.rs and main.rs. Both states use the bundled 24px folder artwork and a 96×16 pill at top 59 with 8px medium text. Receiving has neutral icon/glow without a ring; Saved has the green folder, icon glow and success ring/glow. |
| updates | desktop/settings | About app-update owner and independent Components management |
| mac | troubleshooting#mac | macos-native menu-bar entry and settings-window lifecycle |
| settings-general | desktop/settings | settings_window.rs: general_page, preference_select and nav. Startup, Theme, Language, Tray icon retain their actual order and values. The preference outline marks automatic saving, without adding a Save control. |
| settings-download | desktop/output-folder | settings_window.rs: download_page and nav. Open-folder icon and Change remain above the path, with Copy inset at its right. Numbered annotations identify Change and Copy. C drive Downloads is a non-personal example. |

The cat SVGs are imported directly from assets/mascot/light.svg and night.svg;
their provenance remains in assets/mascot/README.md. AppIcon imports the existing
repository icons and menu-bar silhouette. The folder outline follows the app's
Lucide folder icon. The download ring preserves the 50px canvas, r=22.5, 5px stroke,
top origin, and progress direction from src/indicator.rs. Colors and Full geometry
use the existing application tokens. Figure labels outside the app surface explain
gestures without adding controls to the app.

Directory labels match the native source: 松开设为目录 / Drop to set folder,
then 目录已更新 / Folder updated. Timing follows PR42 commit
7d3bb8ef5bd1cd2899df93ed15b99d1b18e54f3d: normal Success retention (1500ms),
then normal window logic with the existing 80ms leave grace. The static geometry
source above remains valid. Folder and ring glow use 4px blur and 0.3 alpha; foreground neutral
uses 0.8 alpha in Light and 1 in Dark. Pill backgrounds follow Palette::pill.
This source comparison does not assert native Mac validation or user visual approval.

The former six settings screenshot references were replaced with focused, static
settings illustrations. After consolidating the manual, settings figures live
only in their topic pages; the index teaches the first download with the start figure.
The panels omit unused window space and system chrome. Controls are inert spans,
inside the figure's image role; they cannot save settings or touch files. Narrow
layouts reflow labels and values for reading while retaining the sidebar/content
relationship. Source controls were checked against settings_window.rs at the
unchanged application baseline f7b11d66275d2495433d1205126bc99fd0f44beb.

Progress values, media titles and the download path are neutral examples. Earlier
native capture provenance is documented in [the screenshot reference](../../../public/images/docs/README.md).
No personal path is introduced. Formal app requirements
remain in OpenSpec; these figures are explanatory.
