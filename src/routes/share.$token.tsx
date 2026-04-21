import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/share/$token")({
  head: () => ({ meta: [{ title: "Shared chat — Razen" }, { name: "description", content: "A read-only Razen conversation." }] }),
  component: SharePage,
});

type Row = { role: string; content: string; created_at: string; title: string };

function SharePage() {
  const { token } = Route.useParams();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_shared_chat", { _token: token }).then(({ data, error }) => {
      if (error || !data || data.length === 0) setErr("This link is invalid or has been revoked.");
      else setRows(data as Row[]);
    });
  }, [token]);

  if (err) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">{err}</div>;
  if (!rows) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  const title = rows[0]?.title || "Shared chat";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background font-display text-sm">R</div><span className="font-display">Razen</span></a>
          <a href="/signup" className="text-xs text-muted-foreground hover:text-foreground">Try Razen free →</a>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Shared conversation</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">{title}</h1>
        <div className="mt-8 space-y-6">
          {rows.map((r, i) => (
            <div key={i} className={`rounded-2xl border border-border/60 p-5 ${r.role === "user" ? "bg-muted/40" : "bg-card"}`}>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{r.role === "user" ? "You" : "Razen"}</p>
              <div className="prose-chat">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{r.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-xl border border-border/60 bg-card p-6 text-center shadow-soft">
          <Sparkles className="mx-auto h-5 w-5 text-primary" />
          <p className="mt-2 font-display text-2xl">Want your own AI employee?</p>
          <a href="/signup" className="mt-3 inline-block rounded-md bg-foreground px-5 py-2 text-sm text-background">Try Razen free</a>
        </div>
      </article>
    </div>
  );
}
