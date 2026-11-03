# `mini-trellis mem` CLI Reference

Use `recall` for project knowledge and `read` for missing context. Full command help: `mini-trellis mem help`.

## Subcommands

| Command | Purpose |
| ------ | ------ |
| `recall <query>` | Search project Markdown and past conversations together. Returns source-linked excerpts; default `3` hits. |
| `read <ref...>` | Expand one or more refs copied from recall, sharing one output budget. |
| `list` | List sessions. Default when none is given. |
| `search <keyword>` | Find sessions whose contents match a keyword. |
| `context <session-id>` | Top-N hit turns plus surrounding context. Pair with `--grep`. |
| `extract <session-id>` | Dump cleaned dialogue. Combine with `--grep`. |
| `projects` | List active project `cwd` values with session counts. |

`list`, `search`, `context`, and `extract` operate on conversations only. Use them when the original dialogue is specifically needed.

## Flags

| Flag | Subcommands | Meaning |
| ---- | ----------- | ------- |
| `--platform claude\|codex\|opencode\|pi\|all` | recall / list / search / context / extract / projects | Default `all`; filters conversation sources. |
| `--since YYYY-MM-DD` | list / search / context / extract / projects | Inclusive lower date bound. |
| `--until YYYY-MM-DD` | list / search / context / extract / projects | Inclusive upper date bound. |
| `--global` | list / search / context / extract | Include all projects' conversations, only for explicit cross-project requests. Not supported by `recall`. |
| `--cwd <path>` | recall / read / list / search / context / extract | Select a project. Default is the current project. |
| `--limit N` | recall / list / search / projects | Result limit. Defaults: recall `3`, list/search `50`, projects `30`. |
| `--grep KW` | extract / context | Filter turns by keyword. |
| `--turns N` | context | Hit turns to return. Default `3`. |
| `--around N` | context | Surrounding turns per hit. Default `1`. |
| `--max-chars N` | recall / read / context | Character budget. Defaults: recall stdout `3000`, read stdout `4000`, context text `6000`. |
| `--include-children` | search / context | Merge OpenCode sub-agent sessions into parent. |
| `--json` | all | Machine-readable JSON. |

```bash
mini-trellis mem recall "deadlock"
# Only when the excerpts lack necessary context:
mini-trellis mem read "<ref copied from recall>"
```

If the excerpts already answer the question with their source and conditions, stop. Keep refs unchanged; if a source has changed, recall again. For an explicit request about another project, pass the same `--cwd "<project path>"` to recall and read.

For an explicit conversation-only lookup:

```bash
mini-trellis mem search "deadlock"
mini-trellis mem context <session-id> --grep "lock" --turns 3 --around 1
```
