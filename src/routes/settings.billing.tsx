import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { stripeEnv } from "@/lib/stripe";
import { Card, Field } from "./settings.index";

export const Route = createFileRoute("/settings/billing")({
  component: BillingPage,
});

type Sub = { tier: "free" | "pro" | "elite"; status: string | null; current_period_end: string | null; stripe_customer_id: string | null };

function BillingPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [sub, setSub] = useState<Sub | null>(null);
  const [credits, setCredits] = useState<{ balance: number; monthly_grant: number } | null>(null);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("subscriptions").select("tier,status,current_period_end,stripe_customer_id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setSub(data as Sub); });
    supabase.rpc("ensure_credits", { _user_id: user.id }).then(() => {
      supabase.from("credits").select("balance,monthly_grant").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (data) setCredits(data); });
    });
  }, [user]);

  const openPortal = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: { environment: stripeEnv, returnUrl: `${window.location.origin}/settings/billing` },
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (error || !data?.url) throw new Error(error?.message || data?.error || "Portal unavailable");
      window.open(data.url, "_blank");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  if (!user) return null;
  const tier = sub?.tier ?? "free";
  const renews = sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : null;
  const pct = credits ? Math.max(0, Math.min(100, (credits.balance / Math.max(credits.monthly_grant, 1)) * 100)) : 0;

  return (
    <div className="space-y-8">
      <Card title="Current plan" description="Manage your subscription, credits, and invoices.">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="font-display text-2xl capitalize">{tier}</p>
            <p className="text-sm text-muted-foreground">{tier === "free" ? "5 credits per day" : `${credits?.monthly_grant ?? "—"} credits / month`}{renews ? ` · renews ${renews}` : ""}</p>
          </div>
          <div className="ml-auto flex gap-2">
            {tier === "free" ? (
              <Link to="/pricing"><Button><Sparkles className="mr-1.5 h-4 w-4" />Upgrade</Button></Link>
            ) : (
              <Button onClick={openPortal} variant="outline">Manage subscription <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button>
            )}
          </div>
        </div>
        {credits && (
          <div className="mt-6">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Credits remaining</span>
              <span className="font-mono">{credits.balance.toLocaleString()} / {credits.monthly_grant.toLocaleString()}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </Card>

      <Card title="What you get" description={`On the ${tier} plan.`}>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {(tier === "elite" ? ELITE : tier === "pro" ? PRO : FREE).map((f) => (
            <li key={f} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />{f}</li>
          ))}
        </ul>
        {tier !== "elite" && (
          <div className="mt-5 rounded-lg border border-dashed border-border/70 bg-muted/40 p-4 text-sm">
            <span className="font-medium">Want more?</span> <Link to="/pricing" className="text-primary underline underline-offset-4">Compare plans</Link>
          </div>
        )}
      </Card>
    </div>
  );
}

const FREE = ["Gemini Flash routing", "5 credits / day", "Basic chat history", "Web search"];
const PRO = ["Claude Haiku 4.5 + Gemini Flash", "400 credits / month", "File & image uploads", "Long-term memory (20 facts)", "Daily briefing", "Export & share chats"];
const ELITE = ["Claude Sonnet 4.5 (Build/Plan/Write)", "1,500 credits / month", "Long-term memory (50 facts)", "Priority routing", "All Pro features"];
