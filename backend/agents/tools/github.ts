import type { Tool } from "./types.ts";
import { getProviderToken, notConnectedResult } from "./_connections.ts";

async function ghFetch(path: string, token: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const githubPrRead: Tool<{ owner: string; repo: string; pr_number?: number }, unknown> = {
  name: "github_pr_read",
  description: "Read open PRs for a repo, or a specific PR if pr_number is given.",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string", description: "Repository owner (user or org)." },
      repo: { type: "string", description: "Repository name." },
      pr_number: { type: "number", description: "Optional specific PR number." },
    },
    required: ["owner", "repo"],
  },
  async execute({ owner, repo, pr_number }, ctx) {
    const token = await getProviderToken(ctx, "github");
    if (!token) return notConnectedResult("GitHub");
    if (pr_number) {
      const pr = await ghFetch(`/repos/${owner}/${repo}/pulls/${pr_number}`, token);
      return {
        prs: [{ number: pr.number, title: pr.title, state: pr.state, body: pr.body, user: pr.user?.login, url: pr.html_url, draft: pr.draft }],
      };
    }
    const prs = await ghFetch(`/repos/${owner}/${repo}/pulls?state=open&per_page=20`, token);
    return {
      prs: (Array.isArray(prs) ? prs : []).map((pr: { number: number; title: string; state: string; draft: boolean; user?: { login: string }; html_url: string; created_at: string }) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        user: pr.user?.login,
        url: pr.html_url,
        created_at: pr.created_at,
      })),
    };
  },
};

const githubPrComment: Tool<{ owner: string; repo: string; pr_number: number; body: string }, unknown> = {
  name: "github_pr_comment",
  description: "Post a comment on a GitHub PR. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      pr_number: { type: "number", description: "PR number." },
      body: { type: "string", description: "Comment text (Markdown)." },
    },
    required: ["owner", "repo", "pr_number", "body"],
  },
  async execute({ owner, repo, pr_number, body }, ctx) {
    const token = await getProviderToken(ctx, "github");
    if (!token) return notConnectedResult("GitHub");
    const data = await ghFetch(`/repos/${owner}/${repo}/issues/${pr_number}/comments`, token, "POST", { body });
    return { comment_id: data.id, url: data.html_url };
  },
};

const githubIssueCreate: Tool<{ owner: string; repo: string; title: string; body?: string; labels?: string[] }, unknown> = {
  name: "github_issue_create",
  description: "Create a GitHub issue. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      title: { type: "string", description: "Issue title." },
      body: { type: "string", description: "Issue body (Markdown)." },
      labels: { type: "array", items: { type: "string" }, description: "Optional labels." },
    },
    required: ["owner", "repo", "title"],
  },
  async execute({ owner, repo, title, body, labels }, ctx) {
    const token = await getProviderToken(ctx, "github");
    if (!token) return notConnectedResult("GitHub");
    const data = await ghFetch(`/repos/${owner}/${repo}/issues`, token, "POST", { title, body, labels });
    return { issue_number: data.number, url: data.html_url };
  },
};

export const githubTools: Tool[] = [
  githubPrRead as unknown as Tool,
  githubPrComment as unknown as Tool,
  githubIssueCreate as unknown as Tool,
];
