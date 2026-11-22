import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "../todoist-client.js";

export function registerProjectTools(server: McpServer, todoistClient: TodoistClient) {
  // Register list_projects tool
  server.tool(
    "list_projects",
    "List all Todoist projects",
    {},
    async () => {
      console.log("Executing list_projects tool");
      try {
        const projects = await todoistClient.getProjects();
        return {
          content: [
            {
              type: "text" as const,
              text: `📋 **Your Todoist Projects:**\n\n${projects.map(p => `• **${p.name}** (${p.id})`).join('\n')}\n\n*Found ${projects.length} projects*`,
            },
          ],
        };
      } catch (error) {
        console.error("Error fetching projects:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error fetching projects:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register create_project tool
  server.tool(
    "create_project",
    "Create a new project in Todoist",
    {
      name: z.string().describe("Project name (required)"),
      parentId: z.string().optional().describe("Parent project ID for sub-projects (optional)"),
      color: z.string().optional().describe("Project color (optional)"),
      isFavorite: z.boolean().optional().describe("Mark project as favorite (optional)"),
      viewStyle: z.enum(["list", "board"]).optional().describe("View style: 'list' or 'board' (optional)"),
    },
    async (args) => {
      console.log("Executing create_project tool", args);
      try {
        const project = await todoistClient.createProject({
          name: args.name,
          parentId: args.parentId,
          color: args.color,
          isFavorite: args.isFavorite,
          viewStyle: args.viewStyle,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ **Project Created Successfully!**\n\n📁 **Name:** ${project.name}\n🆔 **ID:** ${project.id}\n🎨 **Color:** ${project.color}${project.isFavorite ? "\n⭐ **Favorited**" : ""}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error creating project:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error creating project:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register update_project tool
  server.tool(
    "update_project",
    "Update an existing project",
    {
      projectId: z.string().describe("ID of the project to update"),
      name: z.string().optional().describe("New project name (optional)"),
      color: z.string().optional().describe("New project color (optional)"),
      isFavorite: z.boolean().optional().describe("Mark project as favorite (optional)"),
      viewStyle: z.enum(["list", "board"]).optional().describe("View style: 'list' or 'board' (optional)"),
    },
    async (args) => {
      console.log("Executing update_project tool", args);
      try {
        await todoistClient.updateProject(args.projectId, {
          name: args.name,
          color: args.color,
          isFavorite: args.isFavorite,
          viewStyle: args.viewStyle,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ **Project ${args.projectId} updated successfully!**`,
            },
          ],
        };
      } catch (error) {
        console.error("Error updating project:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error updating project:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register delete_project tool
  server.tool(
    "delete_project",
    "Delete a project",
    {
      projectId: z.string().describe("ID of the project to delete"),
    },
    async (args) => {
      console.log("Executing delete_project tool", args);
      try {
        await todoistClient.deleteProject(args.projectId);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ **Project ${args.projectId} deleted successfully!**`,
            },
          ],
        };
      } catch (error) {
        console.error("Error deleting project:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `❌ **Error deleting project:** ${error}`,
            },
          ],
        };
      }
    }
  );
}