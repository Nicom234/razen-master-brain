// Supabase persistence adapter. Pure data-access functions — no business logic.
//
// All inputs/outputs match the existing `conversations`, `messages`, `memories`,
// `subscriptions`, and `credits` tables (see supabase/migrations and
// src/integrations/supabase/types.ts).

export type SupaLike = {
  from: (table: string) => {
    select: (cols: string) => any;
    insert: (row: any) => any;
    update: (row: any) => any;
    delete: () => any;
  };
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  auth: {
    getUser: (jwt: string) => Promise<{ data: { user: { id: string } | null } }>;
  };
};

export type Tier = "free" | "pro" | "elite";

export async function loadTier(supabase: SupaLike, userId: string): Promise<Tier> {
  const { data } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.tier as Tier) ?? "free";
}

export async function loadMemories(supabase: SupaLike, userId: string, tier: Tier): Promise<string[]> {
  if (tier === "free") return [];
  const limit = tier === "elite" ? 50 : 20;
  const { data } = await supabase
    .from("memories")
    .select("content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row: { content: string }) => row.content);
}

export async function deductCredits(
  supabase: SupaLike,
  userId: string,
  cost: number,
): Promise<{ ok: true; balance: number } | { ok: false; balance: number }> {
  const { data, error } = await supabase.rpc("deduct_credit", {
    _user_id: userId,
    _cost: cost,
  });
  if (error) throw new Error(`deduct_credit failed: ${(error as Error).message}`);
  const balance = typeof data === "number" ? data : 0;
  return balance < 0 ? { ok: false, balance } : { ok: true, balance };
}

export async function ensureConversation(
  supabase: SupaLike,
  userId: string,
  conversationId: string | null,
  firstMessage: string,
): Promise<string> {
  if (conversationId) {
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    return conversationId;
  }
  const title = firstMessage.slice(0, 60) || "New chat";
  const { data } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id")
    .single();
  return data.id as string;
}

export async function saveMessage(
  supabase: SupaLike,
  conversationId: string,
  userId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role,
    content,
  });
}

/** Routing heuristic shared with the legacy /chat endpoint so credits stay consistent. */
export function routeCost(tier: Tier, msgChars: number): { model: string; cost: number; reasoning: "low" | "medium" | "high" } {
  const heavy = msgChars > 1100;
  const veryHeavy = msgChars > 2400;
  if (tier === "elite") return { model: "google/gemini-3-flash-preview", cost: veryHeavy ? 5 : heavy ? 4 : 3, reasoning: "medium" };
  if (tier === "pro") return { model: "google/gemini-3-flash-preview", cost: veryHeavy ? 4 : heavy ? 3 : 2, reasoning: "medium" };
  return { model: "google/gemini-3-flash-preview", cost: heavy ? 2 : 1, reasoning: "low" };
}
