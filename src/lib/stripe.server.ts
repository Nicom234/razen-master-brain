// Server-only Stripe client routed through the Lovable connector gateway.
// Do NOT import in client code.
import Stripe from "stripe";

const GATEWAY = "https://connector-gateway.lovable.dev/stripe";

export type StripeEnv = "sandbox" | "live";

export function getStripe(env: StripeEnv = "sandbox"): Stripe {
  const connectionKey = env === "live" ? process.env.STRIPE_LIVE_API_KEY : process.env.STRIPE_SANDBOX_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!connectionKey) throw new Error(`STRIPE_${env.toUpperCase()}_API_KEY missing`);
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

  return new Stripe(connectionKey, {
    httpClient: Stripe.createFetchHttpClient((url, init) => {
      const target = url.toString().replace("https://api.stripe.com", GATEWAY);
      return fetch(target, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers as HeadersInit | undefined).entries()),
          "X-Connection-Api-Key": connectionKey,
          "Lovable-API-Key": lovableKey,
        },
      });
    }),
  });
}

export function getWebhookSecret(env: StripeEnv = "sandbox"): string {
  const s = env === "live" ? process.env.PAYMENTS_LIVE_WEBHOOK_SECRET : process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET;
  if (!s) throw new Error(`PAYMENTS_${env.toUpperCase()}_WEBHOOK_SECRET missing`);
  return s;
}

export const PRICE_TO_TIER: Record<string, "pro" | "elite"> = {
  razen_pro_monthly: "pro",
  razen_elite_monthly: "elite",
};
