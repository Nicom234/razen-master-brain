import type { Tool } from "./types.ts";
import { getProviderToken, notConnectedResult } from "./_connections.ts";

const listEvents: Tool<{ timeMin?: string; timeMax?: string; maxResults?: number }, unknown> = {
  name: "list_events",
  description: "List upcoming Google Calendar events from the user's primary calendar.",
  parameters: {
    type: "object",
    properties: {
      timeMin: { type: "string", description: "Start of range (ISO 8601). Defaults to now." },
      timeMax: { type: "string", description: "End of range (ISO 8601). Defaults to 7 days from now." },
      maxResults: { type: "number", description: "Max events (default 10)." },
    },
  },
  async execute({ timeMin, timeMax, maxResults = 10 }, ctx) {
    const token = await getProviderToken(ctx, "gmail");
    if (!token) return notConnectedResult("Google Calendar (connect Gmail)");
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin ?? new Date().toISOString());
    url.searchParams.set("timeMax", timeMax ?? new Date(Date.now() + 7 * 86400000).toISOString());
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    const data = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
    return {
      events: (data.items ?? []).map((e: { id: string; summary: string; start: unknown; end: unknown; location?: string; attendees?: unknown[] }) => ({
        id: e.id,
        summary: e.summary,
        start: e.start,
        end: e.end,
        location: e.location,
        attendees: e.attendees,
      })),
    };
  },
};

const findFreeTime: Tool<{ date: string; duration_minutes: number }, unknown> = {
  name: "find_free_time",
  description: "Find free time slots on a given date (08:00–18:00 local) for a desired duration.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "Date as YYYY-MM-DD." },
      duration_minutes: { type: "number", description: "Desired meeting length in minutes." },
    },
    required: ["date", "duration_minutes"],
  },
  async execute({ date, duration_minutes }, ctx) {
    const token = await getProviderToken(ctx, "gmail");
    if (!token) return notConnectedResult("Google Calendar (connect Gmail)");
    const start = new Date(`${date}T08:00:00`);
    const end = new Date(`${date}T18:00:00`);
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), items: [{ id: "primary" }] }),
    });
    const data = await res.json();
    const busy: { start: string; end: string }[] = data.calendars?.primary?.busy ?? [];
    const slots: { start: string; end: string }[] = [];
    let cursor = start.getTime();
    for (const b of busy) {
      const bStart = new Date(b.start).getTime();
      if (cursor + duration_minutes * 60000 <= bStart) {
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + duration_minutes * 60000).toISOString() });
      }
      cursor = Math.max(cursor, new Date(b.end).getTime());
    }
    if (cursor + duration_minutes * 60000 <= end.getTime()) {
      slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + duration_minutes * 60000).toISOString() });
    }
    return { free_slots: slots.slice(0, 5) };
  },
};

const createEvent: Tool<{ summary: string; start: string; end: string; description?: string; attendees?: string[] }, unknown> = {
  name: "create_event",
  description: "Create a Google Calendar event. Use ONLY after explicit user confirmation.",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Event title." },
      start: { type: "string", description: "Start (ISO 8601)." },
      end: { type: "string", description: "End (ISO 8601)." },
      description: { type: "string", description: "Optional description." },
      attendees: { type: "array", items: { type: "string" }, description: "Optional attendee emails." },
    },
    required: ["summary", "start", "end"],
  },
  async execute({ summary, start, end, description, attendees }, ctx) {
    const token = await getProviderToken(ctx, "gmail");
    if (!token) return notConnectedResult("Google Calendar (connect Gmail)");
    const event: Record<string, unknown> = { summary, start: { dateTime: start }, end: { dateTime: end } };
    if (description) event.description = description;
    if (attendees?.length) event.attendees = attendees.map((email) => ({ email }));
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    const data = await res.json();
    return { event_id: data.id, html_link: data.htmlLink };
  },
};

export const calendarTools: Tool[] = [
  listEvents as unknown as Tool,
  findFreeTime as unknown as Tool,
  createEvent as unknown as Tool,
];
