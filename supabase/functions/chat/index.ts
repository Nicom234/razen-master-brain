import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Credits-Remaining",
};

const SYSTEMS: Record<string, string> = {
  research: `You are Razen — Research mode. You're a senior research analyst. Methodology: 1) Restate the question precisely. 2) Search for primary sources via the web_search tool. 3) Cross-reference 3+ sources. 4) Cite every factual claim with [n] markers and a Sources list. 5) Flag uncertainty. Output structure: TL;DR (3 lines) → Key findings (bullets with citations) → Deeper analysis → Sources. Never invent URLs.`,
  build: `You are Razen — Build mode. You're a staff-level engineer. Default to working code over explanation. Always: 1) Confirm assumptions in 1 line. 2) Provide complete, runnable code (no "...rest unchanged"). 3) Note tradeoffs and edge cases. 4) Suggest tests. Use markdown code blocks with language tags. Be terse, technical, useful.`,
  write: `You are Razen — Write mode. You're a Pulitzer-caliber editor. Match the user's requested register precisely. Default principles: clear over clever, concrete over abstract, active over passive, specific over vague. Cut every word that doesn't earn its place. When asked to revise, return the full revised text plus a brief change-log of what you cut and why.`,
  plan: `You are Razen — Plan mode. You're a McKinsey-trained chief of staff. Turn ambiguity into structure. Always output: 1) Goal (one sentence). 2) Assumptions. 3) Step-by-step plan with owners and timing. 4) Risks + mitigations. 5) Definition of done. Use tight bullets. Push back if the goal is unclear.`,
};

// Model routing — Elite gets the strongest reasoning model, Pro gets a fast premium model, Free stays on Flash.
function pickModel(tier: string, mode: string): string {
  if (tier === "elite") {
    if (mode === "build" || mode === "plan") return "openai/gpt-5";
    return "google/gemini-2.5-pro";
  }
  if (tier === "pro") {
    if (mode === "build") return "openai/gpt-5-mini";
    return "google/gemini-2.5-pro";
  }
  return "google/gemini-2.5-flash";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { messages, mode, useWebSearch } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) return j({ error: "messages required" }, 400);

    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return j({ error: "Sign in required" }, 401);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: u } = await userClient.auth.getUser(auth.slice(7));
    const user = u.user;
    if (!user) return j({ error: "Sign in required" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle();
    const tier = (sub?.tier as "free" | "pro" | "elite") ?? "free";

    const { data: newBal, error: dErr } = await admin.rpc("deduct_credit", { _user_id: user.id });
    if (dErr) { console.error("deduct", dErr); return j({ error: "Credit check failed" }, 500); }
    if (typeof newBal === "number" && newBal < 0) {
      return j({ error: tier === "free" ? "Out of credits — refills tomorrow, or upgrade for instant access." : "Out of credits. Upgrade your plan or wait for next month's reset." }, 402);
    }

    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_KEY) return j({ error: "AI not configured" }, 500);

    const m = (mode as keyof typeof SYSTEMS) || "research";
    const model = pickModel(tier, m);
    const baseSystem = SYSTEMS[m] || SYSTEMS.research;

    // Inject memory for Elite users (long-term memory is the killer feature)
    let memoryBlock = "";
    if (tier === "elite") {
      const { data: mems } = await admin.from("memories").select("content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40);
      if (mems && mems.length) {
        memoryBlock = `\n\n# What you remember about this user\n` +
          mems.map((row, i) => `${i + 1}. ${row.content}`).join("\n") +
          `\n\nUse these facts naturally. Don't recite them — use them to personalise voice, recall projects, and skip context the user has already given you.`;
      }
    }

    const tierTag = `\n\n# Tier\nThe user is on the ${tier.toUpperCase()} plan.${tier === "elite" ? " Treat them as a power user — be denser, faster, more decisive." : ""}`;
    const system = baseSystem + memoryBlock + tierTag;

    const body: Record<string, unknown> = {
      model,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    };
    // Web search via Gemini grounding when requested + supported
    if (useWebSearch && model.startsWith("google/")) {
      body.tools = [{ type: "google_search" }];
    }

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) return j({ error: "Too fast — pause a moment and retry." }, 429);
      if (upstream.status === 402) return j({ error: "AI credits exhausted on the platform side." }, 402);
      const t = await upstream.text();
      console.error("gateway", upstream.status, t);
      return j({ error: "AI gateway error" }, 500);
    }

    return new Response(upstream.body, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Credits-Remaining": String(newBal ?? 0),
        "X-Model": model,
      },
    });
  } catch (e) {
    console.error("chat", e);
    return j({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
