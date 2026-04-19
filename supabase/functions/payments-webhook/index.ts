import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createStripeClient, verifyWebhook, PRICE_TO_TIER, type StripeEnv } from "../_shared/stripe.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const env = (new URL(req.url).searchParams.get("env") || "sandbox") as StripeEnv;
  let event;
  try { event = await verifyWebhook(req, env); }
  catch (e) { console.error("verify failed", e); return new Response("bad signature", { status: 400 }); }

  try {
    const stripe = createStripeClient(env);
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode !== "subscription" || !s.subscription) break;
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        const userId = sub.metadata?.user_id || s.metadata?.user_id || s.client_reference_id;
        if (!userId) break;
        const tier = resolveTier(sub);
        await upsert(userId, tier, sub);
        if (tier !== "free") await admin.rpc("grant_subscription_credits", { _user_id: userId, _tier: tier });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;
        if (!userId) break;
        const tier = resolveTier(sub);
        await upsert(userId, tier, sub);
        if (event.type === "customer.subscription.created" && tier !== "free") {
          await admin.rpc("grant_subscription_credits", { _user_id: userId, _tier: tier });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;
        if (userId) await upsert(userId, "free", sub);
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("handler", e);
    return new Response("error", { status: 500 });
  }
});

function resolveTier(sub: any): "free" | "pro" | "elite" {
  const active = sub.status === "active" || sub.status === "trialing";
  if (!active) return "free";
  const lookup = sub.metadata?.lookup_key as string | undefined;
  if (lookup && PRICE_TO_TIER[lookup]) return PRICE_TO_TIER[lookup];
  return "free";
}

async function upsert(userId: string, tier: "free" | "pro" | "elite", sub: any) {
  const cpe = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  await admin.from("subscriptions").upsert({
    user_id: userId,
    tier,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: cpe ? new Date(cpe * 1000).toISOString() : null,
  }, { onConflict: "user_id" });
}
