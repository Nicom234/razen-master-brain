import type { Tool } from "./types.ts";
import { getProviderToken, notConnectedResult } from "./_connections.ts";

const driveSearch: Tool<{ query: string; maxResults?: number }, unknown> = {
  name: "drive_search",
  description: "Search files in the user's Google Drive (Drive query syntax).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Drive query, e.g. \"name contains 'PRD'\"." },
      maxResults: { type: "number", description: "Max files (default 10)." },
    },
    required: ["query"],
  },
  async execute({ query, maxResults = 10 }, ctx) {
    const token = await getProviderToken(ctx, "drive");
    if (!token) return notConnectedResult("Google Drive");
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("pageSize", String(maxResults));
    url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)");
    const data = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
    return { files: data.files ?? [] };
  },
};

const driveRead: Tool<{ file_id: string }, unknown> = {
  name: "drive_read",
  description: "Read a Google Drive file (exports Google Docs as plain text; truncates to 8 000 chars).",
  parameters: {
    type: "object",
    properties: { file_id: { type: "string", description: "Google Drive file ID." } },
    required: ["file_id"],
  },
  async execute({ file_id }, ctx) {
    const token = await getProviderToken(ctx, "drive");
    if (!token) return notConnectedResult("Google Drive");
    const meta = await (await fetch(
      `https://www.googleapis.com/drive/v3/files/${file_id}?fields=name,mimeType`,
      { headers: { Authorization: `Bearer ${token}` } },
    )).json();
    let content: string;
    if (meta.mimeType === "application/vnd.google-apps.document") {
      content = await (await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}/export?mimeType=text/plain`,
        { headers: { Authorization: `Bearer ${token}` } },
      )).text();
    } else if (meta.mimeType?.startsWith("text/")) {
      content = await (await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
      )).text();
    } else {
      content = `[Binary file: ${meta.mimeType} — cannot read as text]`;
    }
    return { name: meta.name, mimeType: meta.mimeType, content: content.slice(0, 8000) };
  },
};

const driveCreate: Tool<{ name: string; content: string; parent_id?: string }, unknown> = {
  name: "drive_create",
  description: "Create a new Google Doc with the given content. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Document name." },
      content: { type: "string", description: "Initial document body (plain text)." },
      parent_id: { type: "string", description: "Optional parent folder ID." },
    },
    required: ["name", "content"],
  },
  async execute({ name, content, parent_id }, ctx) {
    const token = await getProviderToken(ctx, "drive");
    if (!token) return notConnectedResult("Google Drive");
    const boundary = "boundary_" + Math.random().toString(36).slice(2);
    const metadata: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.document" };
    if (parent_id) metadata.parents = [parent_id];
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      content,
      `--${boundary}--`,
    ].join("\r\n");
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    const data = await res.json();
    return { file_id: data.id, url: data.webViewLink };
  },
};

export const driveTools: Tool[] = [
  driveSearch as unknown as Tool,
  driveRead as unknown as Tool,
  driveCreate as unknown as Tool,
];
