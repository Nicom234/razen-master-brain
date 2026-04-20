import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Credits-Remaining, X-Model, X-Cost",
};

const SYSTEMS: Record<string, string> = {
  research: `You are Razen — Research mode. Senior research analyst. 1) Restate the question precisely. 2) Cross-reference 3+ sources. 3) Cite every factual claim with [n] markers and a Sources list. 4) Flag uncertainty explicitly. Output: TL;DR (3 lines) → Key findings (bullets with citations) → Deeper analysis → Sources. Never invent URLs. Be direct.`,
  build: `You are Razen — Build mode. Staff-level engineer. Default to working code over explanation. 1) Confirm assumptions in 1 line. 2) Provide complete, runnable code (no "...rest unchanged"). 3) Note tradeoffs and edge cases. 4) Suggest tests. Use markdown code blocks with language tags. Be terse, technical, useful.`,
  write: `You are Razen — Write mode. Pulitzer-caliber editor. Match the user's requested register precisely. Defaults: clear over clever, concrete over abstract, active over passive, specific over vague. Cut every word that doesn't earn its place. On revisions, return the full revised text plus a brief change-log of what you cut and why.`,
  plan: `You are Razen — Plan mode. McKinsey-trained chief of staff. Turn ambiguity into structure. Always output: 1) Goal (one sentence). 2) Assumptions. 3) Step-by-step plan with owners and timing. 4) Risks + mitigations. 5) Definition of done. Tight bullets. Push back if the goal is unclear.`,
};

// Provider routing — only Gemini Flash variants and Claude (Anthropic).
// Free  → Gemini Flash Lite (cheap & fast)
// Pro   → Gemini Flash + Claude Haiku for write/plan
// Elite → Claude Sonnet 4.5 for write/plan/build (deep), Gemini Flash for research (fast + grounded)
type Tier = "free" | "pro" | "elite";
type Mode = "research" | "write" | "plan" | "build";
type Provider = "lovable" | "anthropic";

interface Routed { provider: Provider; model: string; cost: number; }

function route(tier: Tier, mode: Mode, msgChars: number): Routed {
  // Heavy task = long input or build/plan
  const heavy = msgChars > 1200 || mode === "build" || mode === "plan";

  if (tier === "elite") {
    if (mode === "build" || mode === "plan") return { provider: "anthropic", model: "claude-sonnet-4-5", cost: 6 };
    if (mode === "write") return { provider: "anthropic", model: "claude-sonnet-4-5", cost: 4 };
    return { provider: "lovable", model: "google/gemini-2.5-flash", cost: heavy ? 3 : 2 }; // research with grounding
  }
  if (tier === "pro") {
    if (mode === "build") return { provider: "anthropic", model: "claude-haiku-4-5", cost: 3 };
    if (mode === "write" || mode === "plan") return { provider: "anthropic", model: "claude-haiku-4-5", cost: 2 };
    return { provider: "lovable", model: "google/gemini-2.5-flash", cost: heavy ? 2 : 1 };
  }
  // free
  return { provider: "lovable", model: "google/gemini-2.5-flash-lite", cost: 1 };
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

    const m = (mode as Mode) || "research";
    // Approximate input weight from latest user message (or all if short)
    const last = messages[messages.length - 1];
    const lastText = typeof last?.content === "string"
      ? last.content
      : Array.isArray(last?.content) ? last.content.map((p: { text?: string }) => p?.text || "").join(" ") : "";
    const routed = route(tier, m, lastText.length);

    const { data: newBal, error: dErr } = await admin.rpc("deduct_credit", { _user_id: user.id, _cost: routed.cost });
    if (dErr) { console.error("deduct", dErr); return j({ error: "Credit check failed" }, 500); }
    if (typeof newBal === "number" && newBal < 0) {
      return j({ error: tier === "free"
        ? `Out of credits — this task needs ${routed.cost}. Free credits refill tomorrow, or upgrade for instant access.`
        : `Out of credits — this task needs ${routed.cost}. Upgrade your plan or wait for next month's reset.` }, 402);
    }

    const baseSystem = SYSTEMS[m] || SYSTEMS.research;

    // Memory — Pro and Elite both get long-term memory (Elite has it as a headline; Pro gets a lighter version)
    let memoryBlock = "";
    if (tier === "elite" || tier === "pro") {
      const limit = tier === "elite" ? 50 : 20;
      const { data: mems } = await admin.from("memories").select("content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
      if (mems && mems.length) {
        memoryBlock = `\n\n# What you remember about this user\n` +
          mems.map((row, i) => `${i + 1}. ${row.content}`).join("\n") +
          `\n\nUse these facts naturally. Don't recite them — use them to personalise voice, recall projects, and skip context the user has already given you.`;
      }
    }

    const tierTag = `\n\n# Tier\nThe user is on the ${tier.toUpperCase()} plan.${tier === "elite" ? " Treat them as a power user — denser, faster, more decisive." : ""}`;
    const system = baseSystem + memoryBlock + tierTag;

    if (routed.provider === "anthropic") {
      return await streamAnthropic({ system, messages, model: routed.model, cost: routed.cost, balance: newBal as number });
    }
    return await streamLovable({ system, messages, model: routed.model, useWebSearch: !!useWebSearch, cost: routed.cost, balance: newBal as number });
  } catch (e) {
    console.error("chat", e);
    return j({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

async function streamLovable(opts: { system: string; messages: unknown[]; model: string; useWebSearch: boolean; cost: number; balance: number }) {
  const KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!KEY) return j({ error: "AI not configured" }, 500);
  const body: Record<string, unknown> = {
    model: opts.model,
    stream: true,
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
  };
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

// Convert OpenAI-style messages to Anthropic format.
type AnyMsg = { role: string; content: unknown };
function toAnthropic(messages: AnyMsg[]): { role: "user" | "assistant"; content: unknown }[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      if (typeof m.content === "string") return { role: m.role as "user" | "assistant", content: m.content };
      if (Array.isArray(m.content)) {
        const parts = m.content.map((p: { type?: string; text?: string; image_url?: { url?: string } }) => {
          if (p.type === "text") return { type: "text", text: p.text || "" };
          if (p.type === "image_url" && p.image_url?.url?.startsWith("data:")) {
            const match = p.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
          }
          return { type: "text", text: "" };
        });
        return { role: m.role as "user" | "assistant", content: parts };
      }
      return { role: m.role as "user" | "assistant", content: String(m.content ?? "") };
    });
}

async function streamAnthropic(opts: { system: string; messages: unknown[]; model: string; cost: number; balance: number }) {
  const KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!KEY) return j({ error: "Anthropic key not configured" }, 500);

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 4096,
      stream: true,
      system: opts.system,
      messages: toAnthropic(opts.messages as AnyMsg[]),
    }),
  });

  if (!upstream.ok) {
    if (upstream.status === 429) return j({ error: "Anthropic rate limit — try again in a moment." }, 429);
    const t = await upstream.text();
    console.error("anthropic", upstream.status, t);
    return j({ error: "Anthropic error" }, 500);
  }

  // Re-encode Anthropic SSE as OpenAI-style chat.completions chunks so the existing client parser works unchanged.
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).replace(/\r$/, "");
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                const chunk = { choices: [{ delta: { content: evt.delta.text } }] };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              } else if (evt.type === "message_stop") {
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              }
            } catch { /* ignore parse errors */ }
          }
        }
        controller.close();
      } catch (e) {
        console.error("anthropic stream", e);
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
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
