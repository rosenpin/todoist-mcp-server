import axios, { AxiosInstance } from 'axios';
import { TodoistTask, TodoistProject } from './types.js';

export class TodoistClient {
  private api: AxiosInstance;

  constructor(apiToken: string) {
    this.api = axios.create({
      baseURL: 'https://api.todoist.com/rest/v2',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getProjects(): Promise<TodoistProject[]> {
    const response = await this.api.get<TodoistProject[]>('/projects');
    return response.data;
  }

  async getTasks(filter?: string): Promise<TodoistTask[]> {
    const params = filter ? { filter } : {};
    const response = await this.api.get<TodoistTask[]>('/tasks', { params });
    return response.data;
  }

  async createTask(task: {
    content: string;
    projectId?: string;
    description?: string;
    labels?: string[];
    priority?: number;
    dueString?: string;
  }): Promise<TodoistTask> {
    const response = await this.api.post<TodoistTask>('/tasks', {
      content: task.content,
      project_id: task.projectId,
      description: task.description,
      labels: task.labels,
      priority: task.priority || 1,
      due_string: task.dueString
    });
    return response.data;
  }

  async updateTask(taskId: string, updates: {
    content?: string;
    description?: string;
    labels?: string[];
    priority?: number;
    dueString?: string;
  }): Promise<void> {
    await this.api.post(`/tasks/${taskId}`, {
      content: updates.content,
      description: updates.description,
      labels: updates.labels,
      priority: updates.priority,
      due_string: updates.dueString
    });
  }

  async completeTask(taskId: string): Promise<void> {
    await this.api.post(`/tasks/${taskId}/close`);
  }

  async uncompleteTask(taskId: string): Promise<void> {
    await this.api.post(`/tasks/${taskId}/reopen`);
  }
}