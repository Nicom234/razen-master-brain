import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "asana";

const asanaListTasks: Tool<{ project_gid?: string; assignee?: string; completed?: boolean }, unknown> = {
  name: "asana_list_tasks",
  description: "List Asana tasks assigned to the current user or in a project.",
  parameters: {
    type: "object",
    properties: {
      project_gid: { type: "string", description: "Optional project GID to scope tasks." },
      assignee: { type: "string", description: "Assignee GID or 'me' (default 'me')." },
      completed: { type: "string", description: "Filter by completed: 'true' or 'false'." },
    },
  },
  async execute({ project_gid, assignee = "me", completed }, ctx: ToolContext) {
    try {
      // Get the first workspace GID if no project given
      let qs: URLSearchParams;
      if (project_gid) {
        qs = new URLSearchParams({ project: project_gid, opt_fields: "gid,name,completed,due_on,notes,assignee.name" });
      } else {
        const ws = await nangoJSON<{ data?: { gid: string }[] }>(P, ctx.userId, "/workspaces?opt_fields=gid");
        const wsGid = ws.data?.[0]?.gid;
        if (!wsGid) return { tasks: [], note: "No workspace found" };
        qs = new URLSearchParams({ workspace: wsGid, assignee, opt_fields: "gid,name,completed,due_on,notes" });
      }
      if (completed !== undefined) qs.set("completed", String(completed));
      const data = await nangoJSON<{ data?: unknown[] }>(P, ctx.userId, `/tasks?${qs}`);
      return { tasks: data.data ?? [] };
    } catch { return notConnected("Asana"); }
  },
};

const asanaCreateTask: Tool<{ workspace_gid?: string; project_gid?: string; name: string; notes?: string; due_on?: string }, unknown> = {
  name: "asana_create_task",
  description: "Create an Asana task. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Task name." },
      notes: { type: "string", description: "Task description." },
      due_on: { type: "string", description: "Due date as YYYY-MM-DD." },
      project_gid: { type: "string", description: "Optional project GID." },
      workspace_gid: { type: "string", description: "Workspace GID (auto-detected if omitted)." },
    },
    required: ["name"],
  },
  async execute({ workspace_gid, project_gid, name, notes, due_on }, ctx: ToolContext) {
    try {
      let wsGid = workspace_gid;
      if (!wsGid) {
        const ws = await nangoJSON<{ data?: { gid: string }[] }>(P, ctx.userId, "/workspaces?opt_fields=gid");
        wsGid = ws.data?.[0]?.gid;
      }
      if (!wsGid) return { error: "No workspace found" };
      const taskData: Record<string, unknown> = { name, workspace: wsGid };
      if (notes) taskData.notes = notes;
      if (due_on) taskData.due_on = due_on;
      if (project_gid) taskData.projects = [project_gid];
      const data = await nangoJSON<{ data?: { gid: string; name: string } }>(P, ctx.userId, "/tasks", {
        method: "POST", body: { data: taskData },
      });
      return { task_gid: data.data?.gid, name: data.data?.name };
    } catch { return notConnected("Asana"); }
  },
};

const asanaUpdateTask: Tool<{ task_gid: string; name?: string; notes?: string; completed?: boolean; due_on?: string }, unknown> = {
  name: "asana_update_task",
  description: "Update an Asana task. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      task_gid: { type: "string" },
      name: { type: "string" },
      notes: { type: "string" },
      completed: { type: "string", description: "'true' or 'false'." },
      due_on: { type: "string", description: "YYYY-MM-DD." },
    },
    required: ["task_gid"],
  },
  async execute({ task_gid, name, notes, completed, due_on }, ctx: ToolContext) {
    try {
      const taskData: Record<string, unknown> = {};
      if (name) taskData.name = name;
      if (notes) taskData.notes = notes;
      if (completed !== undefined) taskData.completed = String(completed) === "true";
      if (due_on) taskData.due_on = due_on;
      await nangoJSON(P, ctx.userId, `/tasks/${task_gid}`, { method: "PUT", body: { data: taskData } });
      return { ok: true, task_gid };
    } catch { return notConnected("Asana"); }
  },
};

export const asanaTools: Tool[] = [
  asanaListTasks as unknown as Tool,
  asanaCreateTask as unknown as Tool,
  asanaUpdateTask as unknown as Tool,
];
