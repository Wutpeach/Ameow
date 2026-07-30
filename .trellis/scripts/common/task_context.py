#!/usr/bin/env python3
"""
Task JSONL context management.

Provides:
    cmd_add_context   - Add entry to JSONL context file
    cmd_validate      - Validate JSONL context files
    cmd_list_context  - List JSONL context entries

Note:
    ``cmd_init_context`` was removed in v0.5.0-beta.12. JSONL context files
    are now seeded at ``task.py create`` time with a self-describing
    ``_example`` line; the AI agent curates real entries during planning when
    the task needs sub-agent/spec context. See ``.trellis/workflow.md`` for the
    current planning artifact contract.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import get_context_injection_limits
from .context_documents import INDEX_MAX_BYTES, is_index_document, validate_context_document
from .git import branch_exists_locally
from .io import read_json
from .log import Colors, colored
from .paths import FILE_TASK_JSON, get_repo_root, get_tasks_dir
from .task_utils import resolve_task_dir


# =============================================================================
# Command: add-context
# =============================================================================

def cmd_add_context(args: argparse.Namespace) -> int:
    """Add entry to JSONL context file."""
    repo_root = get_repo_root()
    target_dir = resolve_task_dir(args.dir, repo_root)

    jsonl_name = args.file
    path = args.path
    reason = args.reason or "Added manually"

    if not target_dir.is_dir():
        print(colored(f"Error: Directory not found: {target_dir}", Colors.RED))
        return 1

    # Support shorthand
    if not jsonl_name.endswith(".jsonl"):
        jsonl_name = f"{jsonl_name}.jsonl"

    if jsonl_name not in {"implement.jsonl", "check.jsonl"}:
        print(colored("Error: JSONL file must be implement or check", Colors.RED))
        return 1

    jsonl_file = target_dir / jsonl_name
    max_file_bytes = get_context_injection_limits(repo_root)["max_file_bytes"]
    full_path, error = validate_context_document(
        repo_root, target_dir, path, max_file_bytes
    )
    if error or full_path is None:
        print(colored(f"Error: Invalid context document {path}: {error}", Colors.RED))
        return 1
    path = full_path.relative_to(repo_root.resolve()).as_posix()

    # Check if already exists
    if jsonl_file.is_file():
        content = jsonl_file.read_text(encoding="utf-8")
        if f'"{path}"' in content:
            print(colored(f"Warning: Entry already exists for {path}", Colors.YELLOW))
            return 0

    with jsonl_file.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"file": path, "reason": reason}, ensure_ascii=False) + "\n")

    print(colored(f"Added file: {path}", Colors.GREEN))
    return 0


# =============================================================================
# Command: validate
# =============================================================================

def cmd_validate(args: argparse.Namespace) -> int:
    """Validate JSONL context files."""
    repo_root = get_repo_root()
    target_dir = resolve_task_dir(args.dir, repo_root)

    if not target_dir.is_dir():
        print(colored("Error: task directory required", Colors.RED))
        return 1

    print(colored("=== Validating Context Files ===", Colors.BLUE))
    print(f"Target dir: {target_dir}")
    print()

    # Warn (don't fail validation) when the recorded branch is stale — it
    # was likely already merged and deleted (#399 item 2).
    task_json_path = target_dir / FILE_TASK_JSON
    if task_json_path.is_file():
        task_data = read_json(task_json_path)
        stored_branch = task_data.get("branch") if task_data else None
        if stored_branch and not branch_exists_locally(stored_branch, repo_root):
            print(
                colored(
                    f"Warning: recorded branch '{stored_branch}' no longer exists locally "
                    "(likely merged and deleted).",
                    Colors.YELLOW,
                )
            )
            print()

    total_errors = 0
    for jsonl_name in ["implement.jsonl", "check.jsonl"]:
        jsonl_file = target_dir / jsonl_name
        errors = _validate_jsonl(jsonl_file, repo_root, target_dir)
        total_errors += errors

    print()
    if total_errors == 0:
        print(colored("✓ All validations passed", Colors.GREEN))
        return 0
    else:
        print(colored(f"✗ Validation failed ({total_errors} errors)", Colors.RED))
        return 1


def _validate_jsonl(jsonl_file: Path, repo_root: Path, task_dir: Path | None = None) -> int:
    """Validate a single JSONL file.

    Seed rows (no ``file`` field — typically ``{"_example": "..."}``) are
    skipped silently; they are self-describing comments, not real entries.

    Every real row must reference an injectable Markdown leaf under the spec
    root or this task's research directory.
    """
    file_name = jsonl_file.name
    errors = 0

    if not jsonl_file.is_file():
        print(f"  {colored(f'{file_name}: not found (skipped)', Colors.YELLOW)}")
        return 0

    max_file_bytes = get_context_injection_limits(repo_root).get("max_file_bytes", 0)

    line_num = 0
    real_entries = 0
    for line in jsonl_file.read_text(encoding="utf-8").splitlines():
        line_num += 1
        if not line.strip():
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            print(f"  {colored(f'{file_name}:{line_num}: Invalid JSON', Colors.RED)}")
            errors += 1
            continue

        if not isinstance(data, dict):
            print(f"  {colored(f'{file_name}:{line_num}: JSON row must be an object', Colors.RED)}")
            errors += 1
            continue

        file_path = data.get("file") or data.get("path")

        if not file_path:
            # Seed / comment row — skip silently
            continue

        real_entries += 1
        if task_dir is None:
            print(f"  {colored(f'{file_name}:{line_num}: task directory required', Colors.RED)}")
            errors += 1
            continue
        _, error = validate_context_document(
            repo_root, task_dir, file_path, max_file_bytes
        )
        if error:
            print(f"  {colored(f'{file_name}:{line_num}: {file_path}: {error}', Colors.RED)}")
            errors += 1

    if errors == 0:
        print(f"  {colored(f'{file_name}: ✓ ({real_entries} entries)', Colors.GREEN)}")
    else:
        print(f"  {colored(f'{file_name}: ✗ ({errors} errors)', Colors.RED)}")

    return errors


def validate_task_context(repo_root: Path, task_dir: Path) -> int:
    """Validate both context manifests without resolving CLI arguments."""
    return sum(
        _validate_jsonl(task_dir / name, repo_root, task_dir)
        for name in ("implement.jsonl", "check.jsonl")
    )


def cmd_audit_context(args: argparse.Namespace) -> int:
    """Audit spec and non-archived research Markdown sizes and node kinds."""
    del args
    repo_root = get_repo_root()
    max_file_bytes = get_context_injection_limits(repo_root)["max_file_bytes"]
    files = list((repo_root / ".trellis" / "spec").rglob("*.md"))
    tasks_dir = get_tasks_dir(repo_root)
    for task_dir in tasks_dir.iterdir() if tasks_dir.is_dir() else ():
        if task_dir.is_dir() and task_dir.name != "archive":
            research_dir = task_dir / "research"
            if research_dir.is_dir():
                files.extend(research_dir.rglob("*.md"))

    print(colored("=== Auditing Context Documents ===", Colors.BLUE))
    errors = 0
    for path in sorted(files):
        relative = path.relative_to(repo_root).as_posix()
        size = path.stat().st_size
        kind = "index" if is_index_document(path) else "leaf"
        limit = INDEX_MAX_BYTES if kind == "index" else max_file_bytes
        violation = limit > 0 and size > limit
        status = f"VIOLATION > {limit}" if violation else "ok"
        color = Colors.RED if violation else Colors.GREEN
        print(f"  {kind:5} {size:7}  {relative}  {colored(status, color)}")
        errors += int(violation)

    if errors:
        print(colored(f"✗ Context audit failed ({errors} violations)", Colors.RED))
        return 1
    print(colored(f"✓ Context audit passed ({len(files)} documents)", Colors.GREEN))
    return 0


# =============================================================================
# Command: list-context
# =============================================================================

def cmd_list_context(args: argparse.Namespace) -> int:
    """List JSONL context entries."""
    repo_root = get_repo_root()
    target_dir = resolve_task_dir(args.dir, repo_root)

    if not target_dir.is_dir():
        print(colored("Error: task directory required", Colors.RED))
        return 1

    print(colored("=== Context Files ===", Colors.BLUE))
    print()

    for jsonl_name in ["implement.jsonl", "check.jsonl"]:
        jsonl_file = target_dir / jsonl_name
        if not jsonl_file.is_file():
            continue

        print(colored(f"[{jsonl_name}]", Colors.CYAN))

        count = 0
        seed_only = True
        for line in jsonl_file.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue

            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue

            file_path = data.get("file") or data.get("path")
            if not file_path:
                # Seed / comment row — don't count as a real entry
                continue
            seed_only = False

            count += 1
            entry_type = data.get("type", "file")
            reason = data.get("reason", "-")

            if entry_type == "directory":
                print(f"  {colored(f'{count}.', Colors.GREEN)} [DIR] {file_path}")
            else:
                print(f"  {colored(f'{count}.', Colors.GREEN)} {file_path}")
            print(f"     {colored('→', Colors.YELLOW)} {reason}")

        if seed_only:
            print(f"  {colored('(no curated entries yet — only seed row)', Colors.YELLOW)}")

        print()

    return 0
