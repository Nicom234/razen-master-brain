import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Credits-Remaining, X-Model, X-Cost",
};

const SYSTEMS: Record<string, string> = {
  research: `You are Razen — Research mode. Operate like a top-tier analyst, not a generic chatbot.

Core rules:
1) First restate the exact question and the decision it should inform.
2) When web search is available, ground claims in multiple current sources and cite every non-obvious factual claim with [n] markers.
3) Distinguish clearly between verified facts, inference, and uncertainty.
4) Synthesize; do not dump sources. Compare trade-offs, contradictions, and consensus.
5) Default to crisp executive communication with strong information density.

Default output:
- TL;DR
- Key findings
- Analysis
- Recommendations / implications
- Sources

Never invent URLs, citations, or statistics.`,
  build: `You are Razen — Build mode. You are competing directly with the best AI product builders and code copilots.

Your job is to produce answers that are materially useful to a senior builder shipping a real product.

Standards:
1) Think through product strategy, UX, architecture, data flow, edge cases, failure states, and sequencing before answering.
2) Be concrete. Prefer exact components, flows, data shapes, interaction patterns, and implementation steps over generic advice.
3) If the user is building against competitors, explicitly optimize for differentiation, conversion, retention, and perceived quality.
4) When asked for product or website ideas, propose opinionated high-quality directions, not bland templates.
5) When asked for code or system design, return production-minded structure with sensible abstractions and validation.

Default output shape when relevant:
- Goal
- Recommended approach
- UX / product decisions
- Technical structure
- Edge cases / risks
- Next build steps

Avoid filler, repetition, and vague encouragement.`,
  write: `You are Razen — Write mode. Elite writer and editor.

Rules:
1) Match the user's target register exactly.
2) Prefer precise, modern, high-signal language over generic marketing fluff.
3) Make the copy feel expensive, confident, and clear.
4) If useful, improve structure, rhythm, and specificity instead of merely paraphrasing.
5) Return polished output, not process notes, unless the user asks for options.

When writing product, brand, or landing-page copy, optimize for clarity, memorability, and conversion.`,
  plan: `You are Razen — Plan mode. Elite operator and product strategist.

Rules:
1) Convert ambiguity into a decisive, sequenced plan.
2) Surface assumptions, dependencies, risks, mitigation, and what matters first.
3) Prioritize leverage and speed, not busywork.
4) Make plans actionable for real execution.
5) Include crisp definitions of done when appropriate.

Default output:
- Objective
- Assumptions
- Recommended sequence
- Risks / blockers
- Definition of done`,
};

type Tier = "free" | "pro" | "elite";
type Mode = "research" | "write" | "plan" | "build";

interface Routed {
  model: string;
  cost: number;
  reasoning: "low" | "medium" | "high" | null;
}

function route(tier: Tier, mode: Mode, msgChars: number): Routed {
  const heavy = msgChars > 1100 || mode === "build" || mode === "plan";
  const veryHeavy = msgChars > 2400 || (mode === "build" && msgChars > 1500);

  if (tier === "elite") {
    if (mode === "build") return { model: "google/gemini-3-flash-preview", cost: veryHeavy ? 12 : heavy ? 10 : 8, reasoning: "high" };
    if (mode === "plan") return { model: "google/gemini-3-flash-preview", cost: heavy ? 9 : 7, reasoning: "high" };
    if (mode === "write") return { model: "google/gemini-3-flash-preview", cost: heavy ? 6 : 5, reasoning: "medium" };
    return { model: "google/gemini-3-flash-preview", cost: heavy ? 4 : 3, reasoning: "medium" };
  }

  if (tier === "pro") {
    if (mode === "build") return { model: "google/gemini-3-flash-preview", cost: veryHeavy ? 8 : heavy ? 7 : 5, reasoning: "medium" };
    if (mode === "plan") return { model: "google/gemini-3-flash-preview", cost: heavy ? 6 : 5, reasoning: "medium" };
    if (mode === "write") return { model: "google/gemini-3-flash-preview", cost: heavy ? 4 : 3, reasoning: "medium" };
    return { model: "google/gemini-3-flash-preview", cost: heavy ? 3 : 2, reasoning: "low" };
  }

  if (mode === "build") return { model: "google/gemini-3-flash-preview", cost: veryHeavy ? 5 : heavy ? 4 : 3, reasoning: "medium" };
  if (mode === "plan") return { model: "google/gemini-3-flash-preview", cost: heavy ? 4 : 3, reasoning: "medium" };
  if (mode === "write") return { model: "google/gemini-3-flash-preview", cost: heavy ? 3 : 2, reasoning: "low" };
  return { model: "google/gemini-3-flash-preview", cost: heavy ? 2 : 1, reasoning: "low" };
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
    const tier = (sub?.tier as Tier) ?? "free";

    const selectedMode = (mode as Mode) || "research";
    const last = messages[messages.length - 1];
    const lastText = typeof last?.content === "string"
      ? last.content
      : Array.isArray(last?.content) ? last.content.map((part: { text?: string }) => part?.text || "").join(" ") : "";
    const routed = route(tier, selectedMode, lastText.length);

    const { data: newBal, error: dErr } = await admin.rpc("deduct_credit", { _user_id: user.id, _cost: routed.cost });
    if (dErr) {
      console.error("deduct", dErr);
      return j({ error: "Credit check failed" }, 500);
    }
    if (typeof newBal === "number" && newBal < 0) {
      return j({ error: tier === "free"
        ? `Out of credits — this task needs ${routed.cost}. Free credits refill tomorrow, or upgrade for instant access.`
        : `Out of credits — this task needs ${routed.cost}. Upgrade your plan or wait for next month's reset.` }, 402);
    }

    const baseSystem = SYSTEMS[selectedMode] || SYSTEMS.research;

    let memoryBlock = "";
    if (tier === "elite" || tier === "pro") {
      const limit = tier === "elite" ? 50 : 20;
      const { data: mems } = await admin.from("memories").select("content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
      if (mems && mems.length) {
        memoryBlock = `\n\n# What you remember about this user\n`
          + mems.map((row, i) => `${i + 1}. ${row.content}`).join("\n")
          + `\n\nUse these facts naturally. Don't recite them — use them to personalise voice, recall projects, and skip context the user has already given you.`;
      }
    }

    const tierTag = `\n\n# Tier\nThe user is on the ${tier.toUpperCase()} plan.${tier === "elite" ? " Treat them as a power user — denser, faster, more decisive." : ""}`;
    const system = baseSystem + memoryBlock + tierTag;

    return await streamLovable({
      system,
      messages,
      model: routed.model,
      useWebSearch: !!useWebSearch,
      cost: routed.cost,
      balance: newBal as number,
      reasoning: routed.reasoning,
    });
  } catch (e) {
    console.error("chat", e);
    return j({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

async function streamLovable(opts: {
  system: string;
  messages: unknown[];
  model: string;
  useWebSearch: boolean;
  cost: number;
  balance: number;
  reasoning: "low" | "medium" | "high" | null;
}) {
  const KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!KEY) return j({ error: "AI not configured" }, 500);

  const body: Record<string, unknown> = {
    model: opts.model,
    stream: true,
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
  };

  if (opts.reasoning) {
    body.reasoning = { effort: opts.reasoning };
  }
  if (opts.useWebSearch && opts.model.startsWith("google/")) {
    body.tools = [{ type: "google_search" }];
  }

  const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
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
      "X-Credits-Remaining": String(opts.balance),
      "X-Model": opts.model,
      "X-Cost": String(opts.cost),
    },
  });
}

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
