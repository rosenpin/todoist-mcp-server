import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TodoistClient } from './todoist-client.js';
import { Integration } from './types.js';

export const createTodoistMcpServer = (integration: Integration): McpServer => {
  const server = new McpServer({
    name: 'todoist-mcp',
    version: '1.0.0',
  }, { capabilities: { logging: {} } });

  const todoistClient = new TodoistClient(integration.todoistToken);

  // Register tools
  server.tool(
    'list_projects',
    'Get all Todoist projects',
    {},
    async () => {
      try {
        const projects = await todoistClient.getProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projects, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching projects: ${error}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    'get_tasks',
    'Get tasks from Todoist with optional filtering',
    {
      projectId: z.string().optional().describe('Filter by project ID'),
      filterQuery: z.string().optional().describe('Todoist filter query'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum number of tasks')
    },
    async (args) => {
      try {
        const filterParts: string[] = [];
        
        if (args.projectId) {
          const projects = await todoistClient.getProjects();
          const project = projects.find(p => p.id === args.projectId);
          if (project) {
            filterParts.push(`#${project.name}`);
          }
        }
        
        if (args.filterQuery) {
          filterParts.push(args.filterQuery);
        }

        const filter = filterParts.length > 0 ? filterParts.join(' & ') : undefined;
        let tasks = await todoistClient.getTasks(filter);
        
        // Apply limit
        tasks = tasks.slice(0, args.limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tasks, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching tasks: ${error}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    'create_task',
    'Create a new task in Todoist',
    {
      content: z.string().describe('Task content/title'),
      projectId: z.string().optional().describe('Project ID'),
      description: z.string().optional().describe('Task description'),
      labels: z.array(z.string()).optional().describe('List of label names'),
      priority: z.number().min(1).max(4).default(1).describe('Priority (1-4)'),
      dueString: z.string().optional().describe('Due date in natural language')
    },
    async (args) => {
      try {
        const task = await todoistClient.createTask({
          content: args.content,
          projectId: args.projectId,
          description: args.description,
          labels: args.labels,
          priority: args.priority,
          dueString: args.dueString
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(task, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating task: ${error}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    'update_task',
    'Update an existing task',
    {
      taskId: z.string().describe('ID of the task to update'),
      content: z.string().optional().describe('New task content/title'),
      description: z.string().optional().describe('New task description'),
      labels: z.array(z.string()).optional().describe('New list of label names'),
      priority: z.number().min(1).max(4).optional().describe('New priority (1-4)'),
      dueString: z.string().optional().describe('New due date')
    },
    async (args) => {
      try {
        await todoistClient.updateTask(args.taskId, {
          content: args.content,
          description: args.description,
          labels: args.labels,
          priority: args.priority,
          dueString: args.dueString
        });

        // Get updated task
        const tasks = await todoistClient.getTasks();
        const updatedTask = tasks.find(t => t.id === args.taskId);

        return {
          content: [
            {
              type: 'text',
              text: updatedTask 
                ? JSON.stringify(updatedTask, null, 2)
                : `Task ${args.taskId} updated successfully`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error updating task: ${error}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    'complete_task',
    'Mark a task as completed',
    {
      taskId: z.string().describe('ID of the task to complete')
    },
    async (args) => {
      try {
        await todoistClient.completeTask(args.taskId);
        return {
          content: [
            {
              type: 'text',
              text: `Task ${args.taskId} marked as completed`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error completing task: ${error}`
            }
          ]
        };
      }
    }
  );

  server.tool(
    'uncomplete_task',
    'Mark a completed task as active again',
    {
      taskId: z.string().describe('ID of the task to uncomplete')
    },
    async (args) => {
      try {
        await todoistClient.uncompleteTask(args.taskId);
        return {
          content: [
            {
              type: 'text',
              text: `Task ${args.taskId} marked as active`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error uncompleting task: ${error}`
            }
          ]
        };
      }
    }
  );

  return server;
};