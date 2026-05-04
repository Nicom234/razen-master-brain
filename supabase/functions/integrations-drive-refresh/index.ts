// Required secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
import { corsHeaders, getConnection, jsonErr, jsonOk, storeConnection } from "../_shared/oauth.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  const { userId } = await req.json() as { userId?: string };
  if (!userId) return jsonErr("userId required", 400);

  const conn = await getConnection(userId, "drive");
  if (!conn?.refresh_token) return jsonErr("No refresh token stored", 400);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: conn.refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await tokenRes.json() as { access_token?: string; expires_in?: number; scope?: string };
  if (!tokens.access_token) return jsonErr("Refresh failed", 502);

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  await storeConnection(userId, "drive", {
    access_token: tokens.access_token,
    refresh_token: conn.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope ?? conn.scope,
  });

  return jsonOk({ ok: true });
});
