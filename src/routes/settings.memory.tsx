import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "./settings.index";

export const Route = createFileRoute("/settings/memory")({
  component: MemoryPage,
});

type Mem = { id: string; content: string; created_at: string; source: string };

function MemoryPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [tier, setTier] = useState<"free" | "pro" | "elite">("free");
  const [mems, setMems] = useState<Mem[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  const load = async (uid: string) => {
    const [{ data: sub }, { data: m }] = await Promise.all([
      supabase.from("subscriptions").select("tier").eq("user_id", uid).maybeSingle(),
      supabase.from("memories").select("id,content,created_at,source").eq("user_id", uid).order("created_at", { ascending: false }),
    ]);
    if (sub?.tier) setTier(sub.tier as "free" | "pro" | "elite");
    if (m) setMems(m);
  };
  useEffect(() => { if (user) load(user.id); }, [user]);

  const add = async () => {
    if (!user || !draft.trim()) return;
    const { error } = await supabase.from("memories").insert({ user_id: user.id, content: draft.trim(), source: "manual" });
    if (error) return toast.error(error.message);
    setDraft(""); toast.success("Saved."); load(user.id);
  };

  const del = async (id: string) => {
    await supabase.from("memories").delete().eq("id", id);
    if (user) load(user.id);
  };

  if (!user) return null;
  const limit = tier === "elite" ? 50 : tier === "pro" ? 20 : 0;

  return (
    <div className="space-y-8">
      <Card title="Long-term memory" description={tier === "free" ? "Upgrade to Pro or Elite to teach Razen lasting facts about you." : `Razen remembers up to ${limit} facts and weaves them into every reply.`}>
        {tier === "free" ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/40 p-6 text-sm text-muted-foreground">
            Memory makes Razen feel like it actually knows you — your role, projects, voice, preferences. It ships on Pro and Elite.
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. I run a 4-person fintech startup based in London. Voice = direct, no filler." rows={3} />
              <div className="flex justify-end">
                <Button onClick={add} disabled={!draft.trim()}><Plus className="mr-1.5 h-4 w-4" />Save fact</Button>
              </div>
            </div>
            <div className="mt-6 space-y-2">
              {mems.length === 0 && <p className="text-sm text-muted-foreground">No memories yet. Add facts above and Razen will start using them.</p>}
              {mems.map((m) => (
                <div key={m.id} className="group flex items-start gap-3 rounded-lg border border-border/50 bg-background p-3 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  <p className="flex-1">{m.content}</p>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.source}</span>
                  <button onClick={() => del(m.id)} className="opacity-0 transition group-hover:opacity-100"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
