import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "jira";

const jiraSearch: Tool<{ jql: string; maxResults?: number }, unknown> = {
  name: "jira_search",
  description: "Search Jira issues with JQL (Jira Query Language).",
  parameters: {
    type: "object",
    properties: {
      jql: { type: "string", description: "JQL query, e.g. 'assignee = currentUser() AND status != Done'." },
      maxResults: { type: "number", description: "Max results (default 10)." },
    },
    required: ["jql"],
  },
  async execute({ jql, maxResults = 10 }, ctx: ToolContext) {
    try {
      const qs = new URLSearchParams({ jql, maxResults: String(maxResults), fields: "summary,status,assignee,priority,issuetype" });
      const data = await nangoJSON<{ issues?: unknown[] }>(P, ctx.userId, `/rest/api/3/issue/search?${qs}`);
      return { issues: data.issues ?? [] };
    } catch { return notConnected("Jira"); }
  },
};

const jiraCreate: Tool<{ project_key: string; summary: string; description?: string; issue_type?: string; priority?: string }, unknown> = {
  name: "jira_create",
  description: "Create a Jira issue. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      project_key: { type: "string", description: "Project key, e.g. 'ENG'." },
      summary: { type: "string", description: "Issue title." },
      description: { type: "string", description: "Issue description." },
      issue_type: { type: "string", description: "Type name, e.g. 'Bug', 'Story', 'Task'. Default: Task." },
      priority: { type: "string", description: "Priority name, e.g. 'High', 'Medium'." },
    },
    required: ["project_key", "summary"],
  },
  async execute({ project_key, summary, description, issue_type = "Task", priority }, ctx: ToolContext) {
    try {
      const fields: Record<string, unknown> = {
        project: { key: project_key },
        summary,
        issuetype: { name: issue_type },
      };
      if (description) fields.description = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] };
      if (priority) fields.priority = { name: priority };
      const data = await nangoJSON<{ id: string; key: string; self: string }>(P, ctx.userId, "/rest/api/3/issue", {
        method: "POST", body: { fields },
      });
      return { issue_id: data.id, key: data.key };
    } catch { return notConnected("Jira"); }
  },
};

const jiraUpdate: Tool<{ issue_key: string; summary?: string; description?: string; status?: string }, unknown> = {
  name: "jira_update",
  description: "Update a Jira issue. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key, e.g. 'ENG-123'." },
      summary: { type: "string" },
      description: { type: "string" },
    },
    required: ["issue_key"],
  },
  async execute({ issue_key, summary, description }, ctx: ToolContext) {
    try {
      const fields: Record<string, unknown> = {};
      if (summary) fields.summary = summary;
      if (description) fields.description = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] };
      await nangoJSON(P, ctx.userId, `/rest/api/3/issue/${issue_key}`, { method: "PUT", body: { fields } });
      return { ok: true, issue_key };
    } catch { return notConnected("Jira"); }
  },
};

export const jiraTools: Tool[] = [
  jiraSearch as unknown as Tool,
  jiraCreate as unknown as Tool,
  jiraUpdate as unknown as Tool,
];
