import { TodoistTask, TodoistProject } from './types.js';

export class TodoistClient {
  private baseURL = 'https://api.todoist.com/rest/v2';
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
      throw new Error(`Todoist API error (${response.status}): ${errorText}`);
    }

    return response.json() as T;
  }

  async getProjects(): Promise<TodoistProject[]> {
    return this.makeRequest<TodoistProject[]>('/projects');
  }

  async getTasks(filter?: string): Promise<TodoistTask[]> {
    const params = new URLSearchParams();
    if (filter) {
      params.append('filter', filter);
    }
    
    const endpoint = params.toString() ? `/tasks?${params.toString()}` : '/tasks';
    return this.makeRequest<TodoistTask[]>(endpoint);
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

    return this.makeRequest<TodoistTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
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