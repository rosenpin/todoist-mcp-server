import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "../todoist-client.js";

export function registerSetupTool(
  server: McpServer, 
  saveToken: (token: string) => Promise<void>,
  origin: string
) {
  server.tool(
    "setup_todoist",
    "Configure your Todoist API token to enable task management",
    {
      token: z.string().describe("Your Todoist API token (get it from https://todoist.com/prefs/integrations)"),
    },
    async (args) => {
      try {
        await new TodoistClient(args.token).getProjects(); // throws if the token is invalid
        await saveToken(args.token);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Todoist API token configured successfully!**\n\n💡 **For better user management**, consider using the web setup at: ${origin}\n\n🔄 **Reconnect this MCP server in your client** (or restart it) to enable all Todoist tools.\n\n📋 Available tools after refresh:\n• list_projects, create_project, update_project, delete_project\n• get_tasks, create_task, update_task, complete_task, uncomplete_task\n• get_sections, create_section\n• get_labels, create_label\n• get_comments, create_comment`,
            },
          ],
        };
      } catch (error) {
        console.error("Error setting up Todoist token:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          isError: true,
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