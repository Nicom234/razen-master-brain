import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare, Trash2, Pin, Search, Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History — Razen" }, { name: "description", content: "Search, pin, share and manage every chat." }] }),
  component: HistoryPage,
});

type Conv = { id: string; title: string; updated_at: string; pinned: boolean };

function HistoryPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  const load = async (uid: string) => {
    const { data } = await supabase.from("conversations").select("id,title,updated_at,pinned").eq("user_id", uid).order("pinned", { ascending: false }).order("updated_at", { ascending: false });
    if (data) setConvs(data as Conv[]);
  };
  useEffect(() => { if (user) load(user.id); }, [user]);

  const togglePin = async (c: Conv) => {
    await supabase.from("conversations").update({ pinned: !c.pinned }).eq("id", c.id);
    if (user) load(user.id);
  };

  const del = async (id: string) => {
    if (!confirm("Delete this chat?")) return;
    await supabase.from("messages").delete().eq("conversation_id", id);
    await supabase.from("conversations").delete().eq("id", id);
    if (user) load(user.id);
  };

  const share = async (c: Conv) => {
    if (!user) return;
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase.from("share_tokens").insert({ user_id: user.id, conversation_id: c.id, token });
    if (error) return toast.error(error.message);
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success("Share link copied to clipboard.");
  };

  const filtered = convs.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));

  if (!user) return null;
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-5">
          <Link to="/app" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to Razen</Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-display text-4xl md:text-5xl">Chat history</h1>
        <p className="mt-2 text-muted-foreground">{convs.length.toLocaleString()} conversations. Search, pin, share, or delete.</p>

        <div className="mt-6 flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title…" className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
        </div>

        <div className="mt-6 divide-y divide-border/50 rounded-xl border border-border/60 bg-card">
          {filtered.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted-foreground">No chats {q ? "match" : "yet"}.</p>
          ) : filtered.map((c) => (
            <div key={c.id} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-accent/30">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <Link to="/app" search={{ open: c.id }} className="flex-1 truncate text-sm">
                {c.pinned && <Pin className="mr-1.5 inline h-3 w-3 text-primary" />}
                {c.title}
              </Link>
              <span className="hidden text-xs text-muted-foreground sm:block">{new Date(c.updated_at).toLocaleDateString()}</span>
              <div className="flex items-center gap-1 opacity-60 transition group-hover:opacity-100">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => togglePin(c)} title={c.pinned ? "Unpin" : "Pin"}><Pin className={`h-3.5 w-3.5 ${c.pinned ? "fill-primary text-primary" : ""}`} /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => share(c)} title="Share read-only link"><Share2 className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => del(c.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
