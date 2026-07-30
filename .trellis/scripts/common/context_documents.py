#!/usr/bin/env python3
"""Policy for Markdown documents referenced by task context manifests."""

from __future__ import annotations

from pathlib import Path


INDEX_MARKER = "<!-- trellis-index -->"
INDEX_MAX_BYTES = 8192


def is_index_document(path: Path) -> bool:
    """Return whether ``path`` is a navigation node rather than a leaf."""
    if path.name.lower() == "index.md":
        return True
    try:
        return INDEX_MARKER in path.read_text(encoding="utf-8")[:8192]
    except (OSError, UnicodeError):
        return False


def validate_context_document(
    repo_root: Path,
    task_dir: Path,
    file_path: object,
    max_file_bytes: int,
) -> tuple[Path | None, str | None]:
    """Resolve and validate one injectable spec/research leaf document."""
    repo_root = repo_root.resolve()
    task_dir = task_dir.resolve()
    tasks_root = (repo_root / ".trellis" / "tasks").resolve()
    if not _is_within(task_dir, tasks_root):
        return None, "task directory must be under .trellis/tasks/"
    if not isinstance(file_path, str) or not file_path.strip():
        return None, "path must be a non-empty string"
    raw_path = Path(file_path)
    if raw_path.is_absolute():
        return None, "absolute paths are not allowed"

    resolved = (repo_root / raw_path).resolve()
    if not resolved.exists():
        return None, "file not found"
    if resolved.is_dir():
        return None, "directories are not allowed"
    if not resolved.is_file():
        return None, "not a regular file"
    if resolved.suffix.lower() != ".md":
        return None, "only Markdown (.md) files are allowed"

    spec_root = (repo_root / ".trellis" / "spec").resolve()
    research_root = (task_dir / "research").resolve()
    if not _is_within(spec_root, repo_root):
        return None, ".trellis/spec/ must resolve inside the repository"
    if not _is_within(research_root, task_dir):
        return None, "this task's research/ must resolve inside the task directory"
    allowed_roots = (spec_root, research_root)
    if not any(_is_within(resolved, root) for root in allowed_roots):
        return None, "path must be under .trellis/spec/ or this task's research/"
    if is_index_document(resolved):
        return None, "index documents are navigation-only; select a leaf document"

    size = resolved.stat().st_size
    if max_file_bytes > 0 and size > max_file_bytes:
        return None, f"file is {size} bytes; limit is {max_file_bytes} bytes"
    return resolved, None


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False
