import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title: "Models & routing — Razen" },
      { name: "description", content: "How Razen selects a model for each task. Transparency on providers, data handling, and the routing logic behind every reply." },
    ],
  }),
  component: ModelsPage,
});

function ModelsPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <article className="mx-auto max-w-3xl px-5 py-16 md:py-24 prose-chat">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Transparency</p>
        <h1 className="mt-3 font-display text-5xl">Models &amp; routing.</h1>
        <p>Razen is a routing layer over frontier models. We don't train our own. We pick the right one for each task so you don't have to.</p>

        <h2>How routing works</h2>
        <p>Every message is classified by mode (Research, Write, Plan, Build), input length, and your plan. The router then assigns the model with the best price-for-quality fit. You can see which model answered any reply in the chat header.</p>

        <h2>Providers</h2>
        <ul>
          <li><strong>Anthropic</strong> — Claude Sonnet 4.5 and Claude Haiku 4.5, used for writing, planning and code on Pro and Elite plans.</li>
          <li><strong>Google (via Lovable AI gateway)</strong> — Gemini 2.5 Flash and Flash Lite, used for research and grounded web search across all plans.</li>
        </ul>

        <h2>Data handling</h2>
        <p>Prompts and attachments are forwarded to the selected provider over an authenticated TLS connection. Under our enterprise terms, neither Anthropic nor Google trains on your data. We retain chats so you can return to them; you can wipe everything from <a href="/settings/danger">Settings → Danger zone</a>.</p>

        <h2>Failover</h2>
        <p>If a provider is degraded, the router falls back to the closest equivalent on the same plan. You'll see a small "fallback" indicator in the message header when this happens.</p>

        <h2>Why we don't list a model in marketing</h2>
        <p>Models change. The right one in 6 months won't be the right one today. The product promise is the routing layer and the modes — not any specific brand name on the back end.</p>
      </article>
    </div>
  );
}
