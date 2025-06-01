import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "../todoist-client.js";

export function registerSectionTools(server: McpServer, todoistClient: TodoistClient) {
  // Register get_sections tool
  server.tool(
    "get_sections",
    "Get all sections in a project",
    {
      projectId: z.string().optional().describe("Project ID to get sections from (optional, gets all sections if not provided)"),
    },
    async (args) => {
      console.log("Executing get_sections tool", args);
      try {
        const sections = await todoistClient.getSections(args.projectId);
        
        if (sections.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "📋 **No sections found**" + (args.projectId ? ` in project ${args.projectId}` : ""),
              },
            ],
          };
        }

        const sectionsText = sections.map(s => 
          `• **${s.name}** (${s.id}) - Project: ${s.projectId}`
        ).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `📋 **Sections:**\n\n${sectionsText}\n\n*Found ${sections.length} sections*`,
            },
          ],
        };
      } catch (error) {
        console.error("Error fetching sections:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error fetching sections:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register create_section tool
  server.tool(
    "create_section",
    "Create a new section in a project",
    {
      name: z.string().describe("Section name (required)"),
      projectId: z.string().describe("Project ID where the section will be created (required)"),
      order: z.number().optional().describe("Section order/position (optional)"),
    },
    async (args) => {
      console.log("Executing create_section tool", args);
      try {
        const section = await todoistClient.createSection({
          name: args.name,
          projectId: args.projectId,
          order: args.order,
        });
        return {
          content: [
            {
              type: "text",
              text: `✅ **Section Created Successfully!**\n\n📂 **Name:** ${section.name}\n🆔 **ID:** ${section.id}\n📁 **Project:** ${section.projectId}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error creating section:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error creating section:** ${error}`,
            },
          ],
        };
      }
    }
  );
}