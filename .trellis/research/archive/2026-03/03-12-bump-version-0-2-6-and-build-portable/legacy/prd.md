# Bump Version To 0.2.6 And Build Local Portable Package

## Goal
Update the application version to 0.2.6 using the project-standard version command and produce a local Windows portable package artifact.

## Requirements
- Use `npm run version:set -- 0.2.6` as the only entry point for the version bump.
- Ensure all version-managed targets are updated by that command.
- Build a local portable package with the existing packaging workflow.
- Report the generated artifact path and basic verification details.

## Acceptance Criteria
- [ ] `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src/constants/appVersion.ts` reflect version `0.2.6`.
- [ ] Local portable ZIP artifact is generated successfully in the expected output directory.
- [ ] Command results are captured and shared to the user.

## Technical Notes
- Portable packaging command is `npm run package:portable`.
- Packaging script outputs ZIP to `src-tauri/target/release/bundle/portable/`.
