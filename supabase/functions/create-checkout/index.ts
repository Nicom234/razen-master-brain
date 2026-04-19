import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { priceId, customerEmail, userId, returnUrl, environment } = await req.json();
    if (!priceId || !/^[a-zA-Z0-9_-]+$/.test(priceId)) {
      return j({ error: "Invalid priceId" }, 400);
    }
    const env = (environment || "sandbox") as StripeEnv;
    const stripe = createStripeClient(env);

    const prices = await stripe.prices.list({ lookup_keys: [priceId], expand: ["data.product"] });
    if (!prices.data.length) return j({ error: "Price not found" }, 404);
    const price = prices.data[0];
    const isRecurring = price.type === "recurring";

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded",
      return_url: returnUrl || `${req.headers.get("origin")}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      ...(customerEmail && { customer_email: customerEmail }),
      ...(userId && {
        metadata: { user_id: userId, lookup_key: priceId },
        ...(isRecurring && { subscription_data: { metadata: { user_id: userId, lookup_key: priceId } } }),
      }),
    });

    return j({ clientSecret: session.client_secret });
  } catch (e) {
    console.error("create-checkout", e);
    return j({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
