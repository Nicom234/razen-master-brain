import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageSquare, Brain, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/usage")({
  head: () => ({ meta: [{ title: "Usage — Razen" }, { name: "description", content: "See how you use Razen — credits, chats, memories, trends." }] }),
  component: UsagePage,
});

function UsagePage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState({ chats: 0, memories: 0, credits: 0, monthly: 0 });
  const [byDay, setByDay] = useState<{ day: string; n: number }[]>([]);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [chats, mems, creditRow, recent] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("credits").select("balance,monthly_grant").eq("user_id", user.id).maybeSingle(),
        supabase.from("messages").select("created_at").eq("user_id", user.id).eq("role", "user").gte("created_at", since),
      ]);
      const buckets = new Map<string, number>();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      recent.data?.forEach((m) => {
        const d = m.created_at.slice(0, 10);
        if (buckets.has(d)) buckets.set(d, (buckets.get(d) || 0) + 1);
      });
      setByDay(Array.from(buckets.entries()).map(([day, n]) => ({ day, n })));
      setStats({
        chats: chats.count ?? 0,
        memories: mems.count ?? 0,
        credits: creditRow.data?.balance ?? 0,
        monthly: creditRow.data?.monthly_grant ?? 0,
      });
    })();
  }, [user]);

  if (!user) return null;
  const max = Math.max(1, ...byDay.map((d) => d.n));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-5">
          <Link to="/app" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to Razen</Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-display text-4xl md:text-5xl">Usage</h1>
        <p className="mt-2 text-muted-foreground">A clean view of how you've been using Razen.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat icon={Zap} label="Credits left" value={stats.credits.toLocaleString()} hint={`of ${stats.monthly.toLocaleString()}`} />
          <Stat icon={MessageSquare} label="Total chats" value={stats.chats.toLocaleString()} />
          <Stat icon={Brain} label="Memories" value={stats.memories.toLocaleString()} />
        </div>

        <section className="mt-8 rounded-xl border border-border/60 bg-card p-6 shadow-soft">
          <h2 className="font-display text-xl">Last 14 days</h2>
          <p className="text-sm text-muted-foreground">Messages sent per day.</p>
          <div className="mt-6 flex h-40 items-end gap-1.5">
            {byDay.map((d) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80 transition group-hover:bg-primary"
                  style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n > 0 ? 4 : 0 }}
                  title={`${d.day}: ${d.n}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{byDay[0]?.day.slice(5)}</span>
            <span>{byDay[byDay.length - 1]?.day.slice(5)}</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Zap; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-3 font-display text-3xl">{value}</p>
      <p className="text-xs text-muted-foreground">{label}{hint && <span className="ml-1">· {hint}</span>}</p>
    </div>
  );
}
