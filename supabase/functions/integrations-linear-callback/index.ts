// Required secrets: LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET, APP_URL
import { decodeState, storeConnection } from "../_shared/oauth.ts";

const CLIENT_ID = Deno.env.get("LINEAR_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("LINEAR_CLIENT_SECRET") ?? "";
const CALLBACK = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-linear-callback`;
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:8080";

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return Response.redirect(`${APP_URL}?error=oauth_missing_params`, 302);

  let userId: string;
  try { userId = decodeState(state); } catch { return Response.redirect(`${APP_URL}?error=oauth_bad_state`, 302); }

  const tokenRes = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: CALLBACK,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json() as { access_token?: string; scope?: string; error?: string };
  if (!tokens.access_token) return Response.redirect(`${APP_URL}?error=oauth_token_failed`, 302);

  try {
    await storeConnection(userId, "linear", {
      access_token: tokens.access_token,
      scope: tokens.scope,
    });
  } catch {
    return Response.redirect(`${APP_URL}?error=oauth_store_failed`, 302);
  }

  return Response.redirect(`${APP_URL}?connected=linear`, 302);
});
