// Integration types for the MCP server
export interface Integration {
  integrationId: string;
  todoistToken: string;
  createdAt: Date;
  lastUsed?: Date;
}

// Re-export types from the official Todoist library
export type {
  Task as TodoistTask,
  Project as TodoistProject,
  Section as TodoistSection,
  Label as TodoistLabel,
  Comment as TodoistComment,
} from '@doist/todoist-api-typescript';