import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "linear";

async function gql<T = unknown>(userId: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return nangoJSON<T>(P, userId, "/graphql", { method: "POST", body: { query, variables } });
}

const linearSearch: Tool<{ query: string }, unknown> = {
  name: "linear_search",
  description: "Search Linear issues by keyword.",
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  async execute({ query }, ctx: ToolContext) {
    try {
      const data = await gql<{ data?: { issueSearch?: { nodes: unknown[] } } }>(ctx.userId,
        `query($term: String!) { issueSearch(query: $term, first: 10) { nodes { id identifier title state { name } assignee { name } priority url } } }`,
        { term: query },
      );
      return { issues: data.data?.issueSearch?.nodes ?? [] };
    } catch { return notConnected("Linear"); }
  },
};

const linearCreate: Tool<{ title: string; description?: string; team_key?: string; priority?: number }, unknown> = {
  name: "linear_create",
  description: "Create a Linear issue. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      team_key: { type: "string", description: "Team key e.g. 'ENG'. Omit to use first team." },
      priority: { type: "number", description: "0=none 1=urgent 2=high 3=medium 4=low." },
    },
    required: ["title"],
  },
  async execute({ title, description, team_key, priority }, ctx: ToolContext) {
    try {
      const teamsQ = team_key
        ? `query($k:String!){teams(filter:{key:{eq:$k}}){nodes{id}}}`
        : `query{teams(first:1){nodes{id}}}`;
      const teamsD = await gql<{ data?: { teams?: { nodes?: { id: string }[] } } }>(ctx.userId, teamsQ, team_key ? { k: team_key } : {});
      const teamId = teamsD.data?.teams?.nodes?.[0]?.id;
      if (!teamId) return { error: "No Linear team found" };
      const input: Record<string, unknown> = { title, teamId };
      if (description) input.description = description;
      if (priority !== undefined) input.priority = priority;
      const data = await gql<{ data?: { issueCreate?: { issue?: { id: string; identifier: string; url: string } } } }>(ctx.userId,
        `mutation($input:IssueCreateInput!){issueCreate(input:$input){issue{id identifier url}}}`, { input },
      );
      const issue = data.data?.issueCreate?.issue;
      return { issue_id: issue?.id, identifier: issue?.identifier, url: issue?.url };
    } catch { return notConnected("Linear"); }
  },
};

const linearUpdate: Tool<{ issue_id: string; title?: string; description?: string }, unknown> = {
  name: "linear_update",
  description: "Update a Linear issue title or description. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: { issue_id: { type: "string" }, title: { type: "string" }, description: { type: "string" } },
    required: ["issue_id"],
  },
  async execute({ issue_id, title, description }, ctx: ToolContext) {
    try {
      const input: Record<string, unknown> = {};
      if (title) input.title = title;
      if (description) input.description = description;
      const data = await gql<{ data?: { issueUpdate?: { success: boolean } } }>(ctx.userId,
        `mutation($id:String!,$input:IssueUpdateInput!){issueUpdate(id:$id,input:$input){success}}`, { id: issue_id, input },
      );
      return { ok: data.data?.issueUpdate?.success ?? false };
    } catch { return notConnected("Linear"); }
  },
};

export const linearTools: Tool[] = [
  linearSearch as unknown as Tool,
  linearCreate as unknown as Tool,
  linearUpdate as unknown as Tool,
];
