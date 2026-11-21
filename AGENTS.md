## UI Design

Read [DESIGN.md](DESIGN.md) before changing user-visible UI. It provides design
references; formal behavior requirements live in OpenSpec. Use the linked Rust
sources for current implementation values. Keep its tokens and
`.impeccable/design.json` in sync when updating it.
Later explicit user decisions take precedence; do not restore superseded styles
from historical evidence.

## File Search

For any file search, filename or path lookup, or content grep in the current git-indexed directory, use the `fff` MCP tools instead of the default search tools.

Prefer:
- `fffind` for file and path search.
- `ffgrep` for content search.
- `fff-multi-grep` for broader multi-query grep tasks.

Only fall back to default tools if `fff` is unavailable or the target is outside the indexed project.

## Development contracts

Use [OpenSpec](openspec/README.md) as the formal behavior specification and GitHub Issues/Projects/PRs for task and delivery records. Read only the relevant capability specs. Follow [spec maintenance](docs/spec-maintenance.md); its migration map supplies historical reference evidence. Use Cindy native history for session recall.
