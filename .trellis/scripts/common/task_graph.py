"""
Parent-task dependency helpers for Trellis worktree workflows.

Provides:
    resolve_task_reference  - Resolve CLI arg or current task to an absolute task dir
    load_task_data          - Read task.json from a task directory
    load_parent_subtasks    - Load child task metadata from a parent's subtasks list
    topological_sort        - Sort subtasks by dependency order
    is_task_completed       - Normalize completion-state checks
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .io import read_json, write_json
from .paths import FILE_TASK_JSON, get_current_task, get_repo_root
from .task_utils import resolve_task_dir


COMPLETED_STATUSES = ("completed", "done")


@dataclass(frozen=True)
class ParentSubtask:
    """Loaded parent->child subtask entry."""

    name: str
    directory: Path
    task_json: Path
    data: dict
    depends_on: tuple[str, ...]
    parallel_group: str | None = None

    @property
    def title(self) -> str:
        return self.data.get("title") or self.data.get("name") or self.name

    @property
    def status(self) -> str:
        return self.data.get("status", "unknown")

    @property
    def branch(self) -> str | None:
        return self.data.get("branch")

    @property
    def base_branch(self) -> str | None:
        return self.data.get("base_branch")

    @property
    def worktree_path(self) -> str | None:
        return self.data.get("worktree_path")


def is_task_completed(status: str | None) -> bool:
    """Return True when a task status should be treated as done."""
    return (status or "").strip().lower() in COMPLETED_STATUSES


def resolve_task_reference(
    task_ref: str | None,
    repo_root: Path | None = None,
) -> Path | None:
    """Resolve a task CLI arg or fall back to the current Trellis task."""
    if repo_root is None:
        repo_root = get_repo_root()

    target = task_ref or get_current_task(repo_root)
    if not target:
        return None

    return resolve_task_dir(target, repo_root)


def load_task_data(task_dir: Path) -> dict | None:
    """Load task.json from a task directory."""
    task_json = task_dir / FILE_TASK_JSON
    if not task_json.is_file():
        return None
    return read_json(task_json)


def load_parent_subtasks(
    parent_dir: Path,
    parent_data: dict,
    repo_root: Path | None = None,
) -> list[ParentSubtask]:
    """Load and validate a parent's subtasks definition."""
    if repo_root is None:
        repo_root = get_repo_root()

    raw_subtasks = parent_data.get("subtasks", [])
    if not isinstance(raw_subtasks, list):
        raise ValueError(
            f"Invalid subtasks in {parent_dir / FILE_TASK_JSON}: expected a list"
        )

    subtasks: list[ParentSubtask] = []

    for raw_entry in raw_subtasks:
        if not isinstance(raw_entry, dict):
            raise ValueError(
                f"Invalid subtask entry in {parent_dir / FILE_TASK_JSON}: {raw_entry!r}"
            )

        task_ref = raw_entry.get("task")
        if not isinstance(task_ref, str) or not task_ref.strip():
            raise ValueError(
                f"Subtask entry missing 'task' in {parent_dir / FILE_TASK_JSON}"
            )

        child_dir = resolve_task_dir(task_ref, repo_root)
        child_data = load_task_data(child_dir)
        if child_data is None:
            raise ValueError(
                f"Child task.json not found for '{task_ref}' referenced by "
                f"{parent_dir / FILE_TASK_JSON}"
            )

        child_data = _load_effective_child_data(
            child_dir=child_dir,
            child_data=child_data,
            repo_root=repo_root,
        )

        raw_depends_on = raw_entry.get("depends_on", [])
        if raw_depends_on is None:
            raw_depends_on = []
        if not isinstance(raw_depends_on, list):
            raise ValueError(
                f"Invalid depends_on for '{task_ref}' in {parent_dir / FILE_TASK_JSON}"
            )

        depends_on = tuple(
            str(item).strip() for item in raw_depends_on if str(item).strip()
        )
        parallel_group = raw_entry.get("parallel_group")

        subtasks.append(
            ParentSubtask(
                name=child_dir.name,
                directory=child_dir,
                task_json=child_dir / FILE_TASK_JSON,
                data=child_data,
                depends_on=depends_on,
                parallel_group=(
                    parallel_group if isinstance(parallel_group, str) else None
                ),
            )
        )

    return subtasks


def _load_effective_child_data(
    *,
    child_dir: Path,
    child_data: dict,
    repo_root: Path,
) -> dict:
    """Prefer the worktree copy of a child task when it exists.

    The parent orchestrator runs from the main repo, but the active task state is
    often updated inside the prepared worktree copy first. This keeps dependency
    evaluation aligned with the latest worktree-local status even before mirror
    sync catches up.
    """
    worktree_path = child_data.get("worktree_path")
    if not isinstance(worktree_path, str) or not worktree_path.strip():
        return child_data

    try:
        relative_child_dir = child_dir.relative_to(repo_root)
    except ValueError:
        return child_data

    worktree_task_json = Path(worktree_path) / relative_child_dir / FILE_TASK_JSON
    worktree_data = read_json(worktree_task_json)
    if not worktree_data:
        return child_data

    if worktree_data != child_data:
        write_json(child_dir / FILE_TASK_JSON, worktree_data)

    return worktree_data


def topological_sort(subtasks: list[ParentSubtask]) -> list[ParentSubtask]:
    """Sort subtasks in dependency order while preserving declared order."""
    if not subtasks:
        return []

    by_name = {subtask.name: subtask for subtask in subtasks}
    order_index = {subtask.name: index for index, subtask in enumerate(subtasks)}
    indegree = {subtask.name: 0 for subtask in subtasks}
    adjacency = {subtask.name: [] for subtask in subtasks}

    for subtask in subtasks:
        for dependency in subtask.depends_on:
            if dependency not in by_name:
                raise ValueError(
                    f"Unknown dependency '{dependency}' referenced by '{subtask.name}'"
                )
            indegree[subtask.name] += 1
            adjacency[dependency].append(subtask.name)

    ready = [
        subtask.name for subtask in subtasks
        if indegree[subtask.name] == 0
    ]
    ready.sort(key=order_index.__getitem__)

    ordered: list[ParentSubtask] = []

    while ready:
        current = ready.pop(0)
        ordered.append(by_name[current])

        dependents = sorted(adjacency[current], key=order_index.__getitem__)
        for dependent in dependents:
            indegree[dependent] -= 1
            if indegree[dependent] == 0:
                ready.append(dependent)
                ready.sort(key=order_index.__getitem__)

    if len(ordered) != len(subtasks):
        raise ValueError("Detected a dependency cycle in parent subtasks")

    return ordered
