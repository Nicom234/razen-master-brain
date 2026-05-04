import type { Tool } from "./types.ts";
import { getProviderToken, notConnectedResult } from "./_connections.ts";

async function slackGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://slack.com/api/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
}

async function resolveChannelId(channel: string, token: string): Promise<string | null> {
  if (channel.startsWith("C") || channel.startsWith("D") || channel.startsWith("G")) return channel;
  const list = await slackGet("conversations.list", token, { limit: "500", types: "public_channel,private_channel" });
  const name = channel.replace(/^#/, "");
  const found = list.channels?.find((c: { name: string }) => c.name === name);
  return found?.id ?? null;
}

const slackSummarise: Tool<{ channel: string; since_hours?: number }, unknown> = {
  name: "slack_summarise",
  description: "Fetch recent messages from a Slack channel for summarisation.",
  parameters: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Channel name (without #) or channel ID." },
      since_hours: { type: "number", description: "How many hours back (default 24)." },
    },
    required: ["channel"],
  },
  async execute({ channel, since_hours = 24 }, ctx) {
    const token = await getProviderToken(ctx, "slack");
    if (!token) return notConnectedResult("Slack");
    const channelId = await resolveChannelId(channel, token);
    if (!channelId) return { error: `Channel ${channel} not found` };
    const oldest = String((Date.now() / 1000) - since_hours * 3600);
    const history = await slackGet("conversations.history", token, { channel: channelId, oldest, limit: "50" });
    return {
      channel,
      messages: (history.messages ?? []).map((m: { user: string; text: string; ts: string; thread_ts?: string }) => ({
        user: m.user, text: m.text, ts: m.ts, thread_ts: m.thread_ts,
      })),
    };
  },
};

const slackDraft: Tool<{ channel: string; text: string }, unknown> = {
  name: "slack_draft",
  description: "Preview a Slack message draft (does NOT send).",
  parameters: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Target channel name or ID." },
      text: { type: "string", description: "Message text." },
    },
    required: ["channel", "text"],
  },
  async execute({ channel, text }) {
    return { preview: { channel, text }, instruction: "Show this draft to the user and ask for confirmation before calling slack_send." };
  },
};

const slackSend: Tool<{ channel: string; text: string }, unknown> = {
  name: "slack_send",
  description: "Send a Slack message. Use ONLY after explicit user confirmation.",
  parameters: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Channel name (without #) or channel ID." },
      text: { type: "string", description: "Message text." },
    },
    required: ["channel", "text"],
  },
  async execute({ channel, text }, ctx) {
    const token = await getProviderToken(ctx, "slack");
    if (!token) return notConnectedResult("Slack");
    const channelId = await resolveChannelId(channel, token);
    if (!channelId) return { error: `Channel ${channel} not found` };
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channelId, text }),
    });
    const data = await res.json();
    if (!data.ok) return { error: `Slack error: ${data.error}` };
    return { ts: data.ts, channel: data.channel };
  },
};

export const slackTools: Tool[] = [
  slackSummarise as unknown as Tool,
  slackDraft as unknown as Tool,
  slackSend as unknown as Tool,
];
