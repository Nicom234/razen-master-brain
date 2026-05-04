import type { Tool } from "./types.ts";
import { getProviderToken, notConnectedResult } from "./_connections.ts";

async function linearGQL(query: string, variables: Record<string, unknown>, token: string) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const linearSearch: Tool<{ query: string }, unknown> = {
  name: "linear_search",
  description: "Search Linear issues by keyword.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Search term." } },
    required: ["query"],
  },
  async execute({ query }, ctx) {
    const token = await getProviderToken(ctx, "linear");
    if (!token) return notConnectedResult("Linear");
    const gql = `query($term: String!) {
      issueSearch(query: $term, first: 10) {
        nodes { id identifier title state { name } assignee { name } priority url }
      }
    }`;
    const data = await linearGQL(gql, { term: query }, token);
    return { issues: data.data?.issueSearch?.nodes ?? [] };
  },
};

const linearCreate: Tool<{ title: string; description?: string; team_key?: string; priority?: number }, unknown> = {
  name: "linear_create",
  description: "Create a Linear issue. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Issue title." },
      description: { type: "string", description: "Issue description (Markdown)." },
      team_key: { type: "string", description: "Team key, e.g. 'ENG'. Omit to use first team." },
      priority: { type: "number", description: "0=none, 1=urgent, 2=high, 3=medium, 4=low." },
    },
    required: ["title"],
  },
  async execute({ title, description, team_key, priority }, ctx) {
    const token = await getProviderToken(ctx, "linear");
    if (!token) return notConnectedResult("Linear");
    let teamId: string | undefined;
    if (team_key) {
      const teamsGql = `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }`;
      const teamsData = await linearGQL(teamsGql, { key: team_key }, token);
      teamId = teamsData.data?.teams?.nodes?.[0]?.id;
    } else {
      const teamsGql = `query { teams(first: 1) { nodes { id } } }`;
      const teamsData = await linearGQL(teamsGql, {}, token);
      teamId = teamsData.data?.teams?.nodes?.[0]?.id;
    }
    if (!teamId) return { error: "No Linear team found" };
    const createGql = `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) { issue { id identifier url } }
    }`;
    const input: Record<string, unknown> = { title, teamId };
    if (description) input.description = description;
    if (priority !== undefined) input.priority = priority;
    const data = await linearGQL(createGql, { input }, token);
    const issue = data.data?.issueCreate?.issue;
    return { issue_id: issue?.id, identifier: issue?.identifier, url: issue?.url };
  },
};

const linearUpdate: Tool<{ issue_id: string; title?: string; description?: string }, unknown> = {
  name: "linear_update",
  description: "Update a Linear issue's title or description. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      issue_id: { type: "string", description: "Linear issue ID." },
      title: { type: "string", description: "New title." },
      description: { type: "string", description: "New description." },
    },
    required: ["issue_id"],
  },
  async execute({ issue_id, title, description }, ctx) {
    const token = await getProviderToken(ctx, "linear");
    if (!token) return notConnectedResult("Linear");
    const updateGql = `mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }`;
    const input: Record<string, unknown> = {};
    if (title) input.title = title;
    if (description) input.description = description;
    const data = await linearGQL(updateGql, { id: issue_id, input }, token);
    return { ok: data.data?.issueUpdate?.success ?? false };
  },
};

export const linearTools: Tool[] = [
  linearSearch as unknown as Tool,
  linearCreate as unknown as Tool,
  linearUpdate as unknown as Tool,
];
