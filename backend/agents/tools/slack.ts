import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "slack";

async function resolveChannel(name: string, userId: string): Promise<string | null> {
  if (/^[CDG]/.test(name)) return name;
  const data = await nangoJSON<{ channels?: { id: string; name: string }[] }>(P, userId, "/conversations.list?limit=500&types=public_channel,private_channel");
  const clean = name.replace(/^#/, "");
  return data.channels?.find((c) => c.name === clean)?.id ?? null;
}

const slackSummarise: Tool<{ channel: string; since_hours?: number }, unknown> = {
  name: "slack_summarise",
  description: "Fetch recent Slack channel messages for summarisation.",
  parameters: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Channel name (without #) or ID." },
      since_hours: { type: "number", description: "Hours back to fetch (default 24)." },
    },
    required: ["channel"],
  },
  async execute({ channel, since_hours = 24 }, ctx: ToolContext) {
    try {
      const id = await resolveChannel(channel, ctx.userId);
      if (!id) return { error: `Channel '${channel}' not found` };
      const oldest = String(Date.now() / 1000 - since_hours * 3600);
      const data = await nangoJSON<{ messages?: unknown[] }>(P, ctx.userId, `/conversations.history?channel=${id}&oldest=${oldest}&limit=50`);
      return { channel, messages: data.messages ?? [] };
    } catch { return notConnected("Slack"); }
  },
};

const slackDraft: Tool<{ channel: string; text: string }, unknown> = {
  name: "slack_draft",
  description: "Preview a Slack message (does NOT send). Show to user before calling slack_send.",
  parameters: {
    type: "object",
    properties: { channel: { type: "string" }, text: { type: "string" } },
    required: ["channel", "text"],
  },
  async execute({ channel, text }) {
    return { preview: { channel, text }, instruction: "Confirm with user before calling slack_send." };
  },
};

const slackSend: Tool<{ channel: string; text: string }, unknown> = {
  name: "slack_send",
  description: "Send a Slack message. Use ONLY after explicit user confirmation.",
  parameters: {
    type: "object",
    properties: { channel: { type: "string" }, text: { type: "string" } },
    required: ["channel", "text"],
  },
  async execute({ channel, text }, ctx: ToolContext) {
    try {
      const id = await resolveChannel(channel, ctx.userId) ?? channel;
      const data = await nangoJSON<{ ok: boolean; ts: string; error?: string }>(P, ctx.userId, "/chat.postMessage", {
        method: "POST",
        body: { channel: id, text },
      });
      if (!data.ok) return { error: `Slack: ${data.error}` };
      return { ts: data.ts, channel: id };
    } catch { return notConnected("Slack"); }
  },
};

export const slackTools: Tool[] = [
  slackSummarise as unknown as Tool,
  slackDraft as unknown as Tool,
  slackSend as unknown as Tool,
];
