import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { TodoistClient } from "../todoist-client.js";

export function registerCommentTools(server: McpServer, todoistClient: TodoistClient) {
  // Register get_comments tool
  server.registerTool(
    "get_comments",
    { description: "Get comments for a task or project", inputSchema: {
      taskId: z.string().optional().describe("Task ID to get comments from (provide either taskId or projectId)"),
      projectId: z.string().optional().describe("Project ID to get comments from (provide either taskId or projectId)"),
    } },
    async (args) => {
      console.log("Executing get_comments tool", args);
      
      if (!args.taskId && !args.projectId) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "❌ **Error:** Please provide either taskId or projectId",
            },
          ],
        };
      }
      
      try {
        const comments = await todoistClient.getComments({
          taskId: args.taskId,
          projectId: args.projectId,
        });
        
        if (comments.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `💬 **No comments found** for ${args.taskId ? `task ${args.taskId}` : `project ${args.projectId}`}`,
              },
            ],
          };
        }

        const commentsText = comments.map(c => 
          `• **${c.content}** (${c.id})\n  Posted: ${c.postedAt}`
        ).join('\n\n');

        return {
          content: [
            {
              type: "text" as const,
              text: `💬 **Comments:**\n\n${commentsText}\n\n*Found ${comments.length} comments*`,
            },
          ],
        };
      } catch (error) {
        console.error("Error fetching comments:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error fetching comments:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register create_comment tool
  server.registerTool(
    "create_comment",
    { description: "Add a comment to a task or project", inputSchema: {
      content: z.string().describe("Comment content (required)"),
      taskId: z.string().optional().describe("Task ID to comment on (provide either taskId or projectId)"),
      projectId: z.string().optional().describe("Project ID to comment on (provide either taskId or projectId)"),
    } },
    async (args) => {
      console.log("Executing create_comment tool", args);
      
      if (!args.taskId && !args.projectId) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "❌ **Error:** Please provide either taskId or projectId",
            },
          ],
        };
      }
      
      try {
        const comment = await todoistClient.createComment({
          content: args.content,
          taskId: args.taskId,
          projectId: args.projectId,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ **Comment Added Successfully!**\n\n💬 **Content:** ${comment.content}\n🆔 **ID:** ${comment.id}\n📍 **Target:** ${args.taskId ? `Task ${args.taskId}` : `Project ${args.projectId}`}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error creating comment:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error creating comment:** ${error}`,
            },
          ],
        };
      }
    }
  );
}