# Manual illustrations

Static, bilingual workflow illustrations for the 0.5.0 user manual. They explain
controls and relationships; they are not screenshots or interactive app previews.
Each figure has localized alternative text and a short visible illustration caption.
The layout stacks on narrow screens and follows Starlight's light/dark selection.
Styles are scoped to these figures and do not change the site theme.

| Figure | Page | Source of product behavior |
| --- | --- | --- |
| start | getting-started | Compact/Full and platform paste shortcut in desktop-interaction and macos-native specs |
| queue | desktop/links-and-queue | indicator.rs ring geometry; download_ui.rs queue rows and fixed 122/4/54 track layout |
| folder | desktop/output-folder | PR42 target: pale-gray folder/glow on hover without a ring; colored folder/ring and a short state pill after a confirmed save. Final native wording/geometry awaits the follow-up to 2852221b. |
| updates | desktop/settings | About app-update owner and independent Components management |
| mac | troubleshooting/macos-first-run | macos-native menu-bar entry and settings-window lifecycle |

The cat SVGs are imported directly from assets/mascot/light.svg and night.svg;
their provenance remains in assets/mascot/README.md. AppIcon imports the existing
repository icons and menu-bar silhouette. The folder outline follows the app's
Lucide folder icon. The download ring preserves the 50px canvas, r=22.5, 5px stroke,
top origin, and progress direction from src/indicator.rs. Colors and Full geometry
use the existing application tokens. Figure labels outside the app surface explain
gestures without adding controls to the app.

Progress values and media titles are neutral examples. Existing settings screenshots
retain their provenance in site/public/images/docs/README.md. No personal path is
introduced. Formal app requirements remain in OpenSpec; these figures are explanatory.
