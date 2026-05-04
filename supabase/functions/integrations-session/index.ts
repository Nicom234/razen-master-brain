// Required Supabase secrets: NANGO_SECRET_KEY, NANGO_PUBLIC_KEY
import { corsHeaders, getUserFromRequest, jsonErr, jsonOk } from "../_shared/oauth.ts";

const SECRET_KEY = Deno.env.get("NANGO_SECRET_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("NANGO_PUBLIC_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  const userId = await getUserFromRequest(req);
  if (!userId) return jsonErr("Unauthorized", 401);
  if (!SECRET_KEY) return jsonErr("NANGO_SECRET_KEY not configured", 503);

  let integration: string | undefined;
  if (req.method === "POST") {
    try {
      const body = await req.json() as { integration?: string };
      integration = body.integration;
    } catch { /* no body */ }
  } else {
    integration = new URL(req.url).searchParams.get("integration") ?? undefined;
  }

  const payload: Record<string, unknown> = { end_user: { id: userId } };
  if (integration) payload.allowed_integrations = [integration];

  const res = await fetch("https://api.nango.dev/connect/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonErr(`Nango error: ${text.slice(0, 200)}`, 502);
  }

  const data = await res.json() as { data?: { token: string }; token?: string };
  const token = data.data?.token ?? data.token;
  if (!token) return jsonErr("No token in Nango response", 502);

  return jsonOk({ session_token: token, public_key: PUBLIC_KEY });
});
