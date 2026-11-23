# Ameow project

Use the shared `ship` Skill for project collaboration and the [Ameow execution and delivery Skill](.agents/skills/ameow-release-prep/SKILL.md) for project methods. Read only the references relevant to the current task.

## UI Design

Read [DESIGN.md](DESIGN.md) before UI changes; keep its tokens and `.impeccable/design.json` in sync. Its linked Rust sources provide current values; later user decisions take precedence over historical examples.

## File Search

In the indexed project use `fff`: `fffind` for paths, `ffgrep` for content, and `fff-multi-grep` for multiple queries. Fall back only when unavailable or outside its index.

## Development contracts

Use [OpenSpec](openspec/README.md) for formal behavior and follow [spec maintenance](docs/spec-maintenance.md). GitHub tracks delivery; Cindy native history supplies session recall.
