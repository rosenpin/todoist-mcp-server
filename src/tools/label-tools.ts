import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TodoistClient } from "../todoist-client.js";

export function registerLabelTools(server: McpServer, todoistClient: TodoistClient) {
  // Register get_labels tool
  server.tool(
    "get_labels",
    "Get all labels",
    {},
    async () => {
      console.log("Executing get_labels tool");
      try {
        const labels = await todoistClient.getLabels();
        
        if (labels.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "🏷️ **No labels found**",
              },
            ],
          };
        }

        const labelsText = labels.map(l => 
          `• **${l.name}** (${l.id}) - Color: ${l.color}${l.isFavorite ? " ⭐" : ""}`
        ).join('\n');

        return {
          content: [
            {
              type: "text",
              text: `🏷️ **Your Labels:**\n\n${labelsText}\n\n*Found ${labels.length} labels*`,
            },
          ],
        };
      } catch (error) {
        console.error("Error fetching labels:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error fetching labels:** ${error}`,
            },
          ],
        };
      }
    }
  );

  // Register create_label tool
  server.tool(
    "create_label",
    "Create a new label",
    {
      name: z.string().describe("Label name (required)"),
      color: z.string().optional().describe("Label color (optional)"),
      order: z.number().optional().describe("Label order/position (optional)"),
      isFavorite: z.boolean().optional().describe("Mark label as favorite (optional)"),
    },
    async (args) => {
      console.log("Executing create_label tool", args);
      try {
        const label = await todoistClient.createLabel({
          name: args.name,
          color: args.color,
          order: args.order,
          isFavorite: args.isFavorite,
        });
        return {
          content: [
            {
              type: "text",
              text: `✅ **Label Created Successfully!**\n\n🏷️ **Name:** ${label.name}\n🆔 **ID:** ${label.id}\n🎨 **Color:** ${label.color}${label.isFavorite ? "\n⭐ **Favorited**" : ""}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error creating label:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error creating label:** ${error}`,
            },
          ],
        };
      }
    }
  );
}