import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PRODUCTS: Record<"pro" | "elite", { product: string; pence: number }> = {
  pro: { product: "prod_U1M8BCCgXTdHPp", pence: 2999 },
  elite: { product: "prod_U1RwHm25JZxM7b", pence: 9999 },
};

export const Route = createFileRoute("/api/create-checkout")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization");
          if (!auth?.startsWith("Bearer ")) return j({ error: "Unauthorized" }, 401);

          const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
          const { data: u, error: uerr } = await supabase.auth.getUser(auth.slice(7));
          if (uerr || !u.user) return j({ error: "Unauthorized" }, 401);
          const user = u.user;

          const { plan } = (await request.json()) as { plan: "pro" | "elite" };
          if (plan !== "pro" && plan !== "elite") return j({ error: "Invalid plan" }, 400);

          const stripeKey = process.env.STRIPE_SECRET_KEY;
          if (!stripeKey) return j({ error: "Stripe not configured" }, 500);
          const stripe = new Stripe(stripeKey);

          const { product, pence } = PRODUCTS[plan];

          // Find or create monthly GBP price
          const prices = await stripe.prices.list({ product, active: true, currency: "gbp", limit: 100 });
          let price = prices.data.find((p) => p.recurring?.interval === "month" && p.unit_amount === pence);
          if (!price) {
            price = await stripe.prices.create({
              product,
              currency: "gbp",
              unit_amount: pence,
              recurring: { interval: "month" },
            });
          }

          const origin = request.headers.get("origin") || new URL(request.url).origin;

          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            line_items: [{ price: price.id, quantity: 1 }],
            customer_email: user.email,
            client_reference_id: user.id,
            metadata: { user_id: user.id, plan },
            subscription_data: { metadata: { user_id: user.id, plan } },
            success_url: `${origin}/app?upgraded=1`,
            cancel_url: `${origin}/pricing`,
          });

          return j({ url: session.url });
        } catch (e) {
          console.error("create-checkout error", e);
          return j({ error: e instanceof Error ? e.message : "unknown" }, 500);
        }
      },
    },
  },
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}
