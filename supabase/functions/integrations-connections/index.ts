// Required Supabase secrets: NANGO_SECRET_KEY
import { corsHeaders, getUserFromRequest, jsonErr, jsonOk } from "../_shared/oauth.ts";

const SECRET_KEY = Deno.env.get("NANGO_SECRET_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  const userId = await getUserFromRequest(req);
  if (!userId) return jsonErr("Unauthorized", 401);
  if (!SECRET_KEY) return jsonOk({ providers: [] });

  const res = await fetch(
    `https://api.nango.dev/connection?connectionId=${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${SECRET_KEY}` } },
  );

  if (!res.ok) return jsonOk({ providers: [] });

  const data = await res.json() as { connections?: { provider_config_key: string }[] };
  const providers = (data.connections ?? []).map((c) => c.provider_config_key);

  return jsonOk({ providers });
});
