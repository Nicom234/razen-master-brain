import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { getStripe, stripeEnv } from "@/lib/stripe";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Razen" },
      { name: "description", content: "Free forever. Pro £29.99/mo. Elite £99.99/mo. Cancel anytime." },
      { property: "og:title", content: "Pricing — Razen" },
    ],
  }),
  component: PricingPage,
});

const tiers = [
  {
    id: "free", priceId: null, name: "Free", price: "£0", period: "forever",
    tagline: "Try the brain.",
    features: [
      "25 credits, refilled every day",
      "All four modes — Research · Write · Plan · Build",
      "Powered by Gemini Flash",
      "Live web search with citations",
      "Conversation history",
    ],
    cta: "Start free", highlight: false,
  },
  {
    id: "pro", priceId: "razen_pro_monthly", name: "Pro", price: "£29.99", period: "/month",
    tagline: "For daily work.",
    features: [
      "Everything in Free, plus:",
      "400 credits / month",
      "Claude Haiku 4.5 for writing, planning & code",
      "Document & image upload (PDFs, screenshots)",
      "Markdown export of any chat",
      "Email support",
    ],
    cta: "Upgrade to Pro", highlight: true,
  },
  {
    id: "elite", priceId: "razen_elite_monthly", name: "Elite", price: "£99.99", period: "/month",
    tagline: "Your AI chief of staff.",
    features: [
      "Everything in Pro, plus:",
      "1,500 credits / month",
      "Claude Sonnet 4.5 — the best model on Earth for writing & strategy",
      "Long-term memory across every chat",
      "Smart routing — top-tier model per task",
      "Direct founder Slack",
    ],
    cta: "Go Elite", highlight: false,
  },
];

function PricingPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const upgrade = async (priceId: string) => {
    if (!user) { nav({ to: "/signup" }); return; }
    setLoading(priceId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
          customerEmail: user.email,
          userId: user.id,
          environment: stripeEnv,
          returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        },
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (error || !data?.clientSecret) throw new Error(error?.message || data?.error || "Checkout failed");
      setClientSecret(data.clientSecret);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(null);
    }
  };

  if (clientSecret) {
    return (
      <div className="min-h-screen">
        <Nav />
        <div className="mx-auto max-w-3xl px-5 py-12">
          <button
            onClick={() => setClientSecret(null)}
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >← Back to pricing</button>
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
            <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret: async () => clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        </div>
      </div>
    );
  }

  const isTest = stripeEnv === "sandbox";

  return (
    <div className="min-h-screen">
      <Nav />
      {isTest && (
        <div className="border-b border-amber-300/60 bg-amber-100/70 px-4 py-2 text-center text-xs text-amber-900">
          Test mode — use card <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any CVC.
        </div>
      )}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Pricing</p>
          <h1 className="mt-3 font-display text-5xl md:text-7xl">Pay for outcomes, not seats.</h1>
          <p className="mt-5 text-lg text-muted-foreground">Start free. Upgrade when Razen earns its keep.</p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.id}
              className={`relative flex flex-col rounded-3xl p-8 transition ${
                t.highlight
                  ? "border-2 border-primary bg-card shadow-card"
                  : "border border-border/70 bg-card/60 shadow-soft hover:shadow-card"
              }`}
            >
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Most popular
                </div>
              )}
              <h3 className="font-display text-2xl">{t.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-5xl">{t.price}</span>
                <span className="text-sm text-muted-foreground">{t.period}</span>
              </div>
              <ul className="mt-7 flex-1 space-y-3 text-sm">
                {t.features.map((f) => {
                  const isHeading = f.startsWith("Everything in");
                  return (
                    <li key={f} className={isHeading ? "pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground" : "flex items-start gap-2.5"}>
                      {!isHeading && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                      <span className={isHeading ? "" : "text-foreground/85"}>{f}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-8">
                {t.id === "free" ? (
                  <Link to={user ? "/app" : "/signup"} className="block">
                    <Button variant={t.highlight ? "default" : "outline"} className="h-11 w-full">{user ? "Open Razen" : t.cta}</Button>
                  </Link>
                ) : (
                  <Button
                    onClick={() => upgrade(t.priceId!)}
                    disabled={loading !== null}
                    variant={t.highlight ? "default" : "outline"}
                    className="h-11 w-full"
                  >
                    {loading === t.priceId ? "Loading…" : t.cta}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-border/70 bg-card/60 p-8 shadow-soft">
          <h3 className="font-display text-2xl">How credits work</h3>
          <p className="mt-2 text-sm text-muted-foreground">Razen routes each task to the best model for the job. Costs scale with the work, not the message count — so quick lookups stay cheap and deep work gets the firepower it deserves.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Quick</div>
              <div className="mt-1 font-display text-3xl">1–2 <span className="text-base text-muted-foreground">credits</span></div>
              <div className="mt-1 text-xs text-muted-foreground">Research, lookups, short Q&amp;A · Gemini Flash</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Smart</div>
              <div className="mt-1 font-display text-3xl">2–4 <span className="text-base text-muted-foreground">credits</span></div>
              <div className="mt-1 text-xs text-muted-foreground">Writing, planning, longer threads · Claude Haiku/Sonnet</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Heavy</div>
              <div className="mt-1 font-display text-3xl">6 <span className="text-base text-muted-foreground">credits</span></div>
              <div className="mt-1 text-xs text-muted-foreground">Build &amp; plan on Elite · Claude Sonnet 4.5 deep work</div>
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Cancel anytime. Prices in GBP. VAT may apply.
        </p>
      </section>
    </div>
  );
}
