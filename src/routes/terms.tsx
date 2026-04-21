import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms — Razen" }, { name: "description", content: "Razen terms of service." }] }),
  component: Terms,
});

function Terms() {
  return (
    <div className="min-h-screen">
      <Nav />
      <article className="mx-auto max-w-3xl px-5 py-16 md:py-24 prose-chat">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Last updated April 2026</p>
        <h1 className="mt-3 font-display text-5xl">Terms.</h1>
        <p>By using Razen you agree to these terms. They're short on purpose.</p>
        <h2>What you get</h2>
        <p>Access to Razen's chat interface and the routed models (Gemini Flash, Claude Haiku, Claude Sonnet) according to your plan. Credits are granted daily (Free) or monthly (Pro/Elite) and do not roll over.</p>
        <h2>Acceptable use</h2>
        <p>Don't use Razen to generate content that's illegal, abusive, or that violates the underlying provider policies (Anthropic / Google). Don't try to break the platform.</p>
        <h2>Refunds</h2>
        <p>Subscriptions are non-refundable but can be cancelled at any time from <a href="/settings/billing">Settings → Billing</a>. You retain access until the end of the current period.</p>
        <h2>Liability</h2>
        <p>Razen is provided as-is. We're not liable for indirect damages or for the accuracy of model outputs — verify anything that matters.</p>
        <h2>Contact</h2>
        <p>support@razen.app</p>
      </article>
    </div>
  );
}
