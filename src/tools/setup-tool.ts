import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "../todoist-client.js";

export function registerSetupTool(
  server: McpServer, 
  setUserToken: (userId: string, token: string) => Promise<void>,
  requestUrl: string
) {
  server.tool(
    "setup_todoist",
    "Configure your Todoist API token to enable task management",
    {
      token: z.string().describe("Your Todoist API token (get it from https://todoist.com/prefs/integrations)"),
    },
    async (args) => {
      console.log("Executing setup_todoist tool");
      console.log("Token received (first 10 chars):", args.token?.substring(0, 10));
      console.log("Token length:", args.token?.length);

      try {
        const url = new URL(requestUrl);
        const userId = url.searchParams.get("user_id") || url.searchParams.get("sessionId") || "default";

        // Validate token by making a test API call
        const testClient = new TodoistClient(args.token);
        console.log("Testing API call with token...");
        await testClient.getProjects(); // This will throw if token is invalid
        console.log("API call successful!");

        // Store the token
        await setUserToken(userId, args.token);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Todoist API token configured successfully!**\n\n💡 **For better user management**, consider using the web setup at: ${new URL(requestUrl).origin}\n\n🔄 **Please refresh Claude integrations** (remove and re-add this server) to enable all Todoist tools.\n\n📋 Available tools after refresh:\n• list_projects, create_project, update_project, delete_project\n• get_tasks, create_task, update_task, complete_task, uncomplete_task\n• get_sections, create_section\n• get_labels, create_label\n• get_comments, create_comment`,
            },
          ],
        };
      } catch (error) {
        console.error("Error setting up Todoist token:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("Storage not available")) {
          return {
            content: [
              {
                type: "text",
                text: `❌ **Storage Error:** Database storage is not available.\n\n🔧 **This is a server configuration issue.** Please contact the server administrator.\n\n💡 The server needs proper SQL storage configuration to store user tokens securely.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `❌ **Error configuring Todoist token:** ${errorMessage}\n\n💡 **Please check:**\n• Token is valid and copied correctly\n• You have access to https://todoist.com/prefs/integrations\n• Token has proper permissions`,
            },
          ],
        };
      }
    }
  );
}