import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { TodoistClient } from "../todoist-client.js";

export function registerTaskTools(server: McpServer, todoistClient: TodoistClient) {

  // Register get_tasks tool  
  server.registerTool(
    "get_tasks",
    { description: "Get tasks from Todoist with optional filtering", inputSchema: {
      projectId: z.string().optional().describe("Filter by project ID (optional)"),
      filterQuery: z.string().optional().describe("Todoist filter query (optional)"),
      limit: z.number().min(1).max(100).optional().describe("Maximum number of tasks (default: 20, max: 100)"),
    } },
    async (args) => {
      console.log("Executing get_tasks tool", args);
      try {
        const limit = Math.min(args.limit || 20, 100);

        let tasks = await todoistClient.getTasks({ projectId: args.projectId, filter: args.filterQuery });
        const filter = args.filterQuery;

        // Apply limit
        tasks = tasks.slice(0, limit);

        if (tasks.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "📝 **No tasks found** matching your criteria.",
              },
            ],
          };
        }

        const tasksText = tasks.map(task => {
          const dueString = task.due?.string || '';
          return `• **${task.content}** (${task.id})\n  Priority: ${task.priority}${dueString ? `\n  Due: ${dueString}` : ''}${task.description ? `\n  Description: ${task.description}` : ''}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: "text" as const,
              text: `📝 **Your Tasks:**\n\n${tasksText}\n\n*Found ${tasks.length} tasks${filter ? ` with filter: ${filter}` : ''}*`,
            },
          ],
        };
      } catch (error) {
        console.error("Error fetching tasks:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error fetching tasks:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register create_task tool
  server.registerTool(
    "create_task",
    { description: "Create a new task in Todoist", inputSchema: {
      content: z.string().min(1).describe("Task content/title (required, non-empty)"),
      description: z.string().optional().describe("Task description (optional)"),
      projectId: z.string().optional().describe("Project ID (optional)"),
      sectionId: z.string().optional().describe("Section ID (optional)"),
      parentId: z.string().optional().describe("Parent task ID for subtasks (optional)"),
      order: z.number().optional().describe("Order/position (optional)"),
      labels: z.array(z.string()).optional().describe("Array of label names (optional)"),
      priority: z.number().min(1).max(4).optional().describe("Priority 1-4, where 4 is highest priority (optional)"),
      assigneeId: z.string().optional().describe("User ID to assign the task to (optional)"),
      dueString: z.string().optional().describe("Due date in natural language, e.g. 'tomorrow at 3pm' (optional)"),
      dueDate: z.string().optional().describe("Due date in YYYY-MM-DD format (optional)"),
      dueDatetime: z.string().optional().describe("Due datetime in RFC3339 format (optional)"),
      dueLang: z.string().optional().describe("Language for parsing due_string (optional)"),
      duration: z.number().optional().describe("Duration amount (optional)"),
      durationUnit: z.enum(["minute", "day"]).optional().describe("Duration unit: 'minute' or 'day' (optional)"),
    } },
    async (args) => {
      console.log("Executing create_task tool", args);
      try {
        const task = await todoistClient.createTask({
          content: args.content,
          description: args.description,
          projectId: args.projectId,
          sectionId: args.sectionId,
          parentId: args.parentId,
          order: args.order,
          labels: args.labels,
          priority: args.priority,
          assigneeId: args.assigneeId,
          dueString: args.dueString,
          dueDate: args.dueDate,
          dueDatetime: args.dueDatetime,
          dueLang: args.dueLang,
          duration: args.duration,
          durationUnit: args.durationUnit,
        });

        const dueString = task.due?.string || '';
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ **Task Created Successfully!**\n\n📋 **Task:** ${task.content}\n🆔 **ID:** ${task.id}\n📁 **Priority:** ${task.priority}${dueString ? `\n📅 **Due:** ${dueString}` : ''}${task.description ? `\n📝 **Description:** ${task.description}` : ''}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error creating task:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error creating task:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register update_task tool
  server.registerTool(
    "update_task",
    { description: "Update an existing task", inputSchema: {
      taskId: z.string().describe("ID of the task to update"),
      content: z.string().optional().describe("New task content/title (optional)"),
      description: z.string().optional().describe("New task description (optional)"),
      labels: z.array(z.string()).optional().describe("New list of label names (optional)"),
      priority: z.number().min(1).max(4).optional().describe("New priority (1-4, optional)"),
      dueString: z.string().optional().describe("New due date (optional)"),
    } },
    async (args) => {
      console.log("Executing update_task tool", args);
      try {
        await todoistClient.updateTask(args.taskId, {
          content: args.content,
          description: args.description,
          labels: args.labels,
          priority: args.priority,
          dueString: args.dueString,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ **Task ${args.taskId} updated successfully!**`,
            },
          ],
        };
      } catch (error) {
        console.error("Error updating task:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error updating task:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register complete_task tool
  server.registerTool(
    "complete_task",
    { description: "Mark a task as completed", inputSchema: {
      taskId: z.string().describe("ID of the task to complete"),
    } },
    async (args) => {
      console.log("Executing complete_task tool", args);
      try {
        await todoistClient.completeTask(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ **Task ${args.taskId} marked as completed!**`,
            },
          ],
        };
      } catch (error) {
        console.error("Error completing task:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error completing task:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register uncomplete_task tool
  server.registerTool(
    "uncomplete_task",
    { description: "Mark a completed task as active again", inputSchema: {
      taskId: z.string().describe("ID of the task to uncomplete"),
    } },
    async (args) => {
      console.log("Executing uncomplete_task tool", args);
      try {
        await todoistClient.uncompleteTask(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: `🔄 **Task ${args.taskId} marked as active again!**`,
            },
          ],
        };
      } catch (error) {
        console.error("Error uncompleting task:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error uncompleting task:** ${error}`,
            },
          ],
        };
      }
    }
  );
}