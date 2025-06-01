import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "../todoist-client.js";

export function registerCommentTools(server: McpServer, todoistClient: TodoistClient, subscriptionCheck?: any) {
  
  // Helper function to return subscription error
  const checkSubscription = () => {
    if (subscriptionCheck && !subscriptionCheck.isActive) {
      return {
        content: [{
          type: "text",
          text: subscriptionCheck.message || "🔒 **Subscription Required**\n\nPlease visit our website to subscribe."
        }]
      };
    }
    return null;
  };
  // Register get_comments tool
  server.tool(
    "get_comments",
    "Get comments for a task or project",
    {
      taskId: z.string().optional().describe("Task ID to get comments from (provide either taskId or projectId)"),
      projectId: z.string().optional().describe("Project ID to get comments from (provide either taskId or projectId)"),
    },
    async (args) => {
      // Check subscription first
      const subscriptionError = checkSubscription();
      if (subscriptionError) return subscriptionError;
      
      console.log("Executing get_comments tool", args);
      
      if (!args.taskId && !args.projectId) {
        return {
          content: [
            {
              type: "text",
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
                type: "text",
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
              type: "text",
              text: `💬 **Comments:**\n\n${commentsText}\n\n*Found ${comments.length} comments*`,
            },
          ],
        };
      } catch (error) {
        console.error("Error fetching comments:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error fetching comments:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register create_comment tool
  server.tool(
    "create_comment",
    "Add a comment to a task or project",
    {
      content: z.string().describe("Comment content (required)"),
      taskId: z.string().optional().describe("Task ID to comment on (provide either taskId or projectId)"),
      projectId: z.string().optional().describe("Project ID to comment on (provide either taskId or projectId)"),
    },
    async (args) => {
      // Check subscription first
      const subscriptionError = checkSubscription();
      if (subscriptionError) return subscriptionError;
      
      console.log("Executing create_comment tool", args);
      
      if (!args.taskId && !args.projectId) {
        return {
          content: [
            {
              type: "text",
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
              type: "text",
              text: `✅ **Comment Added Successfully!**\n\n💬 **Content:** ${comment.content}\n🆔 **ID:** ${comment.id}\n📍 **Target:** ${args.taskId ? `Task ${args.taskId}` : `Project ${args.projectId}`}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error creating comment:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error creating comment:** ${error}`,
            },
          ],
        };
      }
    }
  );
}