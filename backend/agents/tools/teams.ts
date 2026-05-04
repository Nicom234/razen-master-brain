import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "microsoft-teams";

const teamsSummarise: Tool<{ chat_id?: string; since_hours?: number }, unknown> = {
  name: "teams_summarise",
  description: "Fetch recent Microsoft Teams chat messages for summarisation.",
  parameters: {
    type: "object",
    properties: {
      chat_id: { type: "string", description: "Teams chat ID. Omit to use most recent chat." },
      since_hours: { type: "number", description: "Hours back to fetch (default 24)." },
    },
  },
  async execute({ chat_id, since_hours = 24 }, ctx: ToolContext) {
    try {
      let id = chat_id;
      if (!id) {
        const chats = await nangoJSON<{ value?: { id: string }[] }>(P, ctx.userId, "/me/chats?$top=5&$orderby=lastMessagePreview/createdDateTime desc");
        id = chats.value?.[0]?.id;
        if (!id) return { messages: [], note: "No chats found" };
      }
      const since = new Date(Date.now() - since_hours * 3600000).toISOString();
      const data = await nangoJSON<{ value?: unknown[] }>(P, ctx.userId, `/me/chats/${id}/messages?$top=50&$filter=createdDateTime ge ${since}`);
      return { chat_id: id, messages: data.value ?? [] };
    } catch { return notConnected("Microsoft Teams"); }
  },
};

const teamsSend: Tool<{ chat_id: string; text: string }, unknown> = {
  name: "teams_send",
  description: "Send a Teams chat message. Use ONLY after explicit user confirmation.",
  parameters: {
    type: "object",
    properties: {
      chat_id: { type: "string", description: "Teams chat ID." },
      text: { type: "string", description: "Message text (HTML supported)." },
    },
    required: ["chat_id", "text"],
  },
  async execute({ chat_id, text }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ id: string }>(P, ctx.userId, `/me/chats/${chat_id}/messages`, {
        method: "POST",
        body: { body: { contentType: "text", content: text } },
      });
      return { message_id: data.id };
    } catch { return notConnected("Microsoft Teams"); }
  },
};

export const teamsTools: Tool[] = [
  teamsSummarise as unknown as Tool,
  teamsSend as unknown as Tool,
];
