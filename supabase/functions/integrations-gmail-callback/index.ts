// Required secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL
import { decodeState, storeConnection } from "../_shared/oauth.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const CALLBACK = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-gmail-callback`;
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:8080";

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return Response.redirect(`${APP_URL}?error=oauth_missing_params`, 302);

  let userId: string;
  try { userId = decodeState(state); } catch { return Response.redirect(`${APP_URL}?error=oauth_bad_state`, 302); }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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
  const tokens = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!tokens.access_token) return Response.redirect(`${APP_URL}?error=oauth_token_failed`, 302);

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  try {
    await storeConnection(userId, "gmail", {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
    });
  } catch {
    return Response.redirect(`${APP_URL}?error=oauth_store_failed`, 302);
  }

  return Response.redirect(`${APP_URL}?connected=gmail`, 302);
});
