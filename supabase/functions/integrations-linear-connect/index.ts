// Required secrets: LINEAR_CLIENT_ID, APP_URL
import { corsHeaders, encodeState, getUserFromRequest, jsonErr, jsonOk } from "../_shared/oauth.ts";

const CLIENT_ID = Deno.env.get("LINEAR_CLIENT_ID") ?? "";
const CALLBACK = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-linear-callback`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  const userId = await getUserFromRequest(req);
  if (!userId) return jsonErr("Unauthorized", 401);
  if (!CLIENT_ID) return jsonErr("LINEAR_CLIENT_ID not configured", 503);

  const url = new URL("https://linear.app/oauth/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", CALLBACK);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read,write");
  url.searchParams.set("state", encodeState(userId));

  return jsonOk({ url: url.toString() });
});
