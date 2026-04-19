import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getStripe, PRICE_TO_TIER } from "@/lib/stripe.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

          const { priceId } = (await request.json()) as { priceId: string };
          const tier = PRICE_TO_TIER[priceId];
          if (!tier) return j({ error: "Invalid price" }, 400);

          const stripe = getStripe("sandbox");
          const origin = request.headers.get("origin") || new URL(request.url).origin;

          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: u.user.email,
            client_reference_id: u.user.id,
            metadata: { user_id: u.user.id, tier },
            subscription_data: { metadata: { user_id: u.user.id, tier } },
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
