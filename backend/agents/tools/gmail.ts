import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "gmail";

function encodeEmail(to: string, subject: string, body: string): string {
  const raw = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n");
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const listEmails: Tool<{ maxResults?: number; q?: string }, unknown> = {
  name: "list_emails",
  description: "List recent Gmail messages. Supports Gmail search syntax in q.",
  parameters: {
    type: "object",
    properties: {
      maxResults: { type: "number", description: "Max emails (default 10)." },
      q: { type: "string", description: "Gmail search query, e.g. 'is:unread newer_than:1d'." },
    },
  },
  async execute({ maxResults = 10, q }, ctx: ToolContext) {
    try {
      const qs = new URLSearchParams({ maxResults: String(Math.min(maxResults, 25)) });
      if (q) qs.set("q", q);
      const list = await nangoJSON<{ messages?: { id: string }[] }>(P, ctx.userId, `/gmail/v1/users/me/messages?${qs}`);
      if (!list.messages?.length) return { emails: [] };
      const emails = await Promise.all(
        list.messages.slice(0, Math.min(maxResults, 10)).map(async (m) => {
          const msg = await nangoJSON<{ payload?: { headers?: { name: string; value: string }[] }; snippet?: string }>(
            P, ctx.userId,
            `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          );
          const hdrs = Object.fromEntries((msg.payload?.headers ?? []).map((h) => [h.name, h.value]));
          return { id: m.id, subject: hdrs.Subject, from: hdrs.From, date: hdrs.Date, snippet: msg.snippet };
        }),
      );
      return { emails };
    } catch { return notConnected("Gmail"); }
  },
};

const draftEmail: Tool<{ to: string; subject: string; body: string }, unknown> = {
  name: "draft_email",
  description: "Create a Gmail draft (does NOT send).",
  parameters: {
    type: "object",
    properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
    required: ["to", "subject", "body"],
  },
  async execute({ to, subject, body }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ id: string }>(P, ctx.userId, "/gmail/v1/users/me/drafts", {
        method: "POST",
        body: { message: { raw: encodeEmail(to, subject, body) } },
      });
      return { draft_id: data.id, preview: { to, subject, body } };
    } catch { return notConnected("Gmail"); }
  },
};

const sendEmail: Tool<{ to: string; subject: string; body: string }, unknown> = {
  name: "send_email",
  description: "Send an email via Gmail. Use ONLY after explicit user confirmation.",
  parameters: {
    type: "object",
    properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
    required: ["to", "subject", "body"],
  },
  async execute({ to, subject, body }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ id: string }>(P, ctx.userId, "/gmail/v1/users/me/messages/send", {
        method: "POST",
        body: { raw: encodeEmail(to, subject, body) },
      });
      return { message_id: data.id, sent_to: to };
    } catch { return notConnected("Gmail"); }
  },
};

export const gmailTools: Tool[] = [
  listEmails as unknown as Tool,
  draftEmail as unknown as Tool,
  sendEmail as unknown as Tool,
];
