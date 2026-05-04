import type { Tool } from "./types.ts";
import { gmailTools } from "./gmail.ts";
import { calendarTools } from "./calendar.ts";
import { slackTools } from "./slack.ts";
import { notionTools } from "./notion.ts";
import { githubTools } from "./github.ts";
import { linearTools } from "./linear.ts";
import { driveTools } from "./drive.ts";
import { outlookTools } from "./outlook.ts";
import { teamsTools } from "./teams.ts";
import { jiraTools } from "./jira.ts";
import { asanaTools } from "./asana.ts";
import { hubspotTools } from "./hubspot.ts";
import { zoomTools } from "./zoom.ts";

const calculate: Tool<{ expression: string }, { result: number | string; expression: string }> = {
  name: "calculate",
  description: "Evaluate a basic arithmetic expression. Supports + - * / % ( ) and decimals.",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Arithmetic expression, e.g. '(1200 * 0.18) / 12'." },
    },
    required: ["expression"],
  },
  async execute({ expression }) {
    if (typeof expression !== "string") throw new Error("expression must be a string");
    if (!/^[\d+\-*/%().,\s]+$/.test(expression))
      return { result: "refused: only digits, decimals, and + - * / % ( ) are allowed", expression };
    const result = Function(`"use strict"; return (${expression});`)() as number;
    return { result, expression };
  },
};

const recallMemory: Tool<{ query?: string; limit?: number }, { memories: string[] }> = {
  name: "recall_memory",
  description: "Look up stored memories about the current user. Optionally filter by a fuzzy query.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Optional substring filter (case-insensitive)." },
      limit: { type: "string", description: "Cap on number of memories (default 10, max 50)." },
    },
  },
  async execute({ query, limit }, ctx) {
    const supabase = ctx.supabase as
      | { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: { content: string }[] | null }> } } } } }
      | undefined;
    if (!supabase) return { memories: [] };
    const cap = Math.min(Math.max(Number(limit ?? 10), 1), 50);
    const { data } = await supabase
      .from("memories")
      .select("content")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(cap);
    let memories = (data ?? []).map((m) => m.content);
    if (query && typeof query === "string") {
      const q = query.toLowerCase();
      memories = memories.filter((m) => m.toLowerCase().includes(q));
    }
    return { memories };
  },
};

export const defaultTools: Tool[] = [
  calculate as unknown as Tool,
  recallMemory as unknown as Tool,
  ...gmailTools,
  ...calendarTools,
  ...slackTools,
  ...notionTools,
  ...githubTools,
  ...linearTools,
  ...driveTools,
  ...outlookTools,
  ...teamsTools,
  ...jiraTools,
  ...asanaTools,
  ...hubspotTools,
  ...zoomTools,
];
