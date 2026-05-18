# Platform Compatibility Reference

Detailed guide on Trellis feature availability across 9 AI coding platforms.

---

## Overview

Trellis v0.3.0 supports **9 platforms**. The key differentiator is **hook support** — Claude Code and iFlow have Python hook systems that enable automatic context injection and quality enforcement. Other platforms use commands/skills with manual context loading.

| Platform    | Config Directory              | CLI Flag        | Hooks | Command Format |
| ----------- | ----------------------------- | --------------- | ----- | -------------- |
| Claude Code | `.claude/`                    | (default)       | ✅    | Markdown       |
| iFlow       | `.iflow/`                     | `--iflow`       | ✅    | Markdown       |
| Cursor      | `.cursor/`                    | `--cursor`      | ❌    | Markdown       |
| OpenCode    | `.opencode/`                  | `--opencode`    | ❌    | Markdown       |
| Codex       | `.agents/skills/`             | `--codex`       | ❌    | Skills         |
| Kilo        | `.kilocode/commands/trellis/` | `--kilo`        | ❌    | Markdown       |
| Kiro        | `.kiro/skills/`               | `--kiro`        | ❌    | Skills         |
| Gemini CLI  | `.gemini/commands/trellis/`   | `--gemini`      | ❌    | TOML           |
| Antigravity | `.agent/workflows/`           | `--antigravity` | ❌    | Markdown       |

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TRELLIS FEATURE LAYERS                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    LAYER 3: AUTOMATION                              │ │
│  │  Hooks, Ralph Loop, Auto-injection, Multi-Session                  │ │
│  │  ─────────────────────────────────────────────────────────────────│ │
│  │  Platform: Claude Code + iFlow                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────▼───────────────────────────────────┐ │
│  │                    LAYER 2: AGENTS                                  │ │
│  │  Agent definitions, Task tool, Subagent invocation                 │ │
│  │  ─────────────────────────────────────────────────────────────────│ │
│  │  Platform: Claude Code + iFlow (full), others (manual)             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌────────────────────────────────▼───────────────────────────────────┐ │
│  │                    LAYER 1: PERSISTENCE                             │ │
│  │  Workspace, Tasks, Specs, Commands/Skills, JSONL files             │ │
│  │  ─────────────────────────────────────────────────────────────────│ │
│  │  Platform: ALL 9 (file-based, portable)                            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Feature Breakdown

### Layer 1: Persistence (All 9 Platforms)

These features work on all platforms because they're file-based.

| Feature            | Location                 | Description                               |
| ------------------ | ------------------------ | ----------------------------------------- |
| Workspace system   | `.trellis/workspace/`    | Journals, session history                 |
| Task system        | `.trellis/tasks/`        | Task tracking, requirements               |
| Spec system        | `.trellis/spec/`         | Coding guidelines                         |
| Commands/Skills    | Platform-specific dirs   | Command prompts in each platform's format |
| JSONL context      | `*.jsonl` in task dirs   | Context file lists                        |
| Developer identity | `.trellis/.developer`    | Who is working                            |
| Current task       | `.trellis/.current-task` | Active task pointer                       |

### Layer 2: Agents (Claude Code + iFlow Full, Others Manual)

| Feature            | Claude Code / iFlow            | Other Platforms           |
| ------------------ | ------------------------------ | ------------------------- |
| Agent definitions  | Auto-loaded via `--agent` flag | Read agent files manually |
| Task tool          | Full subagent support          | No Task tool              |
| Context injection  | Automatic via hooks            | Manual copy-paste         |
| Agent restrictions | Enforced by definition         | Honor code only           |

### Layer 3: Automation (Claude Code + iFlow Only)

| Feature                | Dependency         | Why Hook-Platforms Only          |
| ---------------------- | ------------------ | -------------------------------- |
| SessionStart hook      | `settings.json`    | Hook system for lifecycle events |
| PreToolUse hook        | Hook system        | Intercepts tool calls            |
| SubagentStop hook      | Hook system        | Controls agent lifecycle         |
| Auto context injection | PreToolUse:Task    | Hooks inject JSONL content       |
| Ralph Loop             | SubagentStop:check | Blocks agent until verify passes |
| Multi-Session          | CLI + hooks        | Session resume, worktree scripts |

**No workaround**: These features fundamentally require a hook system.

---

## Platform Usage Guides

### Claude Code + iFlow (Full Support)

All features work automatically. Hooks provide context injection and quality enforcement.

```bash
# Initialize
trellis init -u your-name           # Claude Code (default)
trellis init --iflow -u your-name   # iFlow
```

### Cursor

```bash
trellis init --cursor -u your-name
```

- **Works**: Workspace, tasks, specs, commands (read via `.cursor/commands/trellis-*.md`)
- **Doesn't work**: Hooks, auto-injection, Ralph Loop, Multi-Session
- **Workaround**: Manually read spec files at session start

### OpenCode

```bash
trellis init --opencode -u your-name
```

- **Works**: Workspace, tasks, specs, agents, commands
- **Note**: Full subagent context injection requires [oh-my-opencode](https://github.com/nicepkg/oh-my-opencode). Without it, agents use Self-Loading fallback.

### Codex

```bash
trellis init --codex -u your-name
```

- Commands mapped to Codex Skills format under `.agents/skills/`
- Use `$start`, `$finish-work`, `$brainstorm` etc. to invoke

### Kilo, Kiro, Gemini CLI, Antigravity

```bash
trellis init --kilo -u your-name
trellis init --kiro -u your-name
trellis init --gemini -u your-name
trellis init --antigravity -u your-name
```

- Each platform uses its native command format
- Core file-based systems work the same across all platforms

---

## Version Compatibility Matrix

| Trellis Version | Platforms Supported |
| --------------- | ------------------- |
| 0.2.x           | Claude Code, Cursor |
| 0.3.0           | All 9 platforms     |

---

## Checking Your Platform

### Claude Code

```bash
claude --version
cat .claude/settings.json | grep -A 5 '"hooks"'
```

### Other Platforms

```bash
# Check if platform config directory exists
ls -la .cursor/ .opencode/ .iflow/ .agents/ .kilocode/ .kiro/ .gemini/ .agent/ 2>/dev/null
```

### Determining Support Level

```
Does the platform have hook support?
├── YES (Claude Code, iFlow) → Full Trellis support
└── NO  (all others) → Partial support
         ├── Can read files → Layer 1 works
         └── Has agent system → Layer 2 partial
```
