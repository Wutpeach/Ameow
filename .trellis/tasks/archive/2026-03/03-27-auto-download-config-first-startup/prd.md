# Auto Download Config On First Startup And Enhance Reminder Dot Animation

## Goal
Automatically download and configure the required runtime/config on the app's first launch after installation, while keeping the existing manual recovery path for later dependency-missing cases.

## Requirements
- On a fresh install's first app launch, the app should automatically trigger the managed config/runtime download flow without requiring a user click.
- The automatic behavior should apply only to the initial install/startup path, not every later launch.
- If dependencies/config become missing after the initial setup, the existing yellow reminder entry point should still notify the user and only start download/config after the user clicks.
- The yellow reminder dot should be visually improved with an outer ring/stroke.
- The outer ring should run a looping scale animation that draws attention and suggests clickability.

## Acceptance Criteria
- [ ] Fresh-install first launch starts the config/runtime preparation flow automatically.
- [ ] Non-first-launch missing dependency cases still require user click from the yellow reminder UI.
- [ ] The reminder dot renders with an additional outlined ring.
- [ ] The outlined ring loops with a scale animation without breaking the compact floating-window layout.

## Technical Notes
- Expected to touch startup/bootstrap state and the UI status indicator component.
- Preserve existing missing-dependency detection and recovery logic unless required for first-run distinction.
