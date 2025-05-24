"""Todoist API client wrapper."""

import logging
from datetime import datetime
from typing import Any

from todoist_api_python.api import TodoistAPI

logger = logging.getLogger(__name__)


class TodoistClient:
    """Client for interacting with Todoist API."""

    def __init__(self, api_token: str) -> None:
        self.api = TodoistAPI(api_token)

    def create_task(
        self,
        content: str,
        description: str | None = None,
        due_string: str | None = None,
        priority: int | None = None,
    ) -> dict[str, Any]:
        """Create a new task."""
        try:
            task_data = {"content": content}

            if description:
                task_data["description"] = description
            if due_string:
                task_data["due_string"] = due_string
            if priority and 1 <= priority <= 4:
                task_data["priority"] = priority

            task = self.api.add_task(**task_data)
            return {
                "success": True,
                "task": {
                    "id": task.id,
                    "content": task.content,
                    "description": task.description,
                    "due": task.due.string if task.due else None,
                    "priority": task.priority,
                },
            }
        except Exception as e:
            logger.error("Error creating task: %s", e)
            return {"success": False, "error": str(e)}

    def list_tasks(
        self,
        filter_str: str | None = None,
        priority: int | None = None,
        limit: int = 10,
    ) -> dict[str, Any]:
        """List tasks with optional filters."""
        try:
            # Get all active tasks
            tasks = self.api.get_tasks()

            # Apply priority filter if specified
            if priority:
                tasks = [t for t in tasks if t.priority == priority]

            # Apply filter string if specified
            if filter_str:
                # Simple filter implementation
                filter_lower = filter_str.lower()
                if filter_lower == "today":
                    today = datetime.now().date()
                    tasks = [
                        t for t in tasks if t.due and t.due.date == today.isoformat()
                    ]
                elif filter_lower == "overdue":
                    today = datetime.now().date()
                    tasks = [
                        t for t in tasks if t.due and t.due.date < today.isoformat()
                    ]

            # Apply limit
            tasks = tasks[:limit]

            return {
                "success": True,
                "count": len(tasks),
                "tasks": [
                    {
                        "id": task.id,
                        "content": task.content,
                        "description": task.description,
                        "due": task.due.string if task.due else None,
                        "priority": task.priority,
                        "project_id": task.project_id,
                        "labels": task.labels,
                    }
                    for task in tasks
                ],
            }
        except Exception as e:
            logger.error("Error listing tasks: %s", e)
            return {"success": False, "error": str(e)}

    def complete_task(self, task_name: str) -> dict[str, Any]:
        """Complete a task by name."""
        try:
            tasks = self.api.get_tasks()
            matching_task = None

            # Find task by name (case-insensitive partial match)
            for task in tasks:
                if task_name.lower() in task.content.lower():
                    matching_task = task
                    break

            if not matching_task:
                return {
                    "success": False,
                    "error": f"No task found matching '{task_name}'",
                }

            self.api.close_task(matching_task.id)

            return {
                "success": True,
                "message": f"Completed task: '{matching_task.content}'",
                "task": {"id": matching_task.id, "content": matching_task.content},
            }
        except Exception as e:
            logger.error("Error completing task: %s", e)
            return {"success": False, "error": str(e)}

    def update_task(
        self,
        task_name: str,
        content: str | None = None,
        description: str | None = None,
        due_string: str | None = None,
        priority: int | None = None,
    ) -> dict[str, Any]:
        """Update a task by name."""
        try:
            tasks = self.api.get_tasks()
            matching_task = None

            # Find task by name
            for task in tasks:
                if task_name.lower() in task.content.lower():
                    matching_task = task
                    break

            if not matching_task:
                return {
                    "success": False,
                    "error": f"No task found matching '{task_name}'",
                }

            # Build update data
            update_data = {}
            if content:
                update_data["content"] = content
            if description is not None:
                update_data["description"] = description
            if due_string:
                update_data["due_string"] = due_string
            if priority and 1 <= priority <= 4:
                update_data["priority"] = priority

            if update_data:
                updated_task = self.api.update_task(matching_task.id, **update_data)
                return {
                    "success": True,
                    "message": f"Updated task: '{matching_task.content}'",
                    "task": {
                        "id": updated_task.id,
                        "content": updated_task.content,
                        "description": updated_task.description,
                        "due": updated_task.due.string if updated_task.due else None,
                        "priority": updated_task.priority,
                    },
                }

            return {"success": False, "error": "No updates provided"}
        except Exception as e:
            logger.error("Error updating task: %s", e)
            return {"success": False, "error": str(e)}

    def delete_task(self, task_name: str) -> dict[str, Any]:
        """Delete a task by name."""
        try:
            tasks = self.api.get_tasks()
            matching_task = None

            # Find task by name
            for task in tasks:
                if task_name.lower() in task.content.lower():
                    matching_task = task
                    break

            if not matching_task:
                return {
                    "success": False,
                    "error": f"No task found matching '{task_name}'",
                }

            self.api.delete_task(matching_task.id)

            return {
                "success": True,
                "message": f"Deleted task: '{matching_task.content}'",
            }
        except Exception as e:
            logger.error("Error deleting task: %s", e)
            return {"success": False, "error": str(e)}
