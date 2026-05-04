import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "github";
const GH_HDR = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

const githubPrRead: Tool<{ owner: string; repo: string; pr_number?: number }, unknown> = {
  name: "github_pr_read",
  description: "Read open PRs for a repo, or a specific PR if pr_number is given.",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      pr_number: { type: "number", description: "Optional specific PR number." },
    },
    required: ["owner", "repo"],
  },
  async execute({ owner, repo, pr_number }, ctx: ToolContext) {
    try {
      if (pr_number) {
        const pr = await nangoJSON<Record<string, unknown>>(P, ctx.userId, `/repos/${owner}/${repo}/pulls/${pr_number}`, { extraHeaders: GH_HDR });
        return { prs: [{ number: pr.number, title: pr.title, state: pr.state, body: pr.body, user: (pr.user as Record<string, unknown>)?.login, url: pr.html_url, draft: pr.draft }] };
      }
      const prs = await nangoJSON<unknown[]>(P, ctx.userId, `/repos/${owner}/${repo}/pulls?state=open&per_page=20`, { extraHeaders: GH_HDR });
      return {
        prs: (Array.isArray(prs) ? prs : []).map((pr: Record<string, unknown>) => ({
          number: pr.number, title: pr.title, state: pr.state, draft: pr.draft,
          user: (pr.user as Record<string, unknown>)?.login, url: pr.html_url, created_at: pr.created_at,
        })),
      };
    } catch { return notConnected("GitHub"); }
  },
};

const githubPrComment: Tool<{ owner: string; repo: string; pr_number: number; body: string }, unknown> = {
  name: "github_pr_comment",
  description: "Post a comment on a GitHub PR. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: { owner: { type: "string" }, repo: { type: "string" }, pr_number: { type: "number" }, body: { type: "string" } },
    required: ["owner", "repo", "pr_number", "body"],
  },
  async execute({ owner, repo, pr_number, body }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ id: number; html_url: string }>(P, ctx.userId, `/repos/${owner}/${repo}/issues/${pr_number}/comments`, {
        method: "POST", extraHeaders: GH_HDR, body: { body },
      });
      return { comment_id: data.id, url: data.html_url };
    } catch { return notConnected("GitHub"); }
  },
};

const githubIssueCreate: Tool<{ owner: string; repo: string; title: string; body?: string; labels?: string[] }, unknown> = {
  name: "github_issue_create",
  description: "Create a GitHub issue. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string" }, repo: { type: "string" },
      title: { type: "string" }, body: { type: "string" },
      labels: { type: "array", items: { type: "string" } },
    },
    required: ["owner", "repo", "title"],
  },
  async execute({ owner, repo, title, body, labels }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ number: number; html_url: string }>(P, ctx.userId, `/repos/${owner}/${repo}/issues`, {
        method: "POST", extraHeaders: GH_HDR, body: { title, body, labels },
      });
      return { issue_number: data.number, url: data.html_url };
    } catch { return notConnected("GitHub"); }
  },
};

export const githubTools: Tool[] = [
  githubPrRead as unknown as Tool,
  githubPrComment as unknown as Tool,
  githubIssueCreate as unknown as Tool,
];
