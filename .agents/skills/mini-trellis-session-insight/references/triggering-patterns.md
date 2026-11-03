# Triggering Patterns

Examples of requests that may need earlier project knowledge. Use `mini-trellis mem` when the current conversation or open files do not already provide the answer.

Patterns are grouped by the *intent* behind the phrasing, not the surface words. The same intent shows up in different languages and registers.

Start with project-scoped `recall`. It returns source-linked excerpts from documents and past conversations. If an excerpt answers the question with its necessary conditions and negations, cite it and stop. Use `read` only for missing context; a hit is not a reason to repeat the query or run another search path.

## Past-solution recall

The user is asking "how did we (or I) solve this before". Topic notes and past conversations can explain the reasoning behind the code.

- "How did we solve this last time?"
- "What did we end up doing about X?"
- "We dealt with this once already, didn't we?"
- "上次怎么解的?"
- "之前是怎么搞定 X 的?"
- "我记得以前修过类似的"

Reach: `mini-trellis mem recall "<symptom keyword or relevant path>"`. Use `mini-trellis mem read "<ref>"` if the excerpt leaves the resolution or its conditions unclear.

## Decision retrieval

The user is referencing an earlier decision whose rationale may be in project notes or past dialogue.

- "What was the decision on X?"
- "Did we decide to use Postgres or SQLite?"
- "The rationale for choosing X over Y was…?"
- "我们当时为啥选了 X 而不是 Y?"
- "关于 X 我们之前是怎么定的?"
- "之前讨论过 X 的方案吗?"

Reach: `mini-trellis mem recall "<decision keyword>"`. Expand a returned ref only when needed to distinguish a proposal, rejection, or confirmed decision.

## Cross-session continuation

The user resumed work after a gap and the context is implicit.

- "Where were we?"
- "Continue from last time."
- "Pick up where we left off."
- "继续上次的"
- "我们上次做到哪了"
- "接着昨天那个任务"

Reach: check the active journal and current context first. If earlier details are missing, use `mini-trellis mem recall "<work topic or changed path>"`, then read only the refs needed to resume.

## Familiar-bug debugging

The current bug feels like one already seen. Past sessions probably hold the resolution path.

- "I feel like I've hit this before."
- "Doesn't this look like that bug from last month?"
- "Same kind of timeout I had in X."
- "这个错好像之前见过"
- "这个 bug 是不是上次那个?"
- "怎么又是这个 error?"

Reach: `mini-trellis mem recall "<error message fragment>"`. Anchor on a short, distinctive token from the actual error string, and read a ref only if the fix or its conditions need more context.

## Self-pattern spotting

The user is asking whether they keep repeating the same kind of mistake or decision.

- "Do I always make this mistake?"
- "How often have I run into X?"
- "Is this a recurring thing for me?"
- "我每次都踩这个坑吗?"
- "我老犯这个错?"
- "这类问题之前出现过几次?"

Reach: `mini-trellis mem recall "<topic>"`. Compare the returned examples and their sources; expand only unresolved context. Describe observed examples rather than treating a limited result set as a complete count.

## Session retrospective (on demand)

The user explicitly wants to look back at recent work — not as a forced step, only when they ask.

- "Summarize what we did."
- "What were the key decisions / surprises?"
- "Write up the lessons from this round."
- "总结一下这次的经验"
- "记一下这次踩的坑"
- "复盘下这个任务"

Reach: summarize from the current conversation first. If older context is needed, use `mini-trellis mem recall "<work topic>"` and read only the refs that fill a gap. Include source or file:line citations where useful.

For an explicit recording request or a confirmed reusable decision, follow the host's remember guidance: update an existing spec/research topic, check the saved content, and link it from a brief journal entry. Summarizing alone does not turn unconfirmed ideas into decisions. Respect requests not to record; ordinary edits need no automatic note.

## Explicit cross-project requests

Keep lookup in the current project by default. When the user explicitly asks about another project, pass `--cwd "<requested project path>"` to both `recall` and any follow-up `read`. Each lookup stays scoped to that project. Cross-project conversation-only commands and filters are listed in [the CLI reference](cli-quick-reference.md).

## Anti-patterns: do NOT reach for `mem` here

- "What does this function do?" → read the file.
- "Why is this test failing?" → read the test output and the file.
- "What's the right pattern for X in our codebase?" → read an already located spec or code example; use recall if the relevant rule is missing.
- "What's the latest npm version of Y?" → call `npm view`.
- "Fix this bug." → debug. Reach for `mem` only if you suspect prior context exists; otherwise it is noise.

The bar stays: would a senior teammate ask "didn't we already talk about this?" before answering? If yes, reach for `mem`. If no, don't.
