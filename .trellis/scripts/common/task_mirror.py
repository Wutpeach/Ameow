"""
Mirror task workflow state from a worktree back to the primary repo.

This keeps `.trellis/tasks/.../task.json` in the main repository aligned with
the copy inside a prepared worktree, so parent-task orchestration can observe
the latest child status.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from .git import run_git
from .paths import DIR_TASKS, DIR_WORKFLOW, FILE_TASK_JSON, get_repo_root


def get_primary_repo_root(repo_root: Path | None = None) -> Path:
    """Resolve the primary repo root shared by all worktrees."""
    if repo_root is None:
        repo_root = get_repo_root()

    ret, out, _ = run_git(
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=repo_root,
    )
    if ret != 0 or not out.strip():
        return repo_root

    git_common_dir = Path(out.strip())
    if git_common_dir.name == ".git":
        return git_common_dir.parent
    return repo_root


def get_primary_task_json_path(task_json_path: Path) -> Path | None:
    """Map a worktree-local task.json path back to the primary repo."""
    task_json_abs = task_json_path if task_json_path.is_absolute() else task_json_path.absolute()
    current_repo_root = get_repo_root(task_json_abs.parent)
    primary_repo_root = get_primary_repo_root(current_repo_root)

    if primary_repo_root.absolute() == current_repo_root.absolute():
        return None

    try:
        relative_path = task_json_abs.relative_to(current_repo_root.absolute())
    except ValueError:
        return None

    if len(relative_path.parts) < 3:
        return None

    if relative_path.parts[0] != DIR_WORKFLOW or relative_path.parts[1] != DIR_TASKS:
        return None

    if relative_path.name != FILE_TASK_JSON:
        return None

    return primary_repo_root / relative_path


def mirror_task_json_to_primary_repo(task_json_path: Path) -> bool:
    """Copy a worktree-local task.json back into the primary repo if needed."""
    primary_task_json = get_primary_task_json_path(task_json_path)
    if primary_task_json is None:
        return False

    primary_task_json.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(task_json_path, primary_task_json)
    return True
