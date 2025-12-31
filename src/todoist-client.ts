import { TodoistApi } from '@doist/todoist-api-typescript';
import type { 
  Task, 
  Project, 
  Section, 
  Label, 
  Comment 
} from '@doist/todoist-api-typescript';

export class TodoistClient {
  private api: TodoistApi;

  constructor(apiToken: string) {
    this.api = new TodoistApi(apiToken);
  }

  // Task methods
  async getTasks(filter?: string): Promise<Task[]> {
    if (filter) {
      // Use the filter endpoint for queries
      const response = await this.api.getTasksByFilter({
        query: filter,
        limit: 200
      });
      return response.results;
    } else {
      // Get all tasks
      const response = await this.api.getTasks({
        limit: 200
      });
      return response.results;
    }
  }

  async getTask(taskId: string): Promise<Task> {
    return this.api.getTask(taskId);
  }

  async createTask(task: {
    content: string;
    description?: string | null;
    projectId?: string | null;
    sectionId?: string | null;
    parentId?: string | null;
    order?: number | null;
    labels?: string[] | null;
    priority?: number | null;
    assigneeId?: string | null;
    dueString?: string | null;
    dueDate?: string | null;
    dueDatetime?: string | null;
    dueLang?: string | null;
    duration?: number | null;
    durationUnit?: 'minute' | 'day' | null;
  }): Promise<Task> {
    const { dueDatetime, dueDate, content, ...rest } = task;
    const args: any = { content };
    
    // Add non-null optional fields
    Object.entries(rest).forEach(([key, value]) => {
      if (value != null) args[key] = value;
    });
    
    // Handle mutually exclusive due date fields
    if (dueDatetime != null) {
      args.dueDatetime = dueDatetime;
    } else if (dueDate != null) {
      args.dueDate = dueDate;
    }
    
    return this.api.addTask(args);
  }

  async updateTask(taskId: string, updates: {
    content?: string;
    description?: string;
    labels?: string[];
    priority?: number;
    dueString?: string;
    dueDate?: string;
    dueDatetime?: string;
    dueLang?: string;
    assigneeId?: string;
  }): Promise<Task> {
    const { dueDatetime, dueDate, ...rest } = updates;
    const args: any = {};
    
    // Add defined fields (including null for clearing)
    Object.entries(rest).forEach(([key, value]) => {
      if (value !== undefined) args[key] = value;
    });
    
    // Handle mutually exclusive due date fields
    if (dueDatetime !== undefined) {
      args.dueDatetime = dueDatetime;
    } else if (dueDate !== undefined) {
      args.dueDate = dueDate;
    }
    
    return this.api.updateTask(taskId, args);
  }

  async completeTask(taskId: string): Promise<void> {
    await this.api.closeTask(taskId);
  }

  async uncompleteTask(taskId: string): Promise<void> {
    await this.api.reopenTask(taskId);
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.api.deleteTask(taskId);
  }

  async moveTasks(taskIds: string[], destination: {
    projectId?: string;
    sectionId?: string;
    parentId?: string;
  }): Promise<Task[]> {
    const { projectId, sectionId, parentId } = destination;
    const args: any = {};
    
    const provided = [projectId, sectionId, parentId].filter(v => v != null);
    if (provided.length !== 1) {
      throw new Error('Must provide exactly one of projectId, sectionId, or parentId');
    }
    
    if (projectId != null) args.projectId = projectId;
    else if (sectionId != null) args.sectionId = sectionId;
    else if (parentId != null) args.parentId = parentId;
    
    return this.api.moveTasks(taskIds, args);
  }

  // Project methods
  async getProjects(): Promise<Project[]> {
    const response = await this.api.getProjects({
      limit: 200
    });
    return response.results;
  }

  async getProject(projectId: string): Promise<Project> {
    return this.api.getProject(projectId);
  }

  async createProject(project: {
    name: string;
    parentId?: string | null;
    color?: string | null;
    isFavorite?: boolean | null;
    viewStyle?: 'list' | 'board' | null;
  }): Promise<Project> {
    const { name, ...rest } = project;
    const args: any = { name };
    
    // Add non-null optional fields
    Object.entries(rest).forEach(([key, value]) => {
      if (value != null) args[key] = value;
    });
    
    return this.api.addProject(args);
  }

  async updateProject(projectId: string, updates: {
    name?: string;
    color?: string;
    isFavorite?: boolean;
    viewStyle?: 'list' | 'board';
  }): Promise<Project> {
    return this.api.updateProject(projectId, updates);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.api.deleteProject(projectId);
  }

  // Section methods
  async getSections(projectId?: string): Promise<Section[]> {
    const args: any = {
      limit: 200
    };
    if (projectId) {
      args.projectId = projectId;
    }
    const response = await this.api.getSections(args);
    return response.results;
  }

  async getSection(sectionId: string): Promise<Section> {
    return this.api.getSection(sectionId);
  }

  async createSection(section: {
    name: string;
    projectId: string;
    order?: number | null;
  }): Promise<Section> {
    const { name, projectId, order } = section;
    const args: any = { name, projectId };
    
    if (order != null) args.order = order;
    
    return this.api.addSection(args);
  }

  async updateSection(sectionId: string, updates: {
    name: string;
  }): Promise<Section> {
    return this.api.updateSection(sectionId, updates);
  }

  async deleteSection(sectionId: string): Promise<void> {
    await this.api.deleteSection(sectionId);
  }

  // Label methods
  async getLabels(): Promise<Label[]> {
    const response = await this.api.getLabels({
      limit: 200
    });
    return response.results;
  }

  async getLabel(labelId: string): Promise<Label> {
    return this.api.getLabel(labelId);
  }

  async createLabel(label: {
    name: string;
    color?: string | null;
    order?: number | null;
    isFavorite?: boolean | null;
  }): Promise<Label> {
    const { name, ...rest } = label;
    const args: any = { name };
    
    // Add non-null optional fields
    Object.entries(rest).forEach(([key, value]) => {
      if (value != null) args[key] = value;
    });
    
    return this.api.addLabel(args);
  }

  async updateLabel(labelId: string, updates: {
    name?: string;
    color?: string;
    order?: number;
    isFavorite?: boolean;
  }): Promise<Label> {
    return this.api.updateLabel(labelId, updates);
  }

  async deleteLabel(labelId: string): Promise<void> {
    await this.api.deleteLabel(labelId);
  }

  // Comment methods
  async getComments(params: { taskId?: string; projectId?: string }): Promise<Comment[]> {
    if (params.taskId) {
      const response = await this.api.getComments({ 
        taskId: params.taskId,
        limit: 200 
      });
      return response.results;
    } else if (params.projectId) {
      const response = await this.api.getComments({ 
        projectId: params.projectId,
        limit: 200 
      });
      return response.results;
    } else {
      throw new Error('Either taskId or projectId must be provided');
    }
  }

  async getComment(commentId: string): Promise<Comment> {
    return this.api.getComment(commentId);
  }

  async createComment(comment: {
    content: string;
    taskId?: string | null;
    projectId?: string | null;
    attachment?: any | null;
  }): Promise<Comment> {
    if (!comment.taskId && !comment.projectId) {
      throw new Error('Either taskId or projectId must be provided');
    }
    
    const { content, taskId, projectId, attachment } = comment;
    const args: any = { content };
    
    if (taskId != null) args.taskId = taskId;
    if (projectId != null) args.projectId = projectId;
    if (attachment != null) args.attachment = attachment;
    
    return this.api.addComment(args);
  }

  async updateComment(commentId: string, content: string): Promise<Comment> {
    return this.api.updateComment(commentId, { content });
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.api.deleteComment(commentId);
  }
}

// Re-export types from the official library for convenience
export type { Task, Project, Section, Label, Comment } from '@doist/todoist-api-typescript';