// supabase/functions/_shared/stripe.ts
import Stripe from "https://esm.sh/stripe@18.5.0";

export type StripeEnv = "sandbox" | "live";

const GATEWAY = "https://connector-gateway.lovable.dev/stripe";

export function getConnectionApiKey(env: StripeEnv): string {
  const k = env === "sandbox"
    ? Deno.env.get("STRIPE_SANDBOX_API_KEY")
    : Deno.env.get("STRIPE_LIVE_API_KEY");
  if (!k) throw new Error(`STRIPE_${env.toUpperCase()}_API_KEY not configured`);
  return k;
}

export function createStripeClient(env: StripeEnv): Stripe {
  const conn = getConnectionApiKey(env);
  const lov = Deno.env.get("LOVABLE_API_KEY");
  if (!lov) throw new Error("LOVABLE_API_KEY not configured");
  return new Stripe(conn, {
    httpClient: Stripe.createFetchHttpClient((url: string | URL, init?: RequestInit) => {
      const target = url.toString().replace("https://api.stripe.com", GATEWAY);
      return fetch(target, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers).entries()),
          "X-Connection-Api-Key": conn,
          "Lovable-API-Key": lov,
        },
      });
    }),
  });
}

export async function verifyWebhook(req: Request, env: StripeEnv): Promise<{ type: string; data: { object: any } }> {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret = env === "sandbox"
    ? Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : Deno.env.get("PAYMENTS_LIVE_WEBHOOK_SECRET");
  if (!secret) throw new Error("Webhook secret not configured");
  if (!sig || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1: string[] = [];
  for (const part of sig.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v;
    if (k === "v1") v1.push(v);
  }
  if (!timestamp || v1.length === 0) throw new Error("Invalid signature");
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error("Timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!v1.includes(expected)) throw new Error("Invalid webhook signature");
  return JSON.parse(body);
}

export const PRICE_TO_TIER: Record<string, "pro" | "elite"> = {
  razen_pro_monthly: "pro",
  razen_elite_monthly: "elite",
};
