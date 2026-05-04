import type { Tool, ToolContext } from "./types.ts";
import { nangoJSON, notConnected } from "./_nango.ts";

const P = "hubspot";

const hubspotSearchContacts: Tool<{ query: string; limit?: number }, unknown> = {
  name: "hubspot_search_contacts",
  description: "Search HubSpot contacts by name, email, or company.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term." },
      limit: { type: "number", description: "Max results (default 10)." },
    },
    required: ["query"],
  },
  async execute({ query, limit = 10 }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ results?: unknown[] }>(P, ctx.userId, "/crm/v3/objects/contacts/search", {
        method: "POST",
        body: {
          query,
          limit,
          properties: ["firstname", "lastname", "email", "company", "phone"],
        },
      });
      return { contacts: data.results ?? [] };
    } catch { return notConnected("HubSpot"); }
  },
};

const hubspotCreateContact: Tool<{ email: string; firstname?: string; lastname?: string; company?: string; phone?: string }, unknown> = {
  name: "hubspot_create_contact",
  description: "Create a HubSpot contact. Use ONLY after user confirmation.",
  parameters: {
    type: "object",
    properties: {
      email: { type: "string" },
      firstname: { type: "string" },
      lastname: { type: "string" },
      company: { type: "string" },
      phone: { type: "string" },
    },
    required: ["email"],
  },
  async execute({ email, firstname, lastname, company, phone }, ctx: ToolContext) {
    try {
      const props: Record<string, string> = { email };
      if (firstname) props.firstname = firstname;
      if (lastname) props.lastname = lastname;
      if (company) props.company = company;
      if (phone) props.phone = phone;
      const data = await nangoJSON<{ id: string }>(P, ctx.userId, "/crm/v3/objects/contacts", {
        method: "POST", body: { properties: props },
      });
      return { contact_id: data.id };
    } catch { return notConnected("HubSpot"); }
  },
};

const hubspotSearchDeals: Tool<{ query: string; limit?: number }, unknown> = {
  name: "hubspot_search_deals",
  description: "Search HubSpot deals by name or stage.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number", description: "Max results (default 10)." },
    },
    required: ["query"],
  },
  async execute({ query, limit = 10 }, ctx: ToolContext) {
    try {
      const data = await nangoJSON<{ results?: unknown[] }>(P, ctx.userId, "/crm/v3/objects/deals/search", {
        method: "POST",
        body: { query, limit, properties: ["dealname", "amount", "dealstage", "closedate", "hubspot_owner_id"] },
      });
      return { deals: data.results ?? [] };
    } catch { return notConnected("HubSpot"); }
  },
};

export const hubspotTools: Tool[] = [
  hubspotSearchContacts as unknown as Tool,
  hubspotCreateContact as unknown as Tool,
  hubspotSearchDeals as unknown as Tool,
];
