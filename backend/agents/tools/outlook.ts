import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "microsoft-mail";

const listOutlookEmails: Tool<{ maxResults?: number; filter?: string }, unknown> = {
  name: "list_outlook_emails",
  description: "List recent Microsoft Outlook emails. Supports OData filter syntax.",
  parameters: {
    type: "object",
    properties: {
      maxResults: { type: "number", description: "Max emails (default 10)." },
      filter: { type: "string", description: "OData filter, e.g. 'isRead eq false'." },
    },
  },
  async execute({ maxResults = 10, filter }, ctx: ToolContext) {
    try {
      const qs = new URLSearchParams({
        "$top": String(Math.min(maxResults, 25)),
        "$select": "subject,from,receivedDateTime,bodyPreview,isRead",
        "$orderby": "receivedDateTime desc",
      });
      if (filter) qs.set("$filter", filter);
      const data = await nangoJSON<{ value?: unknown[] }>(P, ctx.userId, `/me/messages?${qs}`);
      return { emails: data.value ?? [] };
    } catch { return notConnected("Microsoft Outlook"); }
  },
};

const draftOutlookEmail: Tool<{ to: string; subject: string; body: string }, unknown> = {
  name: "draft_outlook_email",
  description: "Create an Outlook draft (does NOT send).",
  parameters: {
    type: "object",
    properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
    required: ["to", "subject", "body"],
  },
  async execute({ to, subject, body }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ id: string }>(P, ctx.userId, "/me/messages", {
        method: "POST",
        body: {
          subject,
          body: { contentType: "Text", content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      });
      return { draft_id: data.id, preview: { to, subject, body } };
    } catch { return notConnected("Microsoft Outlook"); }
  },
};

const sendOutlookEmail: Tool<{ to: string; subject: string; body: string }, unknown> = {
  name: "send_outlook_email",
  description: "Send an email via Outlook. Use ONLY after explicit user confirmation.",
  parameters: {
    type: "object",
    properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
    required: ["to", "subject", "body"],
  },
  async execute({ to, subject, body }, ctx: ToolContext) {
    try {
      await nangoJSON(P, ctx.userId, "/me/sendMail", {
        method: "POST",
        body: {
          message: {
            subject,
            body: { contentType: "Text", content: body },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        },
      });
      return { ok: true, sent_to: to };
    } catch { return notConnected("Microsoft Outlook"); }
  },
};

export const outlookTools: Tool[] = [
  listOutlookEmails as unknown as Tool,
  draftOutlookEmail as unknown as Tool,
  sendOutlookEmail as unknown as Tool,
];
