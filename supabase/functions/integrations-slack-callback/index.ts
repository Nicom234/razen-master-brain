// Required secrets: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, APP_URL
import { decodeState, storeConnection } from "../_shared/oauth.ts";

const CLIENT_ID = Deno.env.get("SLACK_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SLACK_CLIENT_SECRET") ?? "";
const CALLBACK = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-slack-callback`;
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:8080";

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return Response.redirect(`${APP_URL}?error=oauth_missing_params`, 302);

  let userId: string;
  try { userId = decodeState(state); } catch { return Response.redirect(`${APP_URL}?error=oauth_bad_state`, 302); }

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: CALLBACK }),
  });
  const tokens = await tokenRes.json() as {
    ok: boolean;
    access_token?: string;
    scope?: string;
    team?: { id: string; name: string };
    bot_user_id?: string;
  };
  if (!tokens.ok || !tokens.access_token) return Response.redirect(`${APP_URL}?error=oauth_token_failed`, 302);

  try {
    await storeConnection(userId, "slack", {
      access_token: tokens.access_token,
      scope: tokens.scope,
      meta: { team_id: tokens.team?.id, team_name: tokens.team?.name, bot_user_id: tokens.bot_user_id },
    });
  } catch {
    return Response.redirect(`${APP_URL}?error=oauth_store_failed`, 302);
  }

  return Response.redirect(`${APP_URL}?connected=slack`, 302);
});
