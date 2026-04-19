import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!stripeKey || !whSecret) return new Response("missing config", { status: 500 });

        const sig = request.headers.get("stripe-signature");
        if (!sig) return new Response("no signature", { status: 400 });
        const body = await request.text();

        const stripe = new Stripe(stripeKey);
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, sig, whSecret);
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
              const plan = (sub.metadata?.plan as string) || (s.metadata?.plan as string);
              if (!userId) { console.error("no user_id"); break; }
              if (!sub.metadata?.user_id || !sub.metadata?.plan) {
                await stripe.subscriptions.update(sub.id, { metadata: { user_id: userId, plan: plan || "pro" } });
              }
              await upsertSub(userId, plan, sub, s.customer as string);
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const userId = sub.metadata?.user_id as string;
              const plan = sub.metadata?.plan as string;
              if (!userId) { console.error("no user_id in sub metadata"); break; }
              await upsertSub(userId, plan, sub, sub.customer as string);
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

async function upsertSub(userId: string, plan: string | undefined, sub: Stripe.Subscription, customer: string) {
  const active = sub.status === "active" || sub.status === "trialing";
  const tier = active && (plan === "pro" || plan === "elite") ? plan : "free";
  // current_period_end is on the subscription items in newer API, fall back to sub root
  const cpeUnix =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end ??
    null;
  const periodEnd = cpeUnix ? new Date(cpeUnix * 1000).toISOString() : null;

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      tier: tier as "free" | "pro" | "elite",
      stripe_customer_id: customer,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd,
    },
    { onConflict: "user_id" },
  );
  if (error) console.error("upsert error", error);
}
