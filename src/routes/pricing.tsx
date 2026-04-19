import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Razen AI" },
      { name: "description", content: "Free £0, Pro £29.99/mo, Elite £99.99/mo. Bring your own model keys. Cancel anytime." },
      { property: "og:title", content: "Pricing — Razen AI" },
      { property: "og:description", content: "Free, Pro, Elite. Cancel anytime." },
    ],
  }),
  component: PricingPage,
});

const tiers = [
  {
    id: "free", name: "Free", price: "£0", period: "/forever",
    features: ["Master Brain (Gemini 3 Flash)", "50 messages / month", "Web search", "Markdown + code blocks"],
    cta: "Start free", highlight: false,
  },
  {
    id: "pro", name: "Pro", price: "£29.99", period: "/month",
    features: ["Claude Sonnet 3.5 backend", "Unlimited messages", "Code execution sandbox", "Priority routing", "Conversation history"],
    cta: "Upgrade to Pro", highlight: true,
  },
  {
    id: "elite", name: "Elite", price: "£99.99", period: "/month",
    features: ["Claude Sonnet 4.5 backend", "Everything in Pro", "Long-horizon agent loops", "200k context window", "Priority support"],
    cta: "Go Elite", highlight: false,
  },
];

function PricingPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  const upgrade = async (plan: "pro" | "elite") => {
    if (!user) { nav({ to: "/signup" }); return; }
    setLoading(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ plan }),
      });
      const j = await res.json();
      if (!res.ok || !j.url) throw new Error(j.error || "Checkout failed");
      window.location.href = j.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <section className="mx-auto max-w-6xl px-4 py-20">
        <p className="font-mono text-xs text-primary">// pricing.tsv</p>
        <h1 className="mt-2 font-display text-5xl md:text-7xl">three tiers.</h1>
        <p className="mt-4 max-w-xl font-mono text-sm text-muted-foreground">Start free. Upgrade when you need more brain.</p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.id} className={`relative flex flex-col rounded p-6 ${t.highlight ? "terminal-border bg-card" : "border border-border/60 bg-card/50"}`}>
              {t.highlight && <div className="absolute -top-2 left-6 rounded-sm bg-primary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary-foreground">recommended</div>}
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{t.name}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-5xl">{t.price}</span>
                <span className="font-mono text-xs text-muted-foreground">{t.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5 font-mono text-xs">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {t.id === "free" ? (
                  <Link to={user ? "/app" : "/signup"} className="block"><Button variant={t.highlight ? "default" : "outline"} className="w-full font-mono">{user ? "open_app" : t.cta}</Button></Link>
                ) : (
                  <Button onClick={() => upgrade(t.id as "pro" | "elite")} disabled={loading === t.id} variant={t.highlight ? "default" : "outline"} className="w-full font-mono">
                    {loading === t.id ? "loading…" : t.cta}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
