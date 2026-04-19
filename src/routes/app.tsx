import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ArrowUp, LogOut, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Master Brain — Razen AI" }, { name: "description", content: "Razen AI chat console." }] }),
  validateSearch: (s: Record<string, unknown>) => ({ upgraded: typeof s.upgraded === "string" ? s.upgraded : undefined }),
  component: AppPage,
});

type Msg = { role: "user" | "assistant"; content: string };
type Tier = "free" | "pro" | "elite";

function AppPage() {
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [tier, setTier] = useState<Tier>("free");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const search = Route.useSearch() as { upgraded?: string };

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.tier) setTier(data.tier as Tier); });
  }, [user]);

  useEffect(() => {
    if (search?.upgraded) {
      toast.success("Subscription active. Welcome to the Master Brain.");
      nav({ to: "/app", search: {}, replace: true });
    }
  }, [search, nav]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    let acc = "";
    const upsert = (delta: string) => {
      acc += delta;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: acc } : m);
        return [...prev, { role: "assistant", content: acc }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ messages: next, tier }),
      });

      if (!resp.ok) {
        if (resp.status === 429) toast.error("Rate limited. Try again in a moment.");
        else if (resp.status === 402) toast.error("AI credits exhausted. Upgrade or add credits.");
        else toast.error(`Error ${resp.status}`);
        setStreaming(false);
        return;
      }
      if (!resp.body) throw new Error("No stream");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const r = await reader.read();
        if (r.done) break;
        buf += decoder.decode(r.value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) upsert(c);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stream failed");
    } finally {
      setStreaming(false);
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center font-mono text-xs text-muted-foreground">[booting…]</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-mono text-sm font-semibold">
            <Terminal className="h-4 w-4 text-primary" />
            <span>razen<span className="text-primary">/</span>ai</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">{tier}</span>
            {tier === "free" && (
              <Link to="/pricing"><Button size="sm" variant="ghost" className="h-8 font-mono text-xs"><Sparkles className="mr-1 h-3 w-3" />upgrade</Button></Link>
            )}
            <Button size="sm" variant="ghost" className="h-8 font-mono text-xs" onClick={signOut}><LogOut className="h-3 w-3" /></Button>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8">
          {messages.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-mono text-xs text-primary">[READY]</p>
              <h2 className="mt-3 font-display text-4xl md:text-5xl">master_brain.</h2>
              <p className="mt-3 font-mono text-xs text-muted-foreground">Ask anything. Research, code, plan.<span className="terminal-cursor" /></p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div className={m.role === "user"
                    ? "max-w-[85%] rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 font-mono text-sm"
                    : "max-w-full"
                  }>
                    {m.role === "assistant" ? (
                      <div className="prose-chat font-mono text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{m.content || "…"}</ReactMarkdown>
                      </div>
                    ) : m.content}
                  </div>
                </div>
              ))}
              {streaming && messages[messages.length - 1]?.role === "user" && (
                <div className="font-mono text-xs text-muted-foreground"><span className="terminal-cursor">thinking</span></div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2 rounded-lg p-2 terminal-border">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="$ ask the brain…"
              rows={1}
              className="min-h-[40px] flex-1 resize-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0"
            />
            <Button onClick={send} disabled={!input.trim() || streaming} size="icon" className="h-9 w-9 shrink-0">
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-center font-mono text-[10px] text-muted-foreground">enter to send · shift+enter for newline</p>
        </div>
      </div>
    </div>
  );
}
