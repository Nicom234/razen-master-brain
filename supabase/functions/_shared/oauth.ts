import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TokenSet {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  meta?: Record<string, unknown>;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function storeConnection(userId: string, provider: string, tokens: TokenSet) {
  const { error } = await adminClient().from("connections").upsert(
    {
      user_id: userId,
      provider,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokens.expires_at ?? null,
      scope: tokens.scope ?? null,
      meta: tokens.meta ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`storeConnection: ${error.message}`);
}

export async function getConnection(userId: string, provider: string): Promise<TokenSet | null> {
  const { data } = await adminClient()
    .from("connections")
    .select("access_token,refresh_token,expires_at,scope,meta")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data as TokenSet | null) ?? null;
}

export function encodeState(userId: string): string {
  return btoa(userId);
}

export function decodeState(state: string): string {
  return atob(state);
}

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
}

export async function getUserFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

export function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}
