import { TodoistTask, TodoistProject } from './types.js';

export class TodoistClient {
  private baseURL = 'https://api.todoist.com/api/v1';
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Todoist API error (${response.status}): ${errorText}`;

      // Try to parse JSON error response if available
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          errorMessage = `Todoist API error (${response.status}): ${errorJson.error}`;
        }
      } catch {
        // Keep original error message if not JSON
      }

      throw new Error(errorMessage);
    }

    return response.json() as T;
  }

  async getProjects(): Promise<TodoistProject[]> {
    // The v1 API returns paginated results
    interface ProjectsResponse {
      results: TodoistProject[];
      next_cursor: string | null;
    }

    const allProjects: TodoistProject[] = [];
    let cursor: string | null = null;

    // Fetch all pages
    do {
      const params = new URLSearchParams();
      if (cursor) {
        params.append('cursor', cursor);
      }
      params.append('limit', '200'); // Max limit per API docs

      const endpoint = `/projects?${params.toString()}`;
      const response = await this.makeRequest<ProjectsResponse>(endpoint);

      allProjects.push(...response.results);
      cursor = response.next_cursor;
    } while (cursor);

    return allProjects;
  }

  async getTasks(filter?: string): Promise<TodoistTask[]> {
    if (filter) {
      // Use the new filter endpoint for filtered queries
      interface FilteredTasksResponse {
        results: TodoistTask[];
        next_cursor: string | null;
      }

      const allTasks: TodoistTask[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams();
        params.append('query', filter);
        if (cursor) {
          params.append('cursor', cursor);
        }
        params.append('limit', '200');

        const endpoint = `/tasks/filter?${params.toString()}`;
        const response = await this.makeRequest<FilteredTasksResponse>(endpoint);

        allTasks.push(...response.results);
        cursor = response.next_cursor;
      } while (cursor);

      return allTasks;
    } else {
      // Regular tasks endpoint for all tasks
      interface TasksResponse {
        results: TodoistTask[];
        next_cursor: string | null;
      }

      const allTasks: TodoistTask[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams();
        if (cursor) {
          params.append('cursor', cursor);
        }
        params.append('limit', '200');

        const endpoint = `/tasks?${params.toString()}`;
        const response = await this.makeRequest<TasksResponse>(endpoint);

        allTasks.push(...response.results);
        cursor = response.next_cursor;
      } while (cursor);

      return allTasks;
    }
  }

  async createTask(task: {
    content: string;
    projectId?: string;
    description?: string;
    labels?: string[];
    priority?: number;
    dueString?: string;
  }): Promise<TodoistTask> {
    const body = {
      content: task.content,
      project_id: task.projectId,
      description: task.description,
      labels: task.labels,
      priority: task.priority || 1,
      due_string: task.dueString
    };

    // Remove undefined values
    const cleanBody = Object.fromEntries(
      Object.entries(body).filter(([_, value]) => value !== undefined)
    );

    return this.makeRequest<TodoistTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify(cleanBody),
    });
  }

  async updateTask(taskId: string, updates: {
    content?: string;
    description?: string;
    labels?: string[];
    priority?: number;
    dueString?: string;
  }): Promise<void> {
    const body = {
      content: updates.content,
      description: updates.description,
      labels: updates.labels,
      priority: updates.priority,
      due_string: updates.dueString
    };

    // Remove undefined values
    const cleanBody = Object.fromEntries(
      Object.entries(body).filter(([_, value]) => value !== undefined)
    );

    await this.makeRequest(`/tasks/${taskId}`, {
      method: 'POST',
      body: JSON.stringify(cleanBody),
    });
  }

  async completeTask(taskId: string): Promise<void> {
    await this.makeRequest(`/tasks/${taskId}/close`, {
      method: 'POST',
    });
  }

  async uncompleteTask(taskId: string): Promise<void> {
    await this.makeRequest(`/tasks/${taskId}/reopen`, {
      method: 'POST',
    });
  }
}