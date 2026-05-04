import type { Tool, ToolContext } from "./types.ts";
import { nangoProxy, nangoJSON, notConnected } from "./_nango.ts";

const P = "google-drive";

const driveSearch: Tool<{ query: string; maxResults?: number }, unknown> = {
  name: "drive_search",
  description: "Search Google Drive files (Drive query syntax).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "e.g. \"name contains 'PRD'\" or \"mimeType='application/pdf'\"." },
      maxResults: { type: "number", description: "Max results (default 10)." },
    },
    required: ["query"],
  },
  async execute({ query, maxResults = 10 }, ctx: ToolContext) {
    try {
      const qs = new URLSearchParams({ q: query, pageSize: String(maxResults), fields: "files(id,name,mimeType,modifiedTime,webViewLink)" });
      const data = await nangoJSON<{ files?: unknown[] }>(P, ctx.userId, `/drive/v3/files?${qs}`);
      return { files: data.files ?? [] };
    } catch { return notConnected("Google Drive"); }
  },
};

const driveRead: Tool<{ file_id: string }, unknown> = {
  name: "drive_read",
  description: "Read a Drive file as plain text (exports Google Docs; truncates at 8 000 chars).",
  parameters: { type: "object", properties: { file_id: { type: "string" } }, required: ["file_id"] },
  async execute({ file_id }, ctx: ToolContext) {
    try {
      const meta = await nangoJSON<{ name: string; mimeType: string }>(P, ctx.userId, `/drive/v3/files/${file_id}?fields=name,mimeType`);
      let content: string;
      if (meta.mimeType === "application/vnd.google-apps.document") {
        const res = await nangoProxy(P, ctx.userId, `/drive/v3/files/${file_id}/export?mimeType=text/plain`);
        content = await res.text();
      } else if (meta.mimeType?.startsWith("text/")) {
        const res = await nangoProxy(P, ctx.userId, `/drive/v3/files/${file_id}?alt=media`);
        content = await res.text();
      } else {
        content = `[Binary file: ${meta.mimeType} — cannot read]`;
      }
      return { name: meta.name, mimeType: meta.mimeType, content: content.slice(0, 8000) };
    } catch { return notConnected("Google Drive"); }
  },
};

const driveCreate: Tool<{ name: string; content: string; parent_id?: string }, unknown> = {
  name: "drive_create",
  description: "Create a Google Doc in Drive. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      content: { type: "string", description: "Initial plain-text body." },
      parent_id: { type: "string", description: "Optional parent folder ID." },
    },
    required: ["name", "content"],
  },
  async execute({ name, content, parent_id }, ctx: ToolContext) {
    try {
      const boundary = "b_" + Math.random().toString(36).slice(2);
      const meta: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.document" };
      if (parent_id) meta.parents = [parent_id];
      const rawBody = [
        `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(meta),
        `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", content, `--${boundary}--`,
      ].join("\r\n");
      const data = await nangoJSON<{ id: string; webViewLink: string }>(
        P, ctx.userId,
        "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
        { method: "POST", rawBody, contentType: `multipart/related; boundary=${boundary}` },
      );
      return { file_id: data.id, url: data.webViewLink };
    } catch { return notConnected("Google Drive"); }
  },
};

export const driveTools: Tool[] = [
  driveSearch as unknown as Tool,
  driveRead as unknown as Tool,
  driveCreate as unknown as Tool,
];
