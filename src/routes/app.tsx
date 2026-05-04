import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ArrowUp, LogOut, Sparkles, Zap, Plus, Search, PenTool, ListChecks, Code2, Globe, Paperclip, X, MessageSquare, Trash2, Settings, Brain, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { stripeEnv } from "@/lib/stripe";
import { MemoryPanel } from "@/components/MemoryPanel";
import { UpgradeBanner, OutOfCreditsModal, CreditMeter, PostSuccessNudge } from "@/components/UpgradeBanner";
import { WriteWorkspace } from "@/components/write/WriteWorkspace";
import { PlanWorkspace } from "@/components/plan/PlanWorkspace";
import { RazenAssistant } from "@/components/chatbot/RazenAssistant";
import { BuildWorkspaceSafe } from "@/components/build/BuildWorkspaceSafe";

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
type WsSession = { id: string; title: string; updatedAt: number; preview?: string };

function readWsSessions(m: Mode): WsSession[] {
  if (typeof window === "undefined") return [];
  try {
    if (m === "write") {
      const raw = localStorage.getItem("razen.write.docs.v2");
      if (!raw) return [];
      const docs: { id: string; title: string; updatedAt: number; html?: string }[] = JSON.parse(raw);
      return docs.slice(0, 40).map((d) => ({
        id: d.id,
        title: d.title || "Untitled",
        updatedAt: d.updatedAt ?? 0,
        preview: d.html ? d.html.replace(/<[^>]+>/g, " ").trim().slice(0, 80) : "",
      }));
    }
    if (m === "build") {
      const raw = localStorage.getItem("razen.build.projects.v2");
      if (!raw) return [];
      const projects: { id: string; title: string; updatedAt: number; prompt?: string }[] = JSON.parse(raw);
      return projects.slice(0, 40).map((p) => ({
        id: p.id,
        title: p.title || "Build",
        updatedAt: p.updatedAt ?? 0,
        preview: p.prompt?.slice(0, 80) || "",
      }));
    }
  } catch { /* ignore */ }
  return [];
}

const MODES: { id: Mode; label: string; icon: typeof Search; hint: string }[] = [
  { id: "research", label: "Workspace", icon: Sparkles, hint: "Agentic everyday work — inbox, calendar, Slack, docs" },
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
  const [wsSessions, setWsSessions] = useState<WsSession[]>([]);
  const [wsActiveId, setWsActiveId] = useState<string | null>(null);
  const [outOfCreditsOpen, setOutOfCreditsOpen] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const prevCreditsRef = useRef<number | null>(null);
  useEffect(() => {
    if (credits !== null && prevCreditsRef.current !== null && credits < prevCreditsRef.current) {
      setSuccessCount((n) => n + 1);
    }
    prevCreditsRef.current = credits;
  }, [credits]);

  useEffect(() => {
    if (tier === "free" && credits !== null && credits <= 0) {
      const seen = sessionStorage.getItem("razen.ooc.seen");
      if (!seen) {
        setOutOfCreditsOpen(true);
        sessionStorage.setItem("razen.ooc.seen", "1");
      }
    }
  }, [tier, credits]);

  const refreshWsSessions = useCallback(() => {
    if (mode !== "plan" && mode !== "research") {
      const sessions = readWsSessions(mode);
      setWsSessions(sessions);
      if (!wsActiveId && sessions.length > 0) setWsActiveId(sessions[0].id);
    }
  }, [mode, wsActiveId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const search = Route.useSearch() as { upgraded?: string };

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

  useEffect(() => {
    if (mode !== "plan" && mode !== "research") {
      const sessions = readWsSessions(mode);
      setWsSessions(sessions);
      setWsActiveId(sessions[0]?.id ?? null);
    } else {
      setWsSessions([]);
      setWsActiveId(null);
    }
  }, [mode]);

  const newChat = () => { setMessages([]); setConvId(null); setInput(""); setAttachment(null); };

  const newWsSession = () => {
    setWsActiveId(null);
    setTimeout(refreshWsSessions, 400);
  };

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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Redirecting…</div>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card/40 md:flex">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background font-display text-sm">R</div>
            <span className="font-display text-lg">Razen</span>
          </Link>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary capitalize">{tier}</span>
        </div>

        <div className="px-3 pb-3">
          {mode === "research" && (
            <Button onClick={newChat} variant="outline" className="w-full justify-start gap-2 h-9">
              <Plus className="h-4 w-4" />New task
            </Button>
          )}
          {mode === "write" && (
            <Button onClick={newWsSession} variant="outline" className="w-full justify-start gap-2 h-9">
              <Plus className="h-4 w-4" />New document
            </Button>
          )}
          {mode === "build" && (
            <Button onClick={newWsSession} variant="outline" className="w-full justify-start gap-2 h-9">
              <Plus className="h-4 w-4" />New build
            </Button>
          )}
          {mode === "plan" && (
            <Button onClick={newWsSession} variant="outline" className="w-full justify-start gap-2 h-9">
              <Plus className="h-4 w-4" />New plan
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {mode === "research" ? "Recent tasks" : mode === "write" ? "Documents" : mode === "build" ? "Builds" : mode === "plan" ? "Plans" : "Recent tasks"}
          </p>
          {mode === "research" ? (
            convs.length > 0 ? (
              convs.map((c) => (
                <div key={c.id} className={`group relative mb-0.5 rounded-md ${convId === c.id ? "bg-muted" : ""}`}>
                  <button
                    onClick={() => openConv(c.id)}
                    className="block w-full rounded-md px-2.5 py-2 pr-8 text-left hover:bg-muted/70"
                  >
                    <span className="truncate text-[13px] font-medium block">{c.title}</span>
                    {c.preview && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{c.preview}</p>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
                    className="absolute right-1.5 top-1.5 hidden rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive group-hover:block"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            ) : (
              <p className="px-2 text-xs text-muted-foreground">Nothing yet — give Razen a task above.</p>
            )
          ) : mode !== "plan" && wsSessions.length > 0 ? (
            wsSessions.map((s) => (
              <div key={s.id} className={`group relative mb-0.5 rounded-md ${wsActiveId === s.id ? "bg-muted" : ""}`}>
                <button
                  onClick={() => setWsActiveId(s.id)}
                  className="block w-full rounded-md px-2.5 py-2 pr-8 text-left hover:bg-muted/70"
                >
                  <span className="truncate text-[13px] font-medium block">{s.title}</span>
                  {s.preview && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{s.preview}</p>
                  )}
                </button>
              </div>
            ))
          ) : mode !== "plan" && wsSessions.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">Nothing yet — start one above.</p>
          ) : null}
          {mode === "plan" && (
            <p className="px-2 py-2 text-xs text-muted-foreground italic">Plans are single-workspace — start a new plan or continue below.</p>
          )}
        </div>

        <div className="border-t border-border/60 px-2 py-2">
          <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Switch mode</p>
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition ${mode === m.id ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />{m.label}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border/60 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-xs">
              <div className="font-medium truncate max-w-[120px]">{user?.email?.split("@")[0]}</div>
              <div className="text-muted-foreground">{tier === "elite" ? "Elite member" : tier === "pro" ? "Pro member" : "Free plan"}</div>
            </div>
            {tier === "free" && (
              <Link to="/pricing"><Button size="sm" className="h-8 gap-1"><Sparkles className="h-3 w-3" />Upgrade</Button></Link>
            )}
          </div>
          <CreditMeter tier={tier} credits={credits} monthlyGrant={monthlyGrant} />
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
      <OutOfCreditsModal open={outOfCreditsOpen} onClose={() => setOutOfCreditsOpen(false)} />
      <PostSuccessNudge tier={tier} trigger={successCount} />

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <UpgradeBanner tier={tier} credits={credits} monthlyGrant={monthlyGrant} />
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-2">
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
          <BuildWorkspaceSafe
            tier={tier}
            onExitBuild={() => setMode("research")}
            onCreditsChange={setCredits}
            selectedId={wsActiveId}
            onRefresh={refreshWsSessions}
          />
        ) : mode === "write" ? (
          <WriteWorkspace
            onCreditsChange={setCredits}
            selectedId={wsActiveId}
            onRefresh={refreshWsSessions}
            tier={tier}
          />
        ) : mode === "plan" ? (
          <PlanWorkspace onCreditsChange={setCredits} onRefresh={refreshWsSessions} tier={tier} />
        ) : (
          <RazenAssistant
            tier={tier}
            onCreditsChange={setCredits}
            onExitResearch={() => setMode("write")}
            selectedId={wsActiveId}
            onRefresh={refreshWsSessions}
          />
        )}
      </div>
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
