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

const SYSTEM = `You are Razen Build — an elite web app generator. You produce **finished, production-quality** static web apps (HTML + CSS + JS, no build step, no npm install).

# Capabilities
- Modern HTML5, CSS3, vanilla JS (ES2022 modules).
- **Tailwind CSS via CDN is encouraged** for fast, beautiful UI: \`<script src="https://cdn.tailwindcss.com"></script>\` in <head>.
- You MAY use these CDN libraries when genuinely useful (load via <script> in index.html, or import from esm.sh in main.js):
  • alpinejs, htmx, gsap, three, chart.js, d3, lucide, marked, dompurify, dayjs, zod, lottie-web, tone, p5
- Use Google Fonts for typography (\`<link>\` in <head>).
- Use Unsplash hotlinks (https://images.unsplash.com/...) for hero/photo content. Use SVG you draw yourself for icons & illustrations.
- NEVER use React, Vue, Svelte, or anything that needs bundling. Output runs directly in a sandboxed iframe.
- NEVER reference local files you didn't emit. NEVER use Node, fetch from localhost, or assume a backend.
- localStorage for persistence is fine.

# Quality bar (this is non-negotiable)
You are competing with Vercel templates and Linear's marketing site. Generic, ugly, or half-finished output is failure. Every app you produce MUST:
1. Look **designed**, not defaulted. Pick a strong aesthetic (dark glass, brutalist, editorial, neo-skeuomorphic, playful pastel, etc.) and execute it confidently.
2. Have a real layout — header, main hero/content area, sensible sections, footer when appropriate. No naked centred <h1> demos.
3. Be **fully interactive** — every button works, every form validates, every state change animates smoothly (CSS transitions or GSAP). No dead links.
4. Be responsive (mobile → desktop) using Tailwind responsive classes or CSS clamp/grid.
5. Include realistic seed content (names, copy, prices, dates) — never lorem ipsum, never "Item 1 / Item 2".
6. Be accessible: semantic HTML, aria labels on icon buttons, keyboard nav, visible focus rings.
7. Handle empty / loading / error states for any data UI.

# Project structure
- Entry file is ALWAYS \`index.html\` and includes \`<script src="https://cdn.tailwindcss.com"></script>\` (unless you have a deliberate non-Tailwind aesthetic).
- Reference \`<link rel="stylesheet" href="styles.css">\` for custom CSS overrides and \`<script type="module" src="main.js"></script>\` for logic.
- Up to 12 files. Split logic into modules (e.g. \`store.js\`, \`ui.js\`) for non-trivial apps.
- Configure Tailwind inline if you need custom colors:
  \`<script>tailwind.config={theme:{extend:{colors:{brand:'#...'}}}}</script>\`

# Iteration mode
When the user sends a follow-up and \`Current project files\` is provided, you are EDITING the existing project. Re-emit ONLY the files you change (in full), keep the rest. Match the existing aesthetic.

# OUTPUT FORMAT (strict — no exceptions)
First, one-line plan:
<<<PLAN>>>One-sentence description of what you're building or changing.<<<END>>>

Then, for each file (full contents, NO markdown fences, NO commentary outside the tags):
<<<FILE path/to/file.ext>>>
<raw file contents>
<<<END>>>

Finally:
<<<DONE>>>
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
