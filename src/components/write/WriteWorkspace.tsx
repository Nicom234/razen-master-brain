import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Sparkles, Wand2, Minimize2, Maximize2, Languages, FileDown, Loader2, Check, X,
  Plus, FileText, Trash2, Target, ListTree, Quote, BookOpen, Mail, Megaphone,
  Newspaper, FileCode2, ChevronDown, History, Search, Bold, Italic, Heading1,
  Heading2, List, ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type WriteAction =
  | "improve" | "shorter" | "longer" | "tone" | "continue" | "fix" | "custom"
  | "outline" | "summarize" | "rewrite-style" | "counter" | "examples" | "headlines";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const ACTION_PROMPTS: Record<string, string> = {
  improve: "Rewrite the following passage to be sharper, clearer, and more confident. Match the surrounding voice. Return ONLY the rewritten passage — no preamble, no quotes, no commentary.",
  shorter: "Rewrite the following passage to be roughly 40% shorter while keeping the meaning, voice, and key facts. Return ONLY the rewritten passage.",
  longer: "Expand the following passage with concrete detail, examples, and rhythm — without padding or fluff. Return ONLY the rewritten passage.",
  continue: "Continue writing from exactly where this passage ends. Match voice, tense, and rhythm. Return ONLY the new continuation, no recap.",
  fix: "Fix grammar, spelling, awkward phrasing, and clarity issues in the following passage. Preserve voice and meaning. Return ONLY the corrected passage.",
  outline: "Read the brief or topic below and produce a tight, opinionated outline: a single H1, then 5-8 H2 sections, each with 2-3 bullet sub-points. Return ONLY the outline as markdown.",
  summarize: "Summarize the following passage in 3 punchy sentences that preserve the most important claims. Return ONLY the summary.",
  counter: "Write a sharp, well-reasoned counter-argument to the following passage. Take it seriously. Return ONLY the counter-argument.",
  examples: "Generate 3 concrete, vivid examples that illustrate the following passage's main point. Use real-world specificity. Return ONLY the examples as a markdown list.",
  headlines: "Generate 8 strong headline/title options for the following piece. Vary tone (curious, declarative, contrarian, benefit-led). Return ONLY the list.",
};

const TONES = ["Confident", "Friendly", "Editorial", "Technical", "Persuasive", "Plain", "Witty", "Academic", "Conversational"];
const STYLES = [
  { id: "nyt", label: "NYT essay", prompt: "an authoritative, editorial New York Times essay voice — measured, evidence-aware, lightly literary" },
  { id: "paul-graham", label: "Paul Graham", prompt: "Paul Graham's essay voice — direct, concrete, plainspoken, builds an argument from first principles" },
  { id: "stripe-press", label: "Stripe Press", prompt: "the Stripe Press house voice — precise, intellectually serious, rigorous on craft" },
  { id: "naval", label: "Naval", prompt: "Naval Ravikant's aphoristic voice — short, dense, declarative one-liners with white space" },
  { id: "wired", label: "Wired feature", prompt: "a Wired feature voice — vivid, scene-led, future-curious, journalistic" },
  { id: "casual-blog", label: "Casual blog", prompt: "a casual, friendly blog voice — first person, contractions, humour where natural" },
];

type Doc = { id: string; title: string; html: string; updatedAt: number };
type WriteMode = "doc" | "essay" | "email" | "post" | "marketing" | "press";
const TEMPLATES: { id: WriteMode; label: string; icon: typeof FileText; seed: string }[] = [
  { id: "doc", label: "Blank document", icon: FileText, seed: "" },
  { id: "essay", label: "Essay / article", icon: BookOpen, seed: "<h1>Working title</h1><p>Open with a sharp, specific observation.</p>" },
  { id: "email", label: "Email", icon: Mail, seed: "<h1>Subject line</h1><p>Hi NAME,</p><p></p><p>Best,<br/>You</p>" },
  { id: "post", label: "Social post", icon: Megaphone, seed: "<p>Hook in the first line.</p><p>Then deliver the payoff.</p>" },
  { id: "marketing", label: "Landing copy", icon: Newspaper, seed: "<h1>Headline that promises one outcome</h1><h2>Subhead that names who it's for</h2>" },
  { id: "press", label: "Press release", icon: FileCode2, seed: "<h1>FOR IMMEDIATE RELEASE</h1><h2>City, Date —</h2>" },
];

const STORE_KEY = "razen.write.docs.v2";

function loadDocs(): Doc[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}
function saveDocs(docs: Doc[]) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(docs)); } catch { /* */ }
}

interface WriteWorkspaceProps {
  onCreditsChange: (n: number) => void;
}

export function WriteWorkspace({ onCreditsChange }: WriteWorkspaceProps) {
  const [docs, setDocs] = useState<Doc[]>(() => loadDocs());
  const [activeId, setActiveId] = useState<string | null>(() => loadDocs()[0]?.id ?? null);
  const [busy, setBusy] = useState<WriteAction | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [toneOpen, setToneOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<number>(() => Number(localStorage.getItem("razen.write.target") || 0));
  const [wordCount, setWordCount] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const lastSavedHtml = useRef<string>("");

  const active = useMemo(() => docs.find((d) => d.id === activeId) ?? null, [docs, activeId]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "Title…"
            : "Start writing — select any text and Razen will polish, expand, or rewrite it.",
      }),
    ],
    content: active?.html ?? "",
    editorProps: {
      attributes: { class: "prose prose-invert max-w-none focus:outline-none min-h-[60vh] font-display" },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
    },
  }, [activeId]);

  // bootstrap a doc if none
  useEffect(() => {
    if (docs.length === 0) {
      const d: Doc = { id: crypto.randomUUID(), title: "Untitled", html: "", updatedAt: Date.now() };
      setDocs([d]); setActiveId(d.id);
    } else if (!activeId) setActiveId(docs[0].id);
  }, []); // eslint-disable-line

  // autosave
  useEffect(() => {
    if (!editor || !activeId) return;
    const id = setInterval(() => {
      const html = editor.getHTML();
      if (html !== lastSavedHtml.current) {
        lastSavedHtml.current = html;
        setDocs((ds) => {
          const next = ds.map((d) => d.id === activeId ? { ...d, html, updatedAt: Date.now() } : d);
          saveDocs(next); return next;
        });
        setSavedAt(new Date());
      }
    }, 1500);
    return () => clearInterval(id);
  }, [editor, activeId]);

  useEffect(() => { localStorage.setItem("razen.write.target", String(target)); }, [target]);

  if (!editor) return null;

  const newDoc = (mode: WriteMode = "doc") => {
    const seed = TEMPLATES.find((t) => t.id === mode)?.seed ?? "";
    const d: Doc = { id: crypto.randomUUID(), title: "Untitled", html: seed, updatedAt: Date.now() };
    setDocs((ds) => { const n = [d, ...ds]; saveDocs(n); return n; });
    setActiveId(d.id);
    setTimeout(() => editor.commands.setContent(seed), 30);
  };

  const deleteDoc = (id: string) => {
    if (!confirm("Delete this document?")) return;
    setDocs((ds) => {
      const n = ds.filter((d) => d.id !== id);
      saveDocs(n);
      if (id === activeId) setActiveId(n[0]?.id ?? null);
      return n;
    });
  };

  const renameDoc = (id: string, title: string) => {
    setDocs((ds) => { const n = ds.map((d) => d.id === id ? { ...d, title } : d); saveDocs(n); return n; });
  };

  const runAction = async (action: WriteAction, opts?: { tone?: string; custom?: string; style?: string }) => {
    if (busy) return;
    const { from, to, empty } = editor.state.selection;
    const selected = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
    const fullText = editor.getText();

    let instruction = "";
    let payload = "";
    let appendMode = false;

    if (action === "continue") {
      instruction = ACTION_PROMPTS.continue;
      payload = fullText.slice(-1500);
      appendMode = true;
    } else if (action === "tone") {
      if (!selected) { toast.error("Select text first to change tone."); return; }
      instruction = `Rewrite the following passage in a ${opts?.tone ?? "Confident"} tone. Keep meaning and key facts. Return ONLY the rewritten passage.`;
      payload = selected;
    } else if (action === "rewrite-style") {
      const style = STYLES.find((s) => s.id === opts?.style);
      if (!style) return;
      instruction = `Rewrite the following passage in ${style.prompt}. Preserve all factual content. Return ONLY the rewritten passage.`;
      payload = selected || fullText;
    } else if (action === "custom") {
      if (!opts?.custom?.trim()) return;
      instruction = `${opts.custom.trim()}\n\nReturn ONLY the rewritten passage — no preamble, no quotes.`;
      payload = selected || fullText;
    } else if (action === "outline" || action === "headlines") {
      instruction = ACTION_PROMPTS[action];
      payload = selected || fullText || "(brief is whatever the doc currently contains; if empty, generate a generic essay outline)";
      appendMode = true;
    } else if (action === "summarize" || action === "counter" || action === "examples") {
      if (!selected && !fullText.trim()) { toast.error("Write or select something first."); return; }
      instruction = ACTION_PROMPTS[action];
      payload = selected || fullText;
      appendMode = true;
    } else {
      if (!selected && action !== "fix") { toast.error("Select text first."); return; }
      instruction = ACTION_PROMPTS[action];
      payload = selected || fullText;
    }

    setBusy(action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode: "write", useWebSearch: false,
          messages: [{ role: "user", content: `${instruction}\n\n---\n\n${payload}` }],
        }),
      });

      const remaining = resp.headers.get("X-Credits-Remaining");
      if (remaining) onCreditsChange(Number(remaining));

      if (!resp.ok) {
        let msg = `Error ${resp.status}`;
        try { const e = await resp.json(); if (e.error) msg = e.error; } catch { /* */ }
        toast.error(msg); return;
      }
      if (!resp.body) throw new Error("No stream");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let started = false;
      let insertFrom = from;
      let insertTo = to;
      let acc = "";

      const writeChunk = (delta: string) => {
        acc += delta;
        if (appendMode) {
          if (!started) {
            editor.commands.focus("end");
            const end = editor.state.doc.content.size;
            editor.commands.insertContentAt(end, "\n\n");
            insertFrom = editor.state.doc.content.size;
            insertTo = insertFrom;
            started = true;
          }
          editor.commands.insertContentAt(insertTo, delta);
          insertTo += delta.length;
        } else {
          if (!started) {
            if (selected) {
              editor.chain().focus().deleteRange({ from, to }).run();
              insertFrom = from; insertTo = from;
            } else {
              editor.chain().focus().selectAll().deleteSelection().run();
              insertFrom = editor.state.selection.from; insertTo = insertFrom;
            }
            started = true;
          }
          editor.commands.insertContentAt(insertTo, delta);
          insertTo += delta.length;
        }
      };

      while (true) {
        const r = await reader.read();
        if (r.done) break;
        buf += decoder.decode(r.value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":") || !line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) writeChunk(c);
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Write failed");
    } finally {
      setBusy(null);
      setCustomOpen(false); setCustomPrompt("");
      setToneOpen(false); setStyleOpen(false); setInsightOpen(false);
    }
  };

  const exportMd = () => {
    const html = editor.getHTML();
    const md = html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
      .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
      .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${active?.title || "doc"}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const filteredDocs = docs.filter((d) =>
    !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.html.toLowerCase().includes(search.toLowerCase())
  );

  const targetProgress = target > 0 ? Math.min(100, Math.round((wordCount / target) * 100)) : 0;
  const readingTime = Math.max(1, Math.round(wordCount / 220));

  return (
    <div className="flex flex-1 min-h-0">
      {/* Doc sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 bg-card/30 lg:flex">
        <div className="p-3">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search docs"
              className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button size="sm" className="w-full justify-start gap-1.5" onClick={() => newDoc("doc")}>
            <Plus className="h-3.5 w-3.5" /> New document
          </Button>
        </div>
        <div className="px-3 pb-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Templates</p>
          <div className="grid grid-cols-2 gap-1">
            {TEMPLATES.slice(1).map((t) => (
              <button
                key={t.id}
                onClick={() => newDoc(t.id)}
                className="flex items-center gap-1.5 rounded-md border bg-background/40 px-2 py-1.5 text-[11px] hover:bg-muted"
              >
                <t.icon className="h-3 w-3" />{t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Documents</p>
          {filteredDocs.map((d) => (
            <div key={d.id} className={`group relative mb-0.5 rounded-md ${activeId === d.id ? "bg-muted" : ""}`}>
              <button
                onClick={() => setActiveId(d.id)}
                className="block w-full rounded-md px-2.5 py-1.5 pr-7 text-left hover:bg-muted/70"
              >
                <p className="truncate text-[13px] font-medium">{d.title || "Untitled"}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(d.updatedAt).toLocaleDateString()}</p>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteDoc(d.id); }}
                className="absolute right-1 top-1.5 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-background"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Editor column */}
      <div className="flex flex-1 min-w-0 flex-col">
        {/* Title + meta bar */}
        <div className="border-b border-border/60 bg-card/20 px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <input
              value={active?.title ?? ""}
              onChange={(e) => active && renameDoc(active.id, e.target.value)}
              placeholder="Untitled"
              className="flex-1 bg-transparent font-display text-lg outline-none"
            />
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{wordCount} words · {readingTime} min read</span>
              {savedAt && <span>· Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
          </div>
          {target > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${targetProgress}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{wordCount}/{target}</span>
            </div>
          )}
        </div>

        {/* Action toolbar */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-card/10 px-3 py-1.5">
          <ToolbarBtn icon={<Bold className="h-3.5 w-3.5" />} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarBtn icon={<Italic className="h-3.5 w-3.5" />} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarBtn icon={<Heading1 className="h-3.5 w-3.5" />} label="H1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <ToolbarBtn icon={<Heading2 className="h-3.5 w-3.5" />} label="H2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <ToolbarBtn icon={<List className="h-3.5 w-3.5" />} label="List" onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarBtn icon={<ListOrdered className="h-3.5 w-3.5" />} label="Numbered" onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarBtn icon={<Quote className="h-3.5 w-3.5" />} label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} />

          <div className="mx-1 h-4 w-px bg-border" />

          <Button size="sm" variant="ghost" className="h-7" onClick={() => runAction("outline")} disabled={!!busy}>
            {busy === "outline" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListTree className="h-3.5 w-3.5" />}
            <span className="ml-1.5 text-xs">Outline</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => runAction("continue")} disabled={!!busy}>
            {busy === "continue" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="ml-1.5 text-xs">Continue</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => runAction("fix")} disabled={!!busy}>
            <Check className="h-3.5 w-3.5" /><span className="ml-1.5 text-xs">Fix grammar</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => runAction("headlines")} disabled={!!busy}>
            <Megaphone className="h-3.5 w-3.5" /><span className="ml-1.5 text-xs">Headlines</span>
          </Button>

          <div className="relative">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setStyleOpen((v) => !v)} disabled={!!busy}>
              <Wand2 className="h-3.5 w-3.5" /><span className="ml-1.5 text-xs">Style</span>
              <ChevronDown className="ml-0.5 h-3 w-3" />
            </Button>
            {styleOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 min-w-[200px] rounded-lg border bg-popover p-1 shadow-2xl">
                {STYLES.map((s) => (
                  <button key={s.id} onClick={() => runAction("rewrite-style", { style: s.id })}
                    className="block w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-accent">
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setInsightOpen((v) => !v)} disabled={!!busy}>
              <Quote className="h-3.5 w-3.5" /><span className="ml-1.5 text-xs">Insight</span>
              <ChevronDown className="ml-0.5 h-3 w-3" />
            </Button>
            {insightOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 min-w-[180px] rounded-lg border bg-popover p-1 shadow-2xl">
                <button onClick={() => runAction("summarize")} className="block w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-accent">3-sentence summary</button>
                <button onClick={() => runAction("counter")} className="block w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-accent">Counter-argument</button>
                <button onClick={() => runAction("examples")} className="block w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-accent">Concrete examples</button>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                const v = prompt("Word count target:", String(target || 500));
                if (v !== null) setTarget(Math.max(0, parseInt(v) || 0));
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              <Target className="h-3 w-3" />{target ? `${target} words` : "Set target"}
            </button>
            <Button size="sm" variant="ghost" className="h-7" onClick={exportMd}>
              <FileDown className="h-3.5 w-3.5" /><span className="ml-1 text-xs">Export</span>
            </Button>
          </div>
        </div>

        {/* Bubble menu — selection actions */}
        <BubbleMenu editor={editor} shouldShow={({ editor, from, to }) => from !== to && !busy && editor.isFocused}>
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-2xl">
            <BubbleBtn icon={<Wand2 className="h-3.5 w-3.5" />} label="Improve" onClick={() => runAction("improve")} />
            <BubbleBtn icon={<Minimize2 className="h-3.5 w-3.5" />} label="Shorter" onClick={() => runAction("shorter")} />
            <BubbleBtn icon={<Maximize2 className="h-3.5 w-3.5" />} label="Longer" onClick={() => runAction("longer")} />
            <div className="relative">
              <BubbleBtn icon={<Languages className="h-3.5 w-3.5" />} label="Tone" onClick={() => setToneOpen((v) => !v)} />
              {toneOpen && (
                <div className="absolute top-full mt-1 left-0 z-50 min-w-[140px] rounded-lg border bg-popover p-1 shadow-2xl">
                  {TONES.map((t) => (
                    <button key={t} onClick={() => runAction("tone", { tone: t })}
                      className="block w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-accent">{t}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <BubbleBtn icon={<Sparkles className="h-3.5 w-3.5" />} label="Custom" onClick={() => setCustomOpen((v) => !v)} />
          </div>
          {customOpen && (
            <div className="mt-1 w-[320px] rounded-lg border border-border bg-popover p-2 shadow-2xl">
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runAction("custom", { custom: customPrompt }); }}
                  placeholder="Tell Razen how to rewrite this…"
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <Button size="sm" className="h-7" onClick={() => runAction("custom", { custom: customPrompt })} disabled={!customPrompt.trim()}>Go</Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCustomOpen(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </BubbleMenu>

        {/* Editor surface */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 md:px-10 py-12">
            <EditorContent editor={editor} />
            {busy && busy !== "continue" && (
              <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover px-4 py-2 text-sm shadow-2xl">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Razen is writing…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BubbleBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
      {icon}<span>{label}</span>
    </button>
  );
}

function ToolbarBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
      {icon}
    </button>
  );
}
