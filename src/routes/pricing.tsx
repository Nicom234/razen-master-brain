import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
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
      { name: "description", content: "Free forever — 25 messages a day. Pro £29.99/mo. Elite £99.99/mo. Cancel anytime." },
      { property: "og:title", content: "Pricing — Razen" },
    ],
  }),
  component: PricingPage,
});

const tiers = [
  {
    id: "free", priceId: null, name: "Free", price: "£0", period: "forever",
    tagline: "Try the brain.",
    features: ["Razen on Gemini Flash", "25 messages every day", "All four modes", "Conversation history", "Web research"],
    excludes: ["Document upload", "Priority routing"],
    cta: "Start free", highlight: false,
  },
  {
    id: "pro", priceId: "razen_pro_monthly", name: "Pro", price: "£29.99", period: "/month",
    tagline: "For daily work.",
    features: ["Razen on Gemini 2.5 Pro", "2,500 messages / month", "Document upload (PDF, images)", "Web research with citations", "Priority routing", "Email support"],
    cta: "Upgrade to Pro", highlight: true,
  },
  {
    id: "elite", priceId: "razen_elite_monthly", name: "Elite", price: "£99.99", period: "/month",
    tagline: "For shipping fast.",
    features: ["Everything in Pro", "8,500 messages / month", "Long-horizon agent runs", "200k context window", "Early access to new modes", "Direct founder Slack"],
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
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/85">{f}</span>
                  </li>
                ))}
                {t.excludes?.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 opacity-50">
                    <X className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="text-foreground/70">{f}</span>
                  </li>
                ))}
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

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Cancel anytime. Prices in GBP. VAT may apply.
        </p>
      </section>
    </div>
  );
}
