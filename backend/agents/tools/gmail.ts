import type { Tool } from "./types.ts";
import { getProviderToken, notConnectedResult } from "./_connections.ts";

function encodeRaw(to: string, subject: string, body: string): string {
  const raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const listEmails: Tool<{ maxResults?: number; q?: string }, unknown> = {
  name: "list_emails",
  description: "List recent emails from Gmail. Optionally filter with Gmail search syntax (q).",
  parameters: {
    type: "object",
    properties: {
      maxResults: { type: "number", description: "Max emails to return (default 10)." },
      q: { type: "string", description: "Gmail search query, e.g. 'is:unread newer_than:1d'." },
    },
  },
  async execute({ maxResults = 10, q }, ctx) {
    const token = await getProviderToken(ctx, "gmail");
    if (!token) return notConnectedResult("Gmail");
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("maxResults", String(Math.min(maxResults, 25)));
    if (q) url.searchParams.set("q", q);
    const list = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (!list.messages?.length) return { emails: [] };
    const emails = await Promise.all(
      list.messages.slice(0, Math.min(maxResults, 10)).map(async (m: { id: string }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const msg = await r.json();
        const headers: Record<string, string> = Object.fromEntries(
          (msg.payload?.headers ?? []).map((h: { name: string; value: string }) => [h.name, h.value]),
        );
        return { id: m.id, subject: headers.Subject, from: headers.From, date: headers.Date, snippet: msg.snippet };
      }),
    );
    return { emails };
  },
};

const draftEmail: Tool<{ to: string; subject: string; body: string }, unknown> = {
  name: "draft_email",
  description: "Create a Gmail draft (does NOT send). Returns the draft id and a preview.",
  parameters: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email." },
      subject: { type: "string", description: "Subject line." },
      body: { type: "string", description: "Plain-text body." },
    },
    required: ["to", "subject", "body"],
  },
  async execute({ to, subject, body }, ctx) {
    const token = await getProviderToken(ctx, "gmail");
    if (!token) return notConnectedResult("Gmail");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw: encodeRaw(to, subject, body) } }),
    });
    const data = await res.json();
    return { draft_id: data.id, preview: { to, subject, body } };
  },
};

const sendEmail: Tool<{ to: string; subject: string; body: string }, unknown> = {
  name: "send_email",
  description: "Send an email via Gmail. Use ONLY after the user has explicitly confirmed the draft.",
  parameters: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email." },
      subject: { type: "string", description: "Subject line." },
      body: { type: "string", description: "Plain-text body." },
    },
    required: ["to", "subject", "body"],
  },
  async execute({ to, subject, body }, ctx) {
    const token = await getProviderToken(ctx, "gmail");
    if (!token) return notConnectedResult("Gmail");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encodeRaw(to, subject, body) }),
    });
    const data = await res.json();
    return { message_id: data.id, sent_to: to };
  },
};

export const gmailTools: Tool[] = [
  listEmails as unknown as Tool,
  draftEmail as unknown as Tool,
  sendEmail as unknown as Tool,
];
