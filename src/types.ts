export interface Integration {
  integrationId: string;
  todoistToken: string;
  createdAt: Date;
  lastUsed?: Date;
}

export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  projectId?: string;
  labels?: string[];
  priority: number;
  dueString?: string;
  isCompleted: boolean;
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
  parentId?: string;
  order: number;
  commentCount: number;
  isShared: boolean;
  isFavorite: boolean;
  isInboxProject: boolean;
  isTeamInbox: boolean;
  viewStyle: string;
  url: string;
}