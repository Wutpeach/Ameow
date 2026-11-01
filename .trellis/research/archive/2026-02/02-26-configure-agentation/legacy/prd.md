# Configure Agentation Integration

## Goal
Enable Agentation in the current React app so visual annotations can be used during development.

## Requirements
- Mount `Agentation` in the app root without affecting production behavior.
- Configure Agentation to point to local MCP HTTP endpoint (`http://localhost:4747`).
- Add a project script to run the Agentation MCP server.
- Keep TypeScript and existing app structure consistent with project frontend guidelines.

## Acceptance Criteria
- [ ] `src/main.tsx` renders `Agentation` in development mode.
- [ ] Agentation uses `endpoint="http://localhost:4747"` in development mode.
- [ ] `package.json` has a runnable script for MCP server startup.
- [ ] `npm run build` passes after integration.

## Technical Notes
- Use `import.meta.env.DEV` for Vite dev-only gating.
- Keep integration minimal and isolated to app root setup.
