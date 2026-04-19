import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe, getWebhookSecret, PRICE_TO_TIER } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sig = request.headers.get("stripe-signature");
        if (!sig) return new Response("no signature", { status: 400 });
        const body = await request.text();

        const stripe = getStripe("sandbox");
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, sig, getWebhookSecret("sandbox"));
        } catch (e) {
          console.error("sig verify failed", e);
          return new Response("bad signature", { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const s = event.data.object as Stripe.Checkout.Session;
              if (s.mode !== "subscription" || !s.subscription) break;
              const sub = await stripe.subscriptions.retrieve(s.subscription as string);
              const userId = (sub.metadata?.user_id as string) || (s.metadata?.user_id as string) || (s.client_reference_id as string);
              if (!userId) { console.error("no user_id"); break; }
              const tier = resolveTier(sub);
              await upsertSub(userId, tier, sub, sub.customer as string);
              if (tier !== "free") await grantCredits(userId, tier);
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated": {
              const sub = event.data.object as Stripe.Subscription;
              const userId = sub.metadata?.user_id as string;
              if (!userId) break;
              const tier = resolveTier(sub);
              await upsertSub(userId, tier, sub, sub.customer as string);
              if (event.type === "customer.subscription.created" && tier !== "free") {
                await grantCredits(userId, tier);
              }
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const userId = sub.metadata?.user_id as string;
              if (!userId) break;
              await upsertSub(userId, "free", sub, sub.customer as string);
              break;
            }
          }
          return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (e) {
          console.error("webhook handler error", e);
          return new Response("handler error", { status: 500 });
        }
      },
    },
  },
});

function resolveTier(sub: Stripe.Subscription): "free" | "pro" | "elite" {
  const active = sub.status === "active" || sub.status === "trialing";
  if (!active) return "free";
  const priceId = sub.items?.data?.[0]?.price?.id;
  return (priceId && PRICE_TO_TIER[priceId]) || "free";
}

async function upsertSub(userId: string, tier: "free" | "pro" | "elite", sub: Stripe.Subscription, customer: string) {
  const cpeUnix =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end ??
    null;
  const periodEnd = cpeUnix ? new Date(cpeUnix * 1000).toISOString() : null;

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      tier,
      stripe_customer_id: customer,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd,
    },
    { onConflict: "user_id" },
  );
  if (error) console.error("upsert error", error);
}

async function grantCredits(userId: string, tier: "pro" | "elite") {
  const { error } = await supabaseAdmin.rpc("grant_subscription_credits", { _user_id: userId, _tier: tier });
  if (error) console.error("grant credits error", error);
}
