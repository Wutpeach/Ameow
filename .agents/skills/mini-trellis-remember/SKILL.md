---
name: mini-trellis-remember
description: "Save confirmed decisions, rejected approaches worth not retrying, and reusable findings. Update existing spec/research topics and link them from the journal. Use when asked to remember, when a decision is confirmed, or for a useful session/compact handoff."
---

# Remember

Save the confirmed decision or finding in the relevant topic, updating an existing file, then link it from the journal. Keep the rule short and faithful; leave unconfirmed exceptions and implementation choices open or label them as inference. A journal entry alone does not update a topic.

## When

- The user asks to remember / persist notes
- A confirmed decision, reusable finding, or verified fix should survive this session
- A rejected approach or dead end should not be retried in a later session; label it rejected, not as a current rule
- The session is about to end and has a useful handoff
- The session was compacted, or context is about to be compacted

## Write

For a confirmed rule or reusable finding, follow this short order: read the existing research/spec topic (new durable rules can go directly into spec); edit that file; read it back and compare the changed rule with the requested conclusion, including limits and negations; then record the journal link. Reuse files already open; use `mem recall` only when you need to locate the topic. Preserve the existing document's language. Do not claim a topic update based on a planned edit or journal text.

Then record a short journal entry using the existing script; no CLI `spec` or `update-spec` subcommand is needed:

```bash
python ./.trellis/scripts/add_session.py \
  --title "Short title" \
  --commit - \
  --summary "What happened, what was decided, what to reuse" \
  --topic .trellis/research/example.md
```

Replace `--topic` with the actual file just verified, or omit it for a handoff without a topic. It validates the file and adds its path to the journal; it does not write the topic or check its meaning. Do not pass an invented path. Read back the resulting journal entry to verify its link before reporting completion. If only the topic or journal was saved, name the completed part and the missing part; retry only the missing work.

`--commit` already defaults to `-` (no git evidence). Add `--change`, `--test`, `--next-step` when they help a future session. Use `--stdin` for longer notes.

If this session produced reusable research, write `.trellis/research/<topic>.md` and mention that path in the summary. Promote durable boundaries into `.trellis/spec/` with `mini-trellis-update-spec` (short markdown).

## Reuse and language

Before writing a topic, use `mini-trellis mem recall "<topic>"` if the relevant notes are not already open. Expand needed evidence with `mini-trellis mem read "<ref>"`. Update the existing research/spec section; record the scope and sources, distinguish user confirmation from measured facts and inference, and keep a link when replacing an earlier decision. Journal should briefly describe the work and link to the topic, not repeat its body.

Skip ordinary turns and changes that add no reusable knowledge. Write new notes in the user's requested language, otherwise the discussion language; preserve the language of an existing document. Do not translate paths or identifiers. Check the writer's result and report failures; never claim notes were saved after an error. Closing a window or a crash does not guarantee a final write.
