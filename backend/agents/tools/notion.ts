import type { Tool } from "./types.ts";
import { getProviderToken, notConnectedResult } from "./_connections.ts";

const NOTION_VERSION = "2022-06-28";

async function notionFetch(path: string, token: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function richTextBlocks(text: string) {
  return text.split("\n").filter(Boolean).map((line) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: line } }] },
  }));
}

const notionSearch: Tool<{ query: string }, unknown> = {
  name: "notion_search",
  description: "Search pages and databases in the user's Notion workspace.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Search query." } },
    required: ["query"],
  },
  async execute({ query }, ctx) {
    const token = await getProviderToken(ctx, "notion");
    if (!token) return notConnectedResult("Notion");
    const data = await notionFetch("/search", token, "POST", { query, page_size: 10 });
    return {
      results: (data.results ?? []).map((r: { id: string; object: string; url: string; properties?: Record<string, { title?: { plain_text: string }[] }> }) => ({
        id: r.id,
        type: r.object,
        title: r.properties?.title?.title?.[0]?.plain_text ?? r.properties?.Name?.title?.[0]?.plain_text ?? "(Untitled)",
        url: r.url,
      })),
    };
  },
};

const notionRead: Tool<{ page_id: string }, unknown> = {
  name: "notion_read",
  description: "Read the content of a Notion page (title + flattened block text).",
  parameters: {
    type: "object",
    properties: { page_id: { type: "string", description: "Notion page ID." } },
    required: ["page_id"],
  },
  async execute({ page_id }, ctx) {
    const token = await getProviderToken(ctx, "notion");
    if (!token) return notConnectedResult("Notion");
    const [page, blocks] = await Promise.all([
      notionFetch(`/pages/${page_id}`, token),
      notionFetch(`/blocks/${page_id}/children?page_size=100`, token),
    ]);
    const title = page.properties?.title?.title?.[0]?.plain_text ?? "(Untitled)";
    const content = (blocks.results ?? [])
      .map((b: Record<string, { rich_text?: { plain_text: string }[] }> & { type: string }) => {
        const data = b[b.type] as { rich_text?: { plain_text: string }[] } | undefined;
        return data?.rich_text?.map((t) => t.plain_text).join("") ?? "";
      })
      .filter(Boolean)
      .join("\n");
    return { title, content };
  },
};

const notionCreate: Tool<{ parent_page_id: string; title: string; content: string }, unknown> = {
  name: "notion_create",
  description: "Create a new Notion page under a parent. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      parent_page_id: { type: "string", description: "Parent page ID." },
      title: { type: "string", description: "Page title." },
      content: { type: "string", description: "Plain-text body." },
    },
    required: ["parent_page_id", "title", "content"],
  },
  async execute({ parent_page_id, title, content }, ctx) {
    const token = await getProviderToken(ctx, "notion");
    if (!token) return notConnectedResult("Notion");
    const data = await notionFetch("/pages", token, "POST", {
      parent: { type: "page_id", page_id: parent_page_id },
      properties: { title: [{ type: "text", text: { content: title } }] },
      children: richTextBlocks(content),
    });
    return { page_id: data.id, url: data.url };
  },
};

const notionUpdate: Tool<{ page_id: string; content: string }, unknown> = {
  name: "notion_update",
  description: "Append plain-text content to an existing Notion page. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      page_id: { type: "string", description: "Page ID to append to." },
      content: { type: "string", description: "Content to append." },
    },
    required: ["page_id", "content"],
  },
  async execute({ page_id, content }, ctx) {
    const token = await getProviderToken(ctx, "notion");
    if (!token) return notConnectedResult("Notion");
    await notionFetch(`/blocks/${page_id}/children`, token, "PATCH", { children: richTextBlocks(content) });
    return { ok: true };
  },
};

export const notionTools: Tool[] = [
  notionSearch as unknown as Tool,
  notionRead as unknown as Tool,
  notionCreate as unknown as Tool,
  notionUpdate as unknown as Tool,
];
