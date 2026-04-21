// Build-mode code generation. Streams a structured "<<<FILE path>>>...<<<END>>>"
// protocol so the client can render multi-file edits live, then save them.
//
// Uses Gemini Flash Lite (cheap & fast) for free + pro tiers, and Gemini Flash
// for elite. No frontier models here — Build mode is meant to iterate fast.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Credits-Remaining, X-Model, X-Cost",
};

const SYSTEM = `You are Razen Build — a precise web app code generator.

You produce a working static web app (HTML + CSS + JS, no build step, no npm).
You may use ES modules, modern DOM APIs, and CDN imports from esm.sh.
NEVER use React/Vue/frameworks that need bundling — output runs directly in a browser iframe.
NEVER reference local node_modules or files that don't exist.

OUTPUT FORMAT (strict — no exceptions):

First, write a one-line plan inside <<<PLAN>>>...<<<END>>>.
Then, for every file you create or replace, output exactly:

<<<FILE path/to/file.ext>>>
<full file contents — no markdown fences, no commentary>
<<<END>>>

You MUST output complete files, never partial diffs. Always include the entry HTML file.
The entry file is "index.html". It must <link> styles.css and <script type="module" src="main.js"></script>.
Keep the project to <= 8 files. Use semantic HTML, accessible markup, and a tasteful dark UI by default.
After all files, output: <<<DONE>>>
`;

interface Routed { model: string; cost: number; }
function route(tier: string, msgChars: number): Routed {
  const heavy = msgChars > 800;
  if (tier === "elite") return { model: "google/gemini-2.5-flash", cost: heavy ? 6 : 4 };
  if (tier === "pro") return { model: "google/gemini-2.5-flash-lite", cost: heavy ? 4 : 3 };
  return { model: "google/gemini-2.5-flash-lite", cost: heavy ? 3 : 2 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { messages, currentFiles } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) return j({ error: "messages required" }, 400);

    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return j({ error: "Sign in required" }, 401);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: u } = await userClient.auth.getUser(auth.slice(7));
    const user = u.user;
    if (!user) return j({ error: "Sign in required" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle();
    const tier = sub?.tier ?? "free";

    const last = messages[messages.length - 1];
    const lastText = typeof last?.content === "string" ? last.content : "";
    const routed = route(tier, lastText.length);

    const { data: newBal, error: dErr } = await admin.rpc("deduct_credit", { _user_id: user.id, _cost: routed.cost });
    if (dErr) return j({ error: "Credit check failed" }, 500);
    if (typeof newBal === "number" && newBal < 0) {
      return j({ error: `Out of credits — Build needs ${routed.cost}.` }, 402);
    }

    let context = "";
    if (currentFiles && typeof currentFiles === "object") {
      const list = Object.keys(currentFiles).slice(0, 12);
      if (list.length) {
        context = `\n\nCurrent project files:\n${list.map((p) => `- ${p} (${(currentFiles[p] || "").length} chars)`).join("\n")}\n\nYou may overwrite any of these. Always re-emit any file you change in full.`;
      }
    }

    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) return j({ error: "AI not configured" }, 500);

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: routed.model,
        stream: true,
        messages: [{ role: "system", content: SYSTEM + context }, ...messages],
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) return j({ error: "Too fast — pause and retry." }, 429);
      const t = await upstream.text();
      console.error("gateway", upstream.status, t);
      return j({ error: "AI gateway error" }, 500);
    }

    return new Response(upstream.body, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Credits-Remaining": String(newBal),
        "X-Model": routed.model,
        "X-Cost": String(routed.cost),
      },
    });
  } catch (e) {
    console.error("build-codegen", e);
    return j({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
