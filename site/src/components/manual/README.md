# Manual interface figures

Keep these components scoped to the manual. Desktop redraws preserve the current
Rust layout, palette, fonts, control sizes and motion rules; read the owners named
in DESIGN.md before changing them. Static crops use accurate alternative text,
and interactive surfaces use named groups with keyboard access. Do not add a
repetitive visible illustration caption.

The browser examples use the bundled extension frontend in public/manual/browser.
Keep vendor files unchanged and retain LICENSES.txt. Fixture adapters operate only
on in-page example state: no credentials, Native connection or download submission.
Theme selection follows Starlight. At narrow widths preserve control sizes; give
readers a visible hint and keyboard access when a native layout needs local panning.
