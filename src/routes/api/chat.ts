import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM = "You are Razen AI — the Master Brain. Single unified agent. Research, reason, build. Direct, technical, useful. Markdown. Cite sources when relevant.";

const ANTHROPIC_MODELS: Record<string, string> = {
  pro: "claude-3-5-sonnet-20241022",
  elite: "claude-sonnet-4-5-20250929",
};

type Msg = { role: "user" | "assistant" | "system"; content: string };
type Tier = "free" | "pro" | "elite";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const { messages } = (await request.json()) as { messages: Msg[] };
          if (!Array.isArray(messages) || messages.length === 0) return j({ error: "messages required" }, 400);

          // Auth required
          const auth = request.headers.get("authorization");
          if (!auth?.startsWith("Bearer ")) return j({ error: "Sign in required" }, 401);

          const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
          const { data: u } = await supabase.auth.getUser(auth.slice(7));
          const user = u.user;
          if (!user) return j({ error: "Sign in required" }, 401);

          // Tier
          const { data: sub } = await supabaseAdmin.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle();
          const tier: Tier = (sub?.tier as Tier) ?? "free";

          // Deduct credit (atomic; refills daily for free)
          const { data: newBal, error: dErr } = await supabaseAdmin.rpc("deduct_credit", { _user_id: user.id });
          if (dErr) { console.error("deduct error", dErr); return j({ error: "Credit check failed" }, 500); }
          if (typeof newBal === "number" && newBal < 0) {
            return j({ error: tier === "free" ? "Out of daily credits. Upgrade or come back tomorrow." : "Out of credits. Upgrade your plan." }, 402);
          }

          const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
          const useAnthropic = (tier === "pro" || tier === "elite") && !!ANTHROPIC_KEY;

          const balanceHeader = { "X-Credits-Remaining": String(newBal ?? 0) };
          if (useAnthropic) return await streamAnthropic(messages, ANTHROPIC_MODELS[tier], balanceHeader);
          return await streamLovableAI(messages, balanceHeader);
        } catch (e) {
          console.error("chat error", e);
          return j({ error: e instanceof Error ? e.message : "unknown" }, 500);
        }
      },
    },
  },
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

async function streamLovableAI(messages: Msg[], extra: Record<string, string>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return j({ error: "LOVABLE_API_KEY missing" }, 500);
  const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      stream: true,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
    }),
  });
  if (!upstream.ok) {
    if (upstream.status === 429) return j({ error: "Rate limited" }, 429);
    if (upstream.status === 402) return j({ error: "AI credits exhausted" }, 402);
    const t = await upstream.text();
    console.error("lovable ai error", upstream.status, t);
    return j({ error: "AI gateway error" }, 500);
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...cors, ...extra },
  });
}

async function streamAnthropic(messages: Msg[], model: string, extra: Record<string, string>) {
  const key = process.env.ANTHROPIC_API_KEY!;
  const anthMessages = messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content }));

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, stream: true, system: SYSTEM, messages: anthMessages }),
  });

  if (!upstream.ok) {
    const t = await upstream.text();
    console.error("anthropic error", upstream.status, t);
    if (upstream.status === 429) return j({ error: "Rate limited" }, 429);
    if (upstream.status === 401) return j({ error: "Anthropic auth failed" }, 500);
    return j({ error: "Anthropic error" }, 500);
  }

  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      const send = (delta: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`));
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) !== -1) {
            let line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              const ev = JSON.parse(payload);
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") send(ev.delta.text);
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        console.error("anthropic stream error", e);
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...cors, ...extra },
  });
}
