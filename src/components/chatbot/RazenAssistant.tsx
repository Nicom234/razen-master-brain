import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  ArrowUp,
  Sparkles,
  Globe,
  Paperclip,
  X,
  Plug,
  Inbox,
  Calendar,
  MessageCircle,
  FileText,
  GitBranch,
  ListChecks,
  Folder,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type Source = { n: number; title: string; url: string; domain: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; skills?: string[] };
type Tier = "free" | "pro" | "elite";

type Props = {
  tier: Tier;
  selectedId?: string | null;
  onCreditsChange: (c: number) => void;
  onExitResearch?: () => void;
  onRefresh?: () => void;
};

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent`;

const SUGGESTED = [
  { icon: Inbox, label: "Triage my inbox", prompt: "Catch me up on my inbox — surface what actually needs me, draft replies for the rest." },
  { icon: Calendar, label: "Plan my day", prompt: "Plan my day. What's on my calendar, what should I push, and what should I prep for first?" },
  { icon: MessageCircle, label: "Slack catch-up", prompt: "What did I miss in #product and #eng since yesterday? Bullet the threads that mention me." },
  { icon: FileText, label: "Draft a doc", prompt: "Draft a 1-page PRD for a Stripe-style /share-link page in our voice. File it in Notion." },
  { icon: GitBranch, label: "PR review", prompt: "Look at my open PRs and give me a one-liner status for each, with what's blocking." },
  { icon: ListChecks, label: "Weekly update", prompt: "Write my Friday weekly update from this week's tickets, PRs, and Slack notes." },
];

const INTEGRATIONS: { name: string; icon: typeof Inbox; status: "connected" | "available" }[] = [
  { name: "Gmail", icon: Inbox, status: "available" },
  { name: "Calendar", icon: Calendar, status: "available" },
  { name: "Slack", icon: MessageCircle, status: "available" },
  { name: "Notion", icon: FileText, status: "available" },
  { name: "GitHub", icon: GitBranch, status: "available" },
  { name: "Linear", icon: ListChecks, status: "available" },
  { name: "Drive", icon: Folder, status: "available" },
  { name: "Voice", icon: Mic, status: "available" },
];

export function RazenAssistant({ tier, onCreditsChange }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string; type: string } | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (tier === "free") {
      toast.error("File upload is a Pro feature.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Max 10MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setAttachment({ name: f.name, dataUrl: reader.result as string, type: f.type });
    reader.readAsDataURL(f);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !attachment) || streaming || !user) return;

    const userContent = attachment ? `[Attached: ${attachment.name}]\n\n${text}` : text;
    const userMsg: Msg = { role: "user", content: userContent };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    const att = attachment;
    setAttachment(null);
    setStreaming(true);
    setActiveSkills([]);

    let acc = "";
    const upsert = (delta: string) => {
      acc += delta;
      const { display, sources } = splitSources(acc);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: display, sources } : m));
        }
        return [...prev, { role: "assistant", content: display, sources }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiMessages = next.map((m, i) => {
        if (i === next.length - 1 && att) {
          return {
            role: m.role,
            content: [
              { type: "text", text: text || "Take a look." },
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
        body: JSON.stringify({ messages: apiMessages, useWebSearch, conversationId }),
      });

      const remaining = resp.headers.get("X-Credits-Remaining");
      if (remaining) onCreditsChange(Number(remaining));
      const cid = resp.headers.get("X-Conversation-Id");
      if (cid) setConversationId(cid);

      if (!resp.ok) {
        let msg = `Error ${resp.status}`;
        try {
          const e = await resp.json();
          if (e.error) msg = e.error;
        } catch {
          /* ignore */
        }
        toast.error(msg);
        setStreaming(false);
        return;
      }
      if (!resp.body) throw new Error("No stream");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      let currentEvent = "message";
      while (!done) {
        const r = await reader.read();
        if (r.done) break;
        buf += decoder.decode(r.value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line) {
            currentEvent = "message";
            continue;
          }
          if (line.startsWith(":")) continue;
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const p = JSON.parse(json);
            if (currentEvent === "agent") {
              if (p.type === "skill.activated") {
                setActiveSkills((s) => Array.from(new Set([...s, (p.data?.name as string) ?? ""])).filter(Boolean));
              }
              continue;
            }
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

  return (
    <div className="flex flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
          {messages.length === 0 ? (
            <Hero onPick={(p) => setInput(p)} />
          ) : (
            <div className="space-y-6">
              {activeSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activeSkills.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                    >
                      <Plug className="h-3 w-3" />
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl bg-foreground px-4 py-3 text-sm text-background"
                        : "max-w-full"
                    }
                  >
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
                          >
                            {m.content || "…"}
                          </ReactMarkdown>
                        </div>
                        {m.sources && m.sources.length > 0 && <SourceStrip sources={m.sources} />}
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    )}
                  </div>
                </div>
              ))}
              {streaming && messages[messages.length - 1]?.role === "user" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Working…
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
              <Paperclip className="h-3 w-3" />
              {attachment.name}
              <button onClick={() => setAttachment(null)}>
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="rounded-2xl border border-border/70 bg-card shadow-soft transition focus-within:border-primary/40 focus-within:shadow-card">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="What should I take care of?"
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
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={onFile}
                  className="hidden"
                />
                <button
                  onClick={() => setUseWebSearch((v) => !v)}
                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition ${
                    useWebSearch ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  }`}
                  title="Toggle live web search"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Web
                </button>
              </div>
              <Button
                onClick={send}
                disabled={(!input.trim() && !attachment) || streaming}
                size="icon"
                className="h-9 w-9 rounded-full"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Razen runs on Gemini Flash 3. Confirm before anything sends to a real inbox or channel.
          </p>
        </div>
      </div>
    </div>
  );
}

function Hero({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="space-y-12">
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-foreground text-background">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">Your workspace, on autopilot.</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
          Razen takes ownership of the everyday work — inbox, calendar, Slack, Notion, GitHub, Linear. You ask. Razen handles the rest.
        </p>
      </div>

      <div>
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          What should Razen do today
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUGGESTED.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.label}
                onClick={() => onPick(s.prompt)}
                className="group rounded-2xl border border-border/70 bg-card/60 p-4 text-left transition hover:border-border hover:bg-card hover:shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground text-background transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{s.label}</div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.prompt}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Connect your stack
          </p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Beta
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {INTEGRATIONS.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.name}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3"
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{it.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {it.status === "connected" ? "Connected" : "Tap to connect"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Razen will ask before doing anything that sends, schedules, or files — always.
        </p>
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
    // partial / streaming — ignore until complete
  }
  const display = raw.replace(/<<<SOURCES>>>[\s\S]*?<<<END>>>/, "").replace(/\s+$/, "");
  return { display, sources };
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
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
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-primary/10 text-[9px] font-semibold text-primary">
                  {s.n}
                </span>
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
