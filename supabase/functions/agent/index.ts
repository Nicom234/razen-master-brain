// Edge function backing the Razen Assistant chatbot.
//
// Wires the /backend/agents runtime to Supabase (auth, credits, memories,
// conversation history) and streams events back to the client as SSE.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import {
  AgentRuntime,
  SkillRegistry,
  ToolRegistry,
  defaultSkills,
  defaultTools,
} from "../../../backend/agents/index.ts";
import {
  deductCredits,
  ensureConversation,
  loadMemories,
  loadTier,
  routeCost,
  saveMessage,
} from "../../../backend/agents/supabase/adapter.ts";
import type { AgentMessage } from "../../../backend/agents/core/types.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Credits-Remaining, X-Model, X-Cost, X-Conversation-Id",
};

const skills = new SkillRegistry();
defaultSkills.forEach((s) => skills.register(s));

const tools = new ToolRegistry();
defaultTools.forEach((t) => tools.register(t));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json();
    const messages = body.messages as AgentMessage[] | undefined;
    const useWebSearch = Boolean(body.useWebSearch);
    const conversationId = (body.conversationId as string | null) ?? null;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages required" }, 400);
    }

    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: u } = await userClient.auth.getUser(auth.slice(7));
    if (!u.user) return json({ error: "Sign in required" }, 401);
    const userId = u.user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tier = await loadTier(admin, userId);
    const memories = await loadMemories(admin, userId, tier);

    const last = messages[messages.length - 1];
    const lastText = typeof last.content === "string"
      ? last.content
      : Array.isArray(last.content)
        ? last.content.map((p) => ("text" in p ? p.text : "")).join(" ")
        : "";
    const routed = routeCost(tier, lastText.length);

    const credit = await deductCredits(admin, userId, routed.cost);
    if (!credit.ok) {
      return json(
        {
          error:
            tier === "free"
              ? `Out of credits — this task needs ${routed.cost}. Free credits refill tomorrow, or upgrade for instant access.`
              : `Out of credits — this task needs ${routed.cost}. Upgrade your plan or wait for next month's reset.`,
        },
        402,
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);

    // Persist the user's message & ensure a conversation exists.
    const userText = typeof last.content === "string" ? last.content : lastText;
    const cid = await ensureConversation(admin, userId, conversationId, userText);
    await saveMessage(admin, cid, userId, "user", userText);

    const runtime = new AgentRuntime({
      skills,
      tools,
      apiKey,
      defaultModel: routed.model,
    });

    const encoder = new TextEncoder();
    let assistantText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const iter = runtime.run(
            {
              messages,
              userId,
              tier,
              useWebSearch,
              memories,
              model: routed.model,
            },
            { userId, tier, supabase: admin },
          );
          for await (const evt of iter) {
            if (evt.type === "assistant.delta") {
              const delta = (evt.data as { delta: string }).delta;
              assistantText += delta;
              // OpenAI-compatible SSE shape so the frontend can reuse its parser.
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    choices: [{ delta: { content: delta } }],
                  })}\n\n`,
                ),
              );
            } else {
              // Forward control events on a separate channel.
              controller.enqueue(
                encoder.encode(`event: agent\ndata: ${JSON.stringify(evt)}\n\n`),
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })}\n\n`,
            ),
          );
        } finally {
          if (assistantText) {
            await saveMessage(admin, cid, userId, "assistant", assistantText);
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Credits-Remaining": String(credit.balance),
        "X-Model": routed.model,
        "X-Cost": String(routed.cost),
        "X-Conversation-Id": cid,
      },
    });
  } catch (e) {
    console.error("agent edge fn", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
