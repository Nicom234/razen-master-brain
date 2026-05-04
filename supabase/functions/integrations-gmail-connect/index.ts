// Required secrets: GOOGLE_CLIENT_ID, APP_URL
// Requests Gmail + Calendar scopes in one consent so both integrations share one token.
import { corsHeaders, encodeState, getUserFromRequest, jsonErr, jsonOk } from "../_shared/oauth.ts";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CALLBACK = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-gmail-callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  const userId = await getUserFromRequest(req);
  if (!userId) return jsonErr("Unauthorized", 401);
  if (!CLIENT_ID) return jsonErr("GOOGLE_CLIENT_ID not configured", 503);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", CALLBACK);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", encodeState(userId));

  return jsonOk({ url: url.toString() });
});
