import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM = "You are Razen AI — the Master Brain. Single unified agent. Research the live web, execute real actions, reason across long horizons. Direct, technical, useful. Markdown. Cite sources.";

const ANTHROPIC_MODELS: Record<string, string> = {
  pro: "claude-3-5-sonnet-20241022",
  elite: "claude-sonnet-4-5-20250929",
};

type Msg = { role: "user" | "assistant" | "system"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const { messages, tier } = (await request.json()) as { messages: Msg[]; tier: "free" | "pro" | "elite" };
          if (!Array.isArray(messages) || messages.length === 0) {
            return json({ error: "messages required" }, 400);
          }

          // Auth: identify user (best effort)
          let userId: string | null = null;
          const auth = request.headers.get("authorization");
          if (auth?.startsWith("Bearer ")) {
            try {
              const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
              const { data } = await supabase.auth.getUser(auth.slice(7));
              userId = data.user?.id ?? null;
            } catch { /* ignore */ }
          }
          // Free tier requires auth (prevents abuse). Allow unauth to fail soft → free Lovable AI.
          void userId;

          const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
          const useAnthropic = (tier === "pro" || tier === "elite") && !!ANTHROPIC_KEY;

          if (useAnthropic) {
            return await streamAnthropic(messages, ANTHROPIC_MODELS[tier]);
          }
          return await streamLovableAI(messages);
        } catch (e) {
          console.error("chat error", e);
          return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

async function streamLovableAI(messages: Msg[]) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);
  const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      stream: true,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
    }),
  });
  if (!upstream.ok) {
    if (upstream.status === 429) return json({ error: "Rate limited" }, 429);
    if (upstream.status === 402) return json({ error: "Credits exhausted" }, 402);
    const t = await upstream.text();
    console.error("lovable ai error", upstream.status, t);
    return json({ error: "AI gateway error" }, 500);
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...cors },
  });
}

async function streamAnthropic(messages: Msg[], model: string) {
  const key = process.env.ANTHROPIC_API_KEY!;
  // Anthropic format: system separate; messages alternate user/assistant
  const anthMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: SYSTEM,
      messages: anthMessages,
    }),
  });

  if (!upstream.ok) {
    const t = await upstream.text();
    console.error("anthropic error", upstream.status, t);
    if (upstream.status === 429) return json({ error: "Rate limited" }, 429);
    if (upstream.status === 401) return json({ error: "Anthropic auth failed" }, 500);
    return json({ error: "Anthropic error" }, 500);
  }

  // Translate Anthropic SSE → OpenAI delta SSE
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
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
                send(ev.delta.text);
              }
            } catch { /* ignore partial */ }
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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...cors },
  });
}
