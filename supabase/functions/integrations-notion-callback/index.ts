// Required secrets: NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, APP_URL
import { decodeState, storeConnection } from "../_shared/oauth.ts";

const CLIENT_ID = Deno.env.get("NOTION_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("NOTION_CLIENT_SECRET") ?? "";
const CALLBACK = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-notion-callback`;
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:8080";

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return Response.redirect(`${APP_URL}?error=oauth_missing_params`, 302);

  let userId: string;
  try { userId = decodeState(state); } catch { return Response.redirect(`${APP_URL}?error=oauth_bad_state`, 302); }

  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: CALLBACK }),
  });
  const tokens = await tokenRes.json() as {
    access_token?: string;
    scope?: string;
    bot_id?: string;
    workspace_id?: string;
    workspace_name?: string;
    error?: string;
  };
  if (!tokens.access_token) return Response.redirect(`${APP_URL}?error=oauth_token_failed`, 302);

  try {
    await storeConnection(userId, "notion", {
      access_token: tokens.access_token,
      scope: tokens.scope,
      meta: { bot_id: tokens.bot_id, workspace_id: tokens.workspace_id, workspace_name: tokens.workspace_name },
    });
  } catch {
    return Response.redirect(`${APP_URL}?error=oauth_store_failed`, 302);
  }

  return Response.redirect(`${APP_URL}?connected=notion`, 302);
});
