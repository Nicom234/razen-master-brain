import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "notion";
const NOTION_HDR = { "Notion-Version": "2022-06-28" };

function blocks(text: string) {
  return text.split("\n").filter(Boolean).map((line) => ({
    object: "block", type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: line } }] },
  }));
}

const notionSearch: Tool<{ query: string }, unknown> = {
  name: "notion_search",
  description: "Search pages and databases in the Notion workspace.",
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  async execute({ query }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ results?: unknown[] }>(P, ctx.userId, "/search", {
        method: "POST", body: { query, page_size: 10 }, extraHeaders: NOTION_HDR,
      });
      return {
        results: (data.results ?? []).map((r: Record<string, unknown>) => ({
          id: r.id,
          type: r.object,
          title: (r.properties as Record<string, { title?: { plain_text: string }[] }>)?.title?.title?.[0]?.plain_text ?? "(Untitled)",
          url: r.url,
        })),
      };
    } catch { return notConnected("Notion"); }
  },
};

const notionRead: Tool<{ page_id: string }, unknown> = {
  name: "notion_read",
  description: "Read title and content of a Notion page.",
  parameters: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] },
  async execute({ page_id }, ctx: ToolContext) {
    try {
      const [page, blk] = await Promise.all([
        nangoJSON<Record<string, unknown>>(P, ctx.userId, `/pages/${page_id}`, { extraHeaders: NOTION_HDR }),
        nangoJSON<{ results?: unknown[] }>(P, ctx.userId, `/blocks/${page_id}/children?page_size=100`, { extraHeaders: NOTION_HDR }),
      ]);
      const title = (page.properties as Record<string, { title?: { plain_text: string }[] }>)?.title?.title?.[0]?.plain_text ?? "(Untitled)";
      const content = (blk.results ?? []).map((b: Record<string, unknown>) => {
        const type = b.type as string;
        const blockData = b[type] as { rich_text?: { plain_text: string }[] } | undefined;
        return blockData?.rich_text?.map((t) => t.plain_text).join("") ?? "";
      }).filter(Boolean).join("\n");
      return { title, content };
    } catch { return notConnected("Notion"); }
  },
};

const notionCreate: Tool<{ parent_page_id: string; title: string; content: string }, unknown> = {
  name: "notion_create",
  description: "Create a new Notion page. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      parent_page_id: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
    },
    required: ["parent_page_id", "title", "content"],
  },
  async execute({ parent_page_id, title, content }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ id: string; url: string }>(P, ctx.userId, "/pages", {
        method: "POST",
        extraHeaders: NOTION_HDR,
        body: {
          parent: { type: "page_id", page_id: parent_page_id },
          properties: { title: [{ type: "text", text: { content: title } }] },
          children: blocks(content),
        },
      });
      return { page_id: data.id, url: data.url };
    } catch { return notConnected("Notion"); }
  },
};

const notionUpdate: Tool<{ page_id: string; content: string }, unknown> = {
  name: "notion_update",
  description: "Append content to a Notion page. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: { page_id: { type: "string" }, content: { type: "string" } },
    required: ["page_id", "content"],
  },
  async execute({ page_id, content }, ctx: ToolContext) {
    try {
      await nangoJSON(P, ctx.userId, `/blocks/${page_id}/children`, {
        method: "PATCH", extraHeaders: NOTION_HDR, body: { children: blocks(content) },
      });
      return { ok: true };
    } catch { return notConnected("Notion"); }
  },
};

export const notionTools: Tool[] = [
  notionSearch as unknown as Tool,
  notionRead as unknown as Tool,
  notionCreate as unknown as Tool,
  notionUpdate as unknown as Tool,
];
