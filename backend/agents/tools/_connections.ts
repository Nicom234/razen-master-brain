import type { Tool, ToolContext } from "./types.ts";

interface ConnectionsClient {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        eq: (k: string, v: string) => {
          maybeSingle: () => Promise<{ data: { access_token: string } | null }>;
        };
      };
    };
  };
}

export async function getProviderToken(ctx: ToolContext, provider: string): Promise<string | null> {
  const supabase = ctx.supabase as ConnectionsClient | undefined;
  if (!supabase) return null;
  const { data } = await supabase
    .from("connections")
    .select("access_token")
    .eq("user_id", ctx.userId)
    .eq("provider", provider)
    .maybeSingle();
  return data?.access_token ?? null;
}

export function notConnectedResult(provider: string) {
  return { error: `${provider} is not connected. Ask the user to connect it from the workspace.` };
}

export type AnyTool = Tool<Record<string, unknown>, unknown>;
