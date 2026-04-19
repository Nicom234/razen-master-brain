import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Plus, Trash2, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type Memory = { id: string; content: string; created_at: string };

export function MemoryPanel({ userId, tier, onClose }: { userId: string; tier: "free" | "pro" | "elite"; onClose: () => void }) {
  const [items, setItems] = useState<Memory[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const isElite = tier === "elite";

  const load = async () => {
    const { data } = await supabase.from("memories").select("id,content,created_at").eq("user_id", userId).order("created_at", { ascending: false });
    if (data) setItems(data);
  };

  useEffect(() => { if (isElite) load(); }, [userId, isElite]);

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    setLoading(true);
    const { error } = await supabase.from("memories").insert({ user_id: userId, content: t });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setDraft("");
    toast.success("Razen will remember that.");
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("memories").delete().eq("id", id);
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg rounded-3xl border border-border/70 bg-card p-7 shadow-card">
        <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground text-background"><Brain className="h-4 w-4" /></div>
          <div>
            <h2 className="font-display text-2xl">Memory</h2>
            <p className="text-xs text-muted-foreground">Facts Razen recalls across every chat.</p>
          </div>
        </div>

        {!isElite ? (
          <div className="mt-7 rounded-2xl border border-border/70 bg-background/60 p-6 text-center">
            <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Memory is an Elite feature.</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Razen remembers your projects, voice, goals, and preferences — so you stop re-explaining yourself.</p>
            <a href="/pricing"><Button className="mt-5 h-10">Upgrade to Elite</Button></a>
          </div>
        ) : (
          <>
            <div className="mt-6">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. I'm building a B2B SaaS for accountants. My writing voice is short, dry, no exclamation marks."
                rows={3}
                className="resize-none"
              />
              <Button onClick={add} disabled={loading || !draft.trim()} className="mt-2 w-full">
                <Plus className="mr-1.5 h-4 w-4" />Remember this
              </Button>
            </div>

            <div className="mt-6 max-h-72 space-y-2 overflow-y-auto">
              {items.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No memories yet. Add a few to make Razen feel personal.</p>
              ) : items.map((m) => (
                <div key={m.id} className="group flex items-start gap-2 rounded-xl border border-border/60 bg-background/60 p-3 text-sm">
                  <span className="flex-1">{m.content}</span>
                  <button onClick={() => remove(m.id)} className="opacity-0 transition group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
