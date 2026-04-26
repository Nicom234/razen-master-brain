import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ArrowUp, LogOut, Sparkles, Zap, Plus, Search, PenTool, ListChecks, Code2, Globe, Paperclip, X, MessageSquare, Trash2, Settings, Brain, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { stripeEnv } from "@/lib/stripe";
import { MemoryPanel } from "@/components/MemoryPanel";
import { WriteWorkspace } from "@/components/write/WriteWorkspace";
import { PlanWorkspace } from "@/components/plan/PlanWorkspace";
import { ResearchLab } from "@/components/research/ResearchLab";

type BuildWorkspaceProps = {
  tier: "free" | "pro" | "elite";
  onExitBuild: () => void;
  onCreditsChange: (credits: number | null) => void;
};

function BuildWorkspaceFallback({ onExitBuild }: BuildWorkspaceProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Code2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="font-display text-2xl tracking-tight">Build workspace is recovering</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Build mode now has a crash-proof fallback, so the app won’t blank even if the dedicated build module fails to load during preview refreshes.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload preview
          </Button>
          <Button onClick={onExitBuild}>Exit build</Button>
        </div>
      </div>
    </div>
  );
}

const buildWorkspaceModules = import.meta.glob("../components/build/BuildWorkspace.tsx", { eager: true }) as Record<
  string,
  { BuildWorkspace?: typeof BuildWorkspaceFallback }
>;

const BuildWorkspaceResolved =
  buildWorkspaceModules["../components/build/BuildWorkspace.tsx"]?.BuildWorkspace ?? BuildWorkspaceFallback;

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Razen" }, { name: "description", content: "Your AI employee." }] }),
  validateSearch: (s: Record<string, unknown>): { upgraded?: string } => typeof s.upgraded === "string" ? { upgraded: s.upgraded } : {},
  component: AppPage,
});

type Source = { n: number; title: string; url: string; domain: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };
type Tier = "free" | "pro" | "elite";
type Mode = "research" | "write" | "plan" | "build";
type Conv = { id: string; title: string; updated_at: string; preview?: string };

const MODES: { id: Mode; label: string; icon: typeof Search; hint: string }[] = [
  { id: "research", label: "Research", icon: Search, hint: "Cited research with live web sources" },
  { id: "write", label: "Write", icon: PenTool, hint: "Editorial-grade drafting and polishing" },
  { id: "plan", label: "Plan", icon: ListChecks, hint: "Structured plans with owners and risks" },
  { id: "build", label: "Build", icon: Code2, hint: "Production-quality runnable code" },
];

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

function AppPage() {
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [tier, setTier] = useState<Tier>("free");
  const [credits, setCredits] = useState<number | null>(null);
  const [monthlyGrant, setMonthlyGrant] = useState<number>(25);
  const [stats, setStats] = useState<{ chats: number; memories: number }>({ chats: 0, memories: 0 });
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState<Mode>("research");
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string; type: string } | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [memOpen, setMemOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const search = Route.useSearch() as { upgraded?: string };

  // Estimated cost preview (mirrors edge `route()` heuristics).
  // Build mode uses cheaper models via build-codegen and has its own scale.
  const estimatedCost = (() => {
    const heavy = input.length > 1100 || mode === "plan";
    const veryHeavy = input.length > 2400 || (mode === "build" && input.length > 1500);
    if (mode === "build") {
      if (tier === "elite") return veryHeavy ? 12 : heavy ? 10 : 8;
      if (tier === "pro") return veryHeavy ? 8 : heavy ? 7 : 5;
      return veryHeavy ? 5 : heavy ? 4 : 3;
    }
    if (tier === "elite") {
      if (mode === "plan") return heavy ? 9 : 7;
      if (mode === "write") return heavy ? 6 : 5;
      return heavy ? 4 : 3;
    }
    if (tier === "pro") {
      if (mode === "plan") return heavy ? 6 : 5;
      if (mode === "write") return heavy ? 4 : 3;
      return heavy ? 3 : 2;
    }
    if (mode === "plan") return heavy ? 4 : 3;
    if (mode === "write") return heavy ? 3 : 2;
    return heavy ? 2 : 1;
  })();

  const modelLabel = (id: string | null) => {
    if (!id) return "";
    if (id.includes("gemini-3-flash")) return "Gemini 3 Flash";
    if (id.includes("flash-lite")) return "Gemini Flash Lite";
    if (id.includes("flash")) return "Gemini Flash";
    if (id.includes("gpt-5")) return "GPT-5";
    return id;
  };

  const exportChat = () => {
    if (messages.length === 0) { toast.error("Nothing to export yet."); return; }
    const md = messages.map((m) => `## ${m.role === "user" ? "You" : "Razen"}\n\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([`# Razen chat — ${new Date().toLocaleString()}\n\n${md}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `razen-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  const refreshCredits = async (uid: string) => {
    await supabase.rpc("ensure_credits", { _user_id: uid });
    const { data } = await supabase.from("credits").select("balance,monthly_grant").eq("user_id", uid).maybeSingle();
    if (typeof data?.balance === "number") setCredits(data.balance);
    if (typeof data?.monthly_grant === "number") setMonthlyGrant(data.monthly_grant);
  };

  const loadConvs = async (uid: string) => {
    const { data: convData } = await supabase.from("conversations").select("id,title,updated_at").eq("user_id", uid).order("updated_at", { ascending: false }).limit(50);
    if (!convData) return;
    // Fetch first user message for each conv as preview, in one query
    const ids = convData.map((c) => c.id);
    let previewMap = new Map<string, string>();
    if (ids.length) {
      const { data: msgData } = await supabase
        .from("messages").select("conversation_id,content,created_at,role")
        .in("conversation_id", ids).eq("role", "user").order("created_at", { ascending: true });
      msgData?.forEach((m) => {
        if (!previewMap.has(m.conversation_id)) previewMap.set(m.conversation_id, m.content);
      });
    }
    setConvs(convData.map((c) => ({ ...c, preview: previewMap.get(c.id) })));
  };

  const loadStats = async (uid: string) => {
    const [chats, mems] = await Promise.all([
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("memories").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);
    setStats({ chats: chats.count ?? 0, memories: mems.count ?? 0 });
  };

  useEffect(() => {
    if (!user) return;
    supabase.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.tier) setTier(data.tier as Tier); });
    refreshCredits(user.id);
    loadConvs(user.id);
    loadStats(user.id);
  }, [user]);

  useEffect(() => {
    if (search?.upgraded) {
      toast.success("Subscription active. Welcome aboard.");
      nav({ to: "/app", search: {}, replace: true });
    }
  }, [search, nav]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const newChat = () => { setMessages([]); setConvId(null); setInput(""); setAttachment(null); };

  const openPortal = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: { environment: stripeEnv, returnUrl: `${window.location.origin}/app` },
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (error || !data?.url) throw new Error(error?.message || data?.error || "Could not open portal");
      window.open(data.url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Portal failed");
    }
  };

  const openConv = async (id: string) => {
    setConvId(id);
    const { data } = await supabase.from("messages").select("role,content,created_at").eq("conversation_id", id).order("created_at");
    if (data) setMessages(data.map((m) => {
      const role = m.role as "user" | "assistant";
      if (role === "assistant") {
        const { display, sources } = splitSources(m.content);
        return { role, content: display, sources };
      }
      return { role, content: m.content };
    }));
  };

  const deleteConv = async (id: string) => {
    await supabase.from("messages").delete().eq("conversation_id", id);
    await supabase.from("conversations").delete().eq("id", id);
    if (convId === id) newChat();
    if (user) loadConvs(user.id);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (tier === "free") { toast.error("File upload is a Pro feature."); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("Max 10MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ name: f.name, dataUrl: reader.result as string, type: f.type });
    reader.readAsDataURL(f);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !attachment) || streaming || !user) return;

    let userContent = text;
    if (attachment) userContent = `[Attached: ${attachment.name}]\n\n${text}`;

    const userMsg: Msg = { role: "user", content: userContent };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    const att = attachment;
    setAttachment(null);
    setStreaming(true);

    let acc = "";
    const upsert = (delta: string) => {
      acc += delta;
      const { display, sources } = splitSources(acc);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: display, sources } : m);
        return [...prev, { role: "assistant", content: display, sources }];
      });
    };

    // Ensure conversation exists
    let cid = convId;
    if (!cid) {
      const title = text.slice(0, 60) || "New chat";
      const { data: created } = await supabase.from("conversations").insert({ user_id: user.id, title }).select("id").single();
      if (created) { cid = created.id; setConvId(cid); }
    } else {
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid);
    }

    if (cid) {
      await supabase.from("messages").insert({ conversation_id: cid, user_id: user.id, role: "user", content: userContent });
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // For multimodal messages with attachment, use OpenAI-style content array
      const apiMessages = next.map((m, i) => {
        if (i === next.length - 1 && att) {
          return {
            role: m.role,
            content: [
              { type: "text", text: text || "Analyse this." },
              { type: "image_url", image_url: { url: att.dataUrl } },
            ],
          };
        }
        return m;
      });

      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages, mode, useWebSearch }),
      });

      const remaining = resp.headers.get("X-Credits-Remaining");
      if (remaining) setCredits(Number(remaining));
      const usedModel = resp.headers.get("X-Model");
      if (usedModel) setLastModel(usedModel);
      const usedCost = resp.headers.get("X-Cost");
      if (usedCost) setLastCost(Number(usedCost));

      if (!resp.ok) {
        let msg = `Error ${resp.status}`;
        try { const e = await resp.json(); if (e.error) msg = e.error; } catch { /* ignore */ }
        toast.error(msg);
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

      // Persist assistant message (clean version, no source manifest)
      const cleaned = splitSources(acc).display;
      if (cid && cleaned) {
        await supabase.from("messages").insert({ conversation_id: cid, user_id: user.id, role: "assistant", content: acc });
        loadConvs(user.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stream failed");
    } finally {
      setStreaming(false);
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  const ModeIcon = MODES.find((m) => m.id === mode)?.icon ?? Search;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card/40 md:flex">
        <div className="flex items-center justify-between p-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background font-display text-sm">R</div>
            <span className="font-display text-lg">Razen</span>
          </Link>
        </div>
        <div className="px-3">
          <Button onClick={newChat} variant="outline" className="w-full justify-start gap-2"><Plus className="h-4 w-4" />New chat</Button>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recent</p>
          {convs.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No chats yet.</p>
          ) : convs.map((c) => (
            <div key={c.id} className={`group relative mb-0.5 rounded-md ${convId === c.id ? "bg-muted" : ""}`}>
              <button
                onClick={() => openConv(c.id)}
                className="block w-full rounded-md px-2.5 py-2 pr-8 text-left hover:bg-muted/70"
              >
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-[13px] font-medium">{c.title}</span>
                </div>
                {c.preview && (
                  <p className="ml-[18px] mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {c.preview}
                  </p>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
                className="absolute right-1.5 top-2 rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-background"
                title="Delete chat"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-border/60 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <div className="font-medium capitalize">{tier} plan</div>
              {credits !== null && <div className="text-muted-foreground">{credits.toLocaleString()} credits</div>}
            </div>
            {tier === "free" && (
              <Link to="/pricing"><Button size="sm" variant="outline" className="h-8"><Sparkles className="mr-1 h-3 w-3" />Upgrade</Button></Link>
            )}
          </div>
          <Button size="sm" variant="ghost" className="mt-2 h-8 w-full justify-start text-muted-foreground" onClick={() => setMemOpen(true)}>
            <Brain className="mr-2 h-3.5 w-3.5" />Memory{tier !== "elite" && <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">Elite</span>}
          </Button>
          {tier !== "free" && (
            <Button size="sm" variant="ghost" className="mt-1 h-8 w-full justify-start text-muted-foreground" onClick={openPortal}>
              <Settings className="mr-2 h-3.5 w-3.5" />Manage subscription
            </Button>
          )}
          <Button size="sm" variant="ghost" className="mt-1 h-8 w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut className="mr-2 h-3.5 w-3.5" />Sign out
          </Button>
        </div>
      </aside>

      {memOpen && user && <MemoryPanel userId={user.id} tier={tier} onClose={() => setMemOpen(false)} />}

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-2">
            {/* Mode picker */}
            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-card p-1 shadow-soft">
              {MODES.map((m) => {
                const Active = m.icon;
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={m.hint}
                  >
                    <Active className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <Button size="sm" variant="ghost" className="h-9 px-2.5 text-xs text-muted-foreground" onClick={exportChat} title="Export chat as Markdown">
                <Download className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Export</span>
              </Button>
            )}
            <div className="flex items-center gap-2 md:hidden">
              {credits !== null && (
                <span className="flex items-center gap-1 rounded-full border border-border/60 bg-card px-2.5 py-1 text-xs">
                  <Zap className="h-3 w-3 text-primary" />{credits.toLocaleString()}
                </span>
              )}
              {tier === "free" && (
                <Link to="/pricing"><Button size="sm" className="h-8"><Sparkles className="mr-1 h-3 w-3" />Upgrade</Button></Link>
              )}
              <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
            </div>
          </div>
        </header>

        {mode === "build" ? (
          <BuildWorkspaceResolved
            tier={tier}
            onExitBuild={() => setMode("research")}
            onCreditsChange={setCredits}
          />
        ) : mode === "write" ? (
          <WriteWorkspace onCreditsChange={setCredits} />
        ) : mode === "plan" ? (
          <PlanWorkspace onCreditsChange={setCredits} />
        ) : (
        <>
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
            {messages.length === 0 && !convId ? (
              <div className="space-y-10">
                {/* Greeting */}
                <div>
                  <h1 className="font-display text-4xl md:text-6xl tracking-tight">
                    {greetingFor(new Date())}{user.email ? `, ${user.email.split("@")[0]}` : ""}.
                  </h1>
                  <p className="mt-3 text-lg text-muted-foreground">What are we shipping today?</p>
                </div>

                {/* Stats strip */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="Credits left" value={credits?.toLocaleString() ?? "—"} sub={`of ${monthlyGrant.toLocaleString()} ${tier === "free" ? "today" : "this month"}`} icon={Zap} />
                  <StatCard label="Conversations" value={stats.chats.toLocaleString()} sub="lifetime" icon={MessageSquare} />
                  <StatCard label="Memories" value={stats.memories.toLocaleString()} sub={tier === "elite" ? "active" : "Elite feature"} icon={Brain} />
                </div>

                {/* Mode launcher */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Launch a task</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {MODES.map((m) => {
                      const Active = m.icon;
                      const selected = mode === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setMode(m.id)}
                          className={`group rounded-2xl border p-5 text-left transition ${selected ? "border-primary bg-primary/5 shadow-card" : "border-border/70 bg-card/60 hover:border-border hover:bg-card hover:shadow-soft"}`}
                        >
                          <div className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-primary text-primary-foreground" : "bg-foreground text-background"}`}>
                            <Active className="h-5 w-5" />
                          </div>
                          <div className="mt-4 font-display text-xl">{m.label}</div>
                          <p className="mt-1 text-sm text-muted-foreground">{m.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Suggested prompts */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Try a {MODES.find((m) => m.id === mode)?.label.toLowerCase()} prompt</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {modePrompts(mode).map((p) => (
                      <button key={p} onClick={() => setInput(p)} className="rounded-xl border border-border/70 bg-card/60 p-4 text-left text-sm text-foreground/80 transition hover:bg-card hover:shadow-soft">
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recent chats */}
                {convs.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pick up where you left off</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {convs.slice(0, 6).map((c) => (
                        <button key={c.id} onClick={() => openConv(c.id)} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3 text-left text-sm transition hover:bg-card hover:shadow-soft">
                          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{c.title}</span>
                          <span className="text-xs text-muted-foreground">{relTime(c.updated_at)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {tier === "free" && (
                  <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6">
                    <div className="flex items-start gap-4">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-5 w-5" /></div>
                      <div className="flex-1">
                        <div className="font-display text-xl">Unlock deeper reasoning & more builds</div>
                        <p className="mt-1 text-sm text-muted-foreground">Pro adds file uploads and a larger monthly credit pool. Elite gives you higher-depth reasoning, more memory, and more room for serious research, planning, writing, and builds.</p>
                      </div>
                      <Link to="/pricing"><Button className="shrink-0">See plans</Button></Link>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                    <div className={m.role === "user"
                      ? "max-w-[85%] rounded-2xl bg-foreground px-4 py-3 text-sm text-background"
                      : "max-w-full"
                    }>
                      {m.role === "assistant" ? (
                        <div className="space-y-3">
                          <div className="prose-chat">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeHighlight]}
                              components={{
                                p: ({ children }) => <p>{renderCitations(children, m.sources)}</p>,
                                li: ({ children }) => <li>{renderCitations(children, m.sources)}</li>,
                              }}
                            >{m.content || "…"}</ReactMarkdown>
                          </div>
                          {m.sources && m.sources.length > 0 && (
                            <SourceStrip sources={m.sources} />
                          )}
                        </div>
                      ) : <span className="whitespace-pre-wrap">{m.content}</span>}
                    </div>
                  </div>
                ))}
                {streaming && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    Thinking…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-border/60 bg-background/90 backdrop-blur-md">
          <div className="mx-auto max-w-3xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
            {attachment && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-xs">
                <Paperclip className="h-3 w-3" />{attachment.name}
                <button onClick={() => setAttachment(null)}><X className="h-3 w-3" /></button>
              </div>
            )}
            <div className="rounded-2xl border border-border/70 bg-card shadow-soft transition focus-within:border-primary/40 focus-within:shadow-card">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Ask Razen — ${mode} mode`}
                rows={1}
                className="min-h-[52px] resize-none border-0 bg-transparent px-4 py-3.5 text-base focus-visible:ring-0"
              />
              <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    title={tier === "free" ? "Upgrade to Pro for files" : "Attach file or image"}
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFile} className="hidden" />
                  <button
                    onClick={() => setUseWebSearch((v) => !v)}
                    className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition ${
                      useWebSearch ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    }`}
                    title="Toggle live web search"
                  >
                    <Globe className="h-3.5 w-3.5" />Web
                  </button>
                </div>
                <Button onClick={send} disabled={(!input.trim() && !attachment) || streaming} size="icon" className="h-9 w-9 rounded-full">
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
              {credits !== null && <span>{credits.toLocaleString()} credits left</span>}
              <span className="hidden sm:inline opacity-50">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                This task: <strong className="text-foreground/80">{estimatedCost} {estimatedCost === 1 ? "credit" : "credits"}</strong>
              </span>
              {lastModel && (
                <>
                  <span className="hidden sm:inline opacity-50">·</span>
                  <span>Last reply: {modelLabel(lastModel)}{lastCost ? ` (${lastCost})` : ""}</span>
                </>
              )}
            </p>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function modePrompts(mode: Mode): string[] {
  switch (mode) {
    case "research": return ["Compare Cursor, Windsurf, and Zed for a TypeScript team.", "What are the latest funding rounds in AI agents this quarter?"];
    case "write": return ["Draft a cold email to enterprise heads of operations.", "Rewrite this paragraph in the voice of The Economist."];
    case "plan": return ["Plan a 30-day launch for a new SaaS pricing page.", "Break a website redesign into a 2-week sprint."];
    case "build": return ["Write a TypeScript Zod schema for a Stripe webhook.", "Debug a flaky React useEffect race condition."];
  }
}

function greetingFor(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub: string; icon: typeof Brain }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="mt-2 font-display text-3xl">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function splitSources(raw: string): { display: string; sources: Source[] } {
  const match = raw.match(/<<<SOURCES>>>([\s\S]*?)<<<END>>>/);
  if (!match) return { display: raw, sources: [] };
  let sources: Source[] = [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed)) {
      sources = parsed
        .filter((s) => s && typeof s.url === "string" && /^https?:\/\//.test(s.url))
        .map((s, i) => ({
          n: typeof s.n === "number" ? s.n : i + 1,
          title: typeof s.title === "string" ? s.title : s.url,
          url: s.url,
          domain: typeof s.domain === "string" && s.domain ? s.domain : safeDomain(s.url),
        }));
    }
  } catch {
    // partial/streaming — ignore until complete
  }
  const display = raw.replace(/<<<SOURCES>>>[\s\S]*?<<<END>>>/, "").replace(/\s+$/, "");
  return { display, sources };
}

function safeDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function renderCitations(children: React.ReactNode, sources?: Source[]): React.ReactNode {
  if (!sources || sources.length === 0) return children;
  const map = new Map(sources.map((s) => [s.n, s]));
  const transform = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === "string") {
      const parts: React.ReactNode[] = [];
      const regex = /\[(\d+)\]/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let key = 0;
      while ((match = regex.exec(node)) !== null) {
        if (match.index > lastIndex) parts.push(node.slice(lastIndex, match.index));
        const n = Number(match[1]);
        const src = map.get(n);
        if (src) {
          parts.push(
            <a
              key={`cite-${key++}`}
              href={src.url}
              target="_blank"
              rel="noreferrer"
              title={`${src.title} — ${src.domain}`}
              className="ml-0.5 inline-flex items-center justify-center rounded-md bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary no-underline transition hover:bg-primary/20"
            >
              {n}
            </a>,
          );
        } else {
          parts.push(match[0]);
        }
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < node.length) parts.push(node.slice(lastIndex));
      return parts.length ? parts : node;
    }
    if (Array.isArray(node)) return node.map((c, i) => <React.Fragment key={i}>{transform(c)}</React.Fragment>);
    return node;
  };
  return transform(children);
}

function SourceStrip({ sources }: { sources: Source[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Sources · {sources.length}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => (
          <a
            key={s.n}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 transition hover:border-primary/40 hover:shadow-soft"
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
              alt=""
              className="mt-0.5 h-4 w-4 rounded-sm"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-primary/10 text-[9px] font-semibold text-primary">{s.n}</span>
                <span className="truncate text-[11px] text-muted-foreground">{s.domain}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12px] font-medium text-foreground group-hover:text-primary">
                {s.title}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
