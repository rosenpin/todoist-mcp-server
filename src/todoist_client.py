"""Todoist API client wrapper."""
# mypy: disable-error-code=attr-defined

import logging
from datetime import datetime
from typing import Any

from todoist_api_python.api import TodoistAPI

logger = logging.getLogger(__name__)


class TodoistClient:
    """Client for interacting with Todoist API."""

    def __init__(self, api_token: str) -> None:
        self.api = TodoistAPI(api_token)

    def get_projects(self) -> list[dict[str, Any]]:
        """Get all projects."""
        try:
            projects = list(self.api.get_projects())
            return [
                {
                    "id": p.id,
                    "name": p.name,
                    "color": p.color,
                    "is_favorite": p.is_favorite,
                }
                for p in projects
            ]
        except Exception as e:
            logger.error("Error getting projects: %s", e)
            return []

    def get_tasks(self, filter: str | None = None) -> list[dict[str, Any]]:
        """Get tasks with optional filter."""
        try:
            if filter:
                # Use Todoist filter syntax
                tasks = list(self.api.get_tasks(filter=filter))
            else:
                tasks = list(self.api.get_tasks())

            return [
                {
                    "id": t.id,
                    "content": t.content,
                    "description": t.description,
                    "project_id": t.project_id,
                    "section_id": t.section_id,
                    "labels": t.labels,
                    "priority": t.priority,
                    "due": {"string": t.due.string} if t.due else None,
                    "is_completed": t.is_completed,
                }
                for t in tasks
            ]
        except Exception as e:
            logger.error("Error getting tasks: %s", e)
            return []

    def create_task(
        self,
        content: str,
        description: str | None = None,
        project_id: str | None = None,
        labels: list[str] | None = None,
        priority: int = 1,
        due_string: str | None = None,
    ) -> dict[str, Any]:
        """Create a new task."""
        try:
            task_data: dict[str, Any] = {"content": content, "priority": priority}

            if description:
                task_data["description"] = description
            if project_id:
                task_data["project_id"] = project_id
            if labels:
                task_data["labels"] = labels
            if due_string:
                task_data["due_string"] = due_string

            task = self.api.add_task(**task_data)
            return {
                "id": task.id,
                "content": task.content,
                "description": task.description,
                "project_id": task.project_id,
                "section_id": task.section_id,
                "labels": task.labels,
                "priority": task.priority,
                "due": {"string": task.due.string} if task.due else None,
                "is_completed": task.is_completed,
            }
        except Exception as e:
            logger.error("Error creating task: %s", e)
            raise

    def update_task(
        self,
        task_id: str,
        content: str | None = None,
        description: str | None = None,
        labels: list[str] | None = None,
        priority: int | None = None,
        due_string: str | None = None,
    ) -> bool:
        """Update a task by ID."""
        try:
            update_data: dict[str, Any] = {}
            if content is not None:
                update_data["content"] = content
            if description is not None:
                update_data["description"] = description
            if labels is not None:
                update_data["labels"] = labels
            if priority is not None:
                update_data["priority"] = priority
            if due_string is not None:
                update_data["due_string"] = due_string

            if update_data:
                self.api.update_task(task_id, **update_data)
                return True
            return False
        except Exception as e:
            logger.error("Error updating task: %s", e)
            return False

    def complete_task(self, task_id: str) -> bool:
        """Complete a task by ID."""
        try:
            self.api.complete_task(task_id)
            return True
        except Exception as e:
            logger.error("Error completing task: %s", e)
            return False

    def uncomplete_task(self, task_id: str) -> bool:
        """Reopen a completed task by ID."""
        try:
            self.api.reopen_task(task_id)
            return True
        except Exception as e:
            logger.error("Error uncompleting task: %s", e)
            return False
