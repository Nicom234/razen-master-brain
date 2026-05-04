import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "google-calendar";

const listEvents: Tool<{ timeMin?: string; timeMax?: string; maxResults?: number }, unknown> = {
  name: "list_events",
  description: "List upcoming Google Calendar events.",
  parameters: {
    type: "object",
    properties: {
      timeMin: { type: "string", description: "Start range (ISO 8601, default now)." },
      timeMax: { type: "string", description: "End range (ISO 8601, default +7 days)." },
      maxResults: { type: "number", description: "Max events (default 10)." },
    },
  },
  async execute({ timeMin, timeMax, maxResults = 10 }, ctx: ToolContext) {
    try {
      const qs = new URLSearchParams({
        timeMin: timeMin ?? new Date().toISOString(),
        timeMax: timeMax ?? new Date(Date.now() + 7 * 86400000).toISOString(),
        maxResults: String(maxResults),
        singleEvents: "true",
        orderBy: "startTime",
      });
      const data = await nangoJSON<{ items?: unknown[] }>(P, ctx.userId, `/calendar/v3/calendars/primary/events?${qs}`);
      return { events: data.items ?? [] };
    } catch { return notConnected("Google Calendar"); }
  },
};

const findFreeTime: Tool<{ date: string; duration_minutes: number }, unknown> = {
  name: "find_free_time",
  description: "Find free time slots on a given date (08:00–18:00) for a meeting.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "Date as YYYY-MM-DD." },
      duration_minutes: { type: "number", description: "Duration in minutes." },
    },
    required: ["date", "duration_minutes"],
  },
  async execute({ date, duration_minutes }, ctx: ToolContext) {
    try {
      const start = new Date(`${date}T08:00:00`);
      const end = new Date(`${date}T18:00:00`);
      const data = await nangoJSON<{ calendars?: { primary?: { busy?: { start: string; end: string }[] } } }>(
        P, ctx.userId, "/calendar/v3/freeBusy", {
          method: "POST",
          body: { timeMin: start.toISOString(), timeMax: end.toISOString(), items: [{ id: "primary" }] },
        },
      );
      const busy = data.calendars?.primary?.busy ?? [];
      const slots: { start: string; end: string }[] = [];
      let cursor = start.getTime();
      for (const b of busy) {
        const bStart = new Date(b.start).getTime();
        if (cursor + duration_minutes * 60000 <= bStart)
          slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + duration_minutes * 60000).toISOString() });
        cursor = Math.max(cursor, new Date(b.end).getTime());
      }
      if (cursor + duration_minutes * 60000 <= end.getTime())
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + duration_minutes * 60000).toISOString() });
      return { free_slots: slots.slice(0, 5) };
    } catch { return notConnected("Google Calendar"); }
  },
};

const createEvent: Tool<{ summary: string; start: string; end: string; description?: string; attendees?: string[] }, unknown> = {
  name: "create_event",
  description: "Create a Google Calendar event. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string" },
      start: { type: "string", description: "ISO 8601 datetime." },
      end: { type: "string" },
      description: { type: "string" },
      attendees: { type: "array", items: { type: "string" }, description: "Attendee emails." },
    },
    required: ["summary", "start", "end"],
  },
  async execute({ summary, start, end, description, attendees }, ctx: ToolContext) {
    try {
      const event: Record<string, unknown> = { summary, start: { dateTime: start }, end: { dateTime: end } };
      if (description) event.description = description;
      if (attendees?.length) event.attendees = attendees.map((email) => ({ email }));
      const data = await nangoJSON<{ id: string; htmlLink: string }>(P, ctx.userId, "/calendar/v3/calendars/primary/events", { method: "POST", body: event });
      return { event_id: data.id, html_link: data.htmlLink };
    } catch { return notConnected("Google Calendar"); }
  },
};

export const calendarTools: Tool[] = [
  listEvents as unknown as Tool,
  findFreeTime as unknown as Tool,
  createEvent as unknown as Tool,
];
