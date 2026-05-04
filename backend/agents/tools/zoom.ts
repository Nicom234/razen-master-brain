import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "zoom";

const zoomListMeetings: Tool<{ type?: string }, unknown> = {
  name: "zoom_list_meetings",
  description: "List the user's upcoming Zoom meetings.",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", description: "Meeting type: 'scheduled', 'live', or 'upcoming' (default 'upcoming')." },
    },
  },
  async execute({ type = "upcoming" }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ meetings?: unknown[] }>(P, ctx.userId, `/users/me/meetings?type=${type}&page_size=20`);
      return { meetings: data.meetings ?? [] };
    } catch { return notConnected("Zoom"); }
  },
};

const zoomCreateMeeting: Tool<{ topic: string; start_time: string; duration: number; agenda?: string }, unknown> = {
  name: "zoom_create_meeting",
  description: "Schedule a Zoom meeting. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Meeting title." },
      start_time: { type: "string", description: "Start time as ISO 8601." },
      duration: { type: "number", description: "Duration in minutes." },
      agenda: { type: "string", description: "Optional agenda." },
    },
    required: ["topic", "start_time", "duration"],
  },
  async execute({ topic, start_time, duration, agenda }, ctx: ToolContext) {
    try {
      const body: Record<string, unknown> = { topic, type: 2, start_time, duration, settings: { join_before_host: true } };
      if (agenda) body.agenda = agenda;
      const data = await nangoJSON<{ id: number; join_url: string; start_url: string }>(P, ctx.userId, "/users/me/meetings", {
        method: "POST", body,
      });
      return { meeting_id: data.id, join_url: data.join_url, start_url: data.start_url };
    } catch { return notConnected("Zoom"); }
  },
};

export const zoomTools: Tool[] = [
  zoomListMeetings as unknown as Tool,
  zoomCreateMeeting as unknown as Tool,
];
