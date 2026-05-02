import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Sparkles, Wand2, Minimize2, Maximize2, Languages, FileDown, Loader2, Check, X,
  Plus, FileText, Trash2, Target, ListTree, Quote, BookOpen, Mail, Megaphone,
  Newspaper, FileCode2, ChevronDown, History, Search, Bold, Italic, Heading1,
  Heading2, List, ListOrdered, Keyboard, Eye, EyeOff, RotateCcw, Zap,
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

type Snapshot = { ts: number; html: string };
type Doc = { id: string; title: string; html: string; updatedAt: number; versions?: Snapshot[] };
type WriteMode = "doc" | "essay" | "email" | "post" | "marketing" | "press";

// ────────────────────────────────────────────────────────────────────────────
// Ghost-text autocomplete — Cursor-style inline AI completion.
// On idle, fetch a continuation. Render as a faded inline decoration at the
// caret. Tab accepts. Escape dismisses. Any keypress also dismisses (we re-fire
// on the next idle window).
// ────────────────────────────────────────────────────────────────────────────
type GhostState = { text: string; from: number } | null;
const ghostKey = new PluginKey<GhostState>("razenGhostSuggestion");
const SuggestionExtension = Extension.create({
  name: "razenSuggestion",
  addProseMirrorPlugins() {
    return [
      new Plugin<GhostState>({
        key: ghostKey,
        state: {
          init(): GhostState { return null; },
          apply(tr, value): GhostState {
            const meta = tr.getMeta(ghostKey);
            if (meta !== undefined) return meta as GhostState;
            // Drop suggestion as soon as the doc changes (the user typed).
            if (tr.docChanged) return null;
            return value;
          },
        },
        props: {
          decorations(state) {
            const v = ghostKey.getState(state);
            if (!v) return DecorationSet.empty;
            const span = document.createElement("span");
            span.className = "razen-ghost-text";
            span.style.opacity = "0.42";
            span.style.pointerEvents = "none";
            span.style.userSelect = "none";
            span.style.fontStyle = "italic";
            span.textContent = v.text;
            return DecorationSet.create(state.doc, [Decoration.widget(v.from, span, { side: 1 })]);
          },
          handleKeyDown(view, event) {
            const v = ghostKey.getState(view.state);
            if (!v) return false;
            if (event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              view.dispatch(view.state.tr.insertText(v.text, v.from).setMeta(ghostKey, null));
              return true;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              view.dispatch(view.state.tr.setMeta(ghostKey, null));
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
function setGhost(editor: Editor, payload: { text: string; from: number } | null) {
  editor.view.dispatch(editor.view.state.tr.setMeta(ghostKey, payload));
}


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
  selectedId?: string | null;
  onRefresh?: () => void;
  tier?: "free" | "pro" | "elite";
}

// Hook: drive ghost-text autocomplete. Watches editor for ~700ms idle moments
// after the user has typed a few characters, then fetches a short continuation
// and renders it as an inline ghost decoration. Cancels in-flight requests on
// new keystrokes. Disabled if `enabled` is false.
function useGhostText(editor: Editor | null, enabled: boolean, onCreditsChange: (n: number) => void) {
  const lastFiredFor = useRef<string>("");
  const ctrlRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      ctrlRef.current?.abort();
      setGhost(editor, null);
      return;
    }
    const fire = async () => {
      if (!editor) return;
      const { from, to, empty } = editor.state.selection;
      if (!empty) return;
      // Don't autocomplete inside a heading at the very beginning.
      const before = editor.state.doc.textBetween(Math.max(0, from - 600), from, "\n");
      if (before.length < 12) return;
      // Skip if line ends mid-word with a word char and no space (avoid mid-word inserts).
      const last = before[before.length - 1];
      if (last && /\w/.test(last)) {
        // Allow if the user is at end-of-sentence; defer if mid-word.
        // Insert a leading space when accepting if needed; the model will be told to start with a space.
      }
      const fingerprint = `${from}::${before.slice(-160)}`;
      if (fingerprint === lastFiredFor.current) return;
      lastFiredFor.current = fingerprint;

      ctrlRef.current?.abort();
      const ctrl = new AbortController(); ctrlRef.current = ctrl;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const sys = "You are a writer's autocomplete. The user is typing. Continue the passage in their voice for 6-20 words — natural, on-topic, finish the current thought or extend it. Return ONLY the continuation text. No quotes, no preamble, no explanation. If the previous character was a non-space word character, START with a single space. Do not start a new paragraph. Do not change tense or person. Stop at a natural pause.";
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            mode: "write", useWebSearch: false,
            messages: [
              { role: "user", content: `${sys}\n\nPassage so far (the cursor is at the end):\n\n${before}` },
            ],
          }),
        });
        if (!resp.ok || !resp.body) return;
        const remaining = resp.headers.get("X-Credits-Remaining");
        if (remaining) onCreditsChange(Number(remaining));
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = ""; let acc = "";
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
              if (c) acc += c;
            } catch { /* ignore */ }
          }
        }
        // Trim model artefacts and cap length to one or two sentences worth.
        const cleaned = acc
          .replace(/^"+|"+$/g, "")
          .replace(/\n[\s\S]*$/, "")
          .replace(/\s+$/g, "")
          .slice(0, 200);
        if (!cleaned) return;
        // Bail if user has typed since we started.
        if (editor.state.selection.from !== to || ctrl.signal.aborted) return;
        setGhost(editor, { text: cleaned, from: editor.state.selection.from });
      } catch { /* aborted or network — ignore */ }
    };

    const onUpdate = () => {
      // Clear current ghost as user types and re-arm the idle timer.
      setGhost(editor, null);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { void fire(); }, 750);
    };
    const onSelection = () => {
      // On bare selection moves, also clear (user moved the cursor).
      setGhost(editor, null);
    };
    editor.on("update", onUpdate);
    editor.on("selectionUpdate", onSelection);
    return () => {
      editor.off("update", onUpdate);
      editor.off("selectionUpdate", onSelection);
      if (timerRef.current) clearTimeout(timerRef.current);
      ctrlRef.current?.abort();
    };
  }, [editor, enabled, onCreditsChange]);
}

export function WriteWorkspace({ onCreditsChange, selectedId, onRefresh, tier = "free" }: WriteWorkspaceProps) {
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
  const [autocomplete, setAutocomplete] = useState<boolean>(() => localStorage.getItem("razen.write.autocomplete") !== "0");
  const [focusMode, setFocusMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastSavedHtml = useRef<string>("");

  const active = useMemo(() => docs.find((d) => d.id === activeId) ?? null, [docs, activeId]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      SuggestionExtension,
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

  // Sync with parent-selected doc (from app.tsx sidebar).
  useEffect(() => {
    if (selectedId === null) {
      // "New document" clicked in parent sidebar
      newDoc();
    } else if (selectedId && selectedId !== activeId) {
      setActiveId(selectedId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // autosave + version snapshots: every meaningful change captures a snapshot,
  // capped at 30 to keep storage sane. Old ones are evicted FIFO.
  useEffect(() => {
    if (!editor || !activeId) return;
    const id = setInterval(() => {
      const html = editor.getHTML();
      if (html !== lastSavedHtml.current) {
        const lastHtml = lastSavedHtml.current;
        lastSavedHtml.current = html;
        setDocs((ds) => {
          const next = ds.map((d) => {
            if (d.id !== activeId) return d;
            const versions = (d.versions ?? []).slice();
            // Only snapshot if there's a real change vs. the most recent snapshot.
            if (lastHtml && (versions.length === 0 || versions[versions.length - 1].html !== lastHtml)) {
              versions.push({ ts: Date.now(), html: lastHtml });
              if (versions.length > 30) versions.splice(0, versions.length - 30);
            }
            return { ...d, html, updatedAt: Date.now(), versions };
          });
          saveDocs(next); return next;
        });
        setSavedAt(new Date());
      }
    }, 2500);
    return () => clearInterval(id);
  }, [editor, activeId]);

  useEffect(() => { localStorage.setItem("razen.write.target", String(target)); }, [target]);
  useEffect(() => { localStorage.setItem("razen.write.autocomplete", autocomplete ? "1" : "0"); }, [autocomplete]);

  // Wire ghost-text autocomplete (after `editor` is created above).
  useGhostText(editor, autocomplete && !busy, onCreditsChange);

  // Restore a version into the editor.
  const restoreVersion = useCallback((html: string) => {
    if (!editor) return;
    editor.commands.setContent(html, { emitUpdate: true });
    toast.success("Version restored");
    setHistoryOpen(false);
  }, [editor]);

  if (!editor) return null;

  const newDoc = (mode: WriteMode = "doc") => {
    const seed = TEMPLATES.find((t) => t.id === mode)?.seed ?? "";
    const d: Doc = { id: crypto.randomUUID(), title: "Untitled", html: seed, updatedAt: Date.now() };
    setDocs((ds) => { const n = [d, ...ds]; saveDocs(n); return n; });
    setActiveId(d.id);
    setTimeout(() => editor.commands.setContent(seed), 30);
    setTimeout(() => onRefresh?.(), 150);
  };

  const deleteDoc = (id: string) => {
    if (!confirm("Delete this document?")) return;
    setDocs((ds) => {
      const n = ds.filter((d) => d.id !== id);
      saveDocs(n);
      if (id === activeId) setActiveId(n[0]?.id ?? null);
      return n;
    });
    setTimeout(() => onRefresh?.(), 150);
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
    <div className={`flex flex-1 min-h-0 ${focusMode ? "razen-focus-mode" : ""}`}>
      {focusMode && (
        <style>{`
          .razen-focus-mode .razen-write-sidebar,
          .razen-focus-mode .razen-write-toolbar { display: none !important; }
          .razen-focus-mode .razen-write-meta { opacity: 0.4; transition: opacity .3s; }
          .razen-focus-mode .razen-write-meta:hover { opacity: 1; }
          .razen-focus-mode .ProseMirror p:not(:has(:focus)),
          .razen-focus-mode .ProseMirror h1:not(:has(:focus)),
          .razen-focus-mode .ProseMirror h2:not(:has(:focus)),
          .razen-focus-mode .ProseMirror h3:not(:has(:focus)),
          .razen-focus-mode .ProseMirror li:not(:has(:focus)) {
            opacity: 0.45; transition: opacity .3s;
          }
        `}</style>
      )}
      {/* Doc sidebar */}
      <aside className="razen-write-sidebar hidden w-60 shrink-0 flex-col border-r border-border/60 bg-card/30 lg:flex">
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
        <div className="razen-write-meta border-b border-border/60 bg-card/20 px-4 py-2">
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
        <div className="razen-write-toolbar flex flex-wrap items-center gap-1 border-b border-border/60 bg-card/10 px-3 py-1.5">
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
              onClick={() => setAutocomplete((v) => !v)}
              title={autocomplete ? "Autocomplete on — Tab to accept, Esc to dismiss" : "Autocomplete off"}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition ${autocomplete ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Zap className="h-3 w-3" />Auto
            </button>
            <button
              onClick={() => setFocusMode((v) => !v)}
              title={focusMode ? "Exit focus mode" : "Enter focus mode (Zen)"}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition ${focusMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {focusMode ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />} Focus
            </button>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              title="Version history"
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition ${historyOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              <History className="h-3 w-3" />Versions {active?.versions?.length ? `(${active.versions.length})` : ""}
            </button>
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
        <div className="relative flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 md:px-10 py-12">
              <EditorContent editor={editor} />
              {busy && busy !== "continue" && (
                <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover px-4 py-2 text-sm shadow-2xl">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Razen is writing…
                </div>
              )}
              {autocomplete && !focusMode && (
                <div className="pointer-events-none fixed bottom-6 right-6 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur">
                  <Keyboard className="h-3 w-3" />
                  <span>Pause to draft · <kbd className="rounded border bg-background px-1 font-mono">Tab</kbd> accept · <kbd className="rounded border bg-background px-1 font-mono">Esc</kbd> dismiss</span>
                </div>
              )}
              {focusMode && (
                <button
                  onClick={() => setFocusMode(false)}
                  className="fixed bottom-6 right-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur hover:text-foreground"
                  title="Exit focus mode"
                >
                  <EyeOff className="h-3 w-3" /> Exit focus
                </button>
              )}
            </div>
          </div>

          {/* Version history side panel */}
          {historyOpen && active && (
            <aside className="hidden w-72 shrink-0 flex-col border-l border-border/60 bg-card/40 lg:flex">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <History className="h-3 w-3" /> Versions
                </div>
                <button onClick={() => setHistoryOpen(false)} className="rounded p-1 hover:bg-muted"><X className="h-3 w-3" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {(active.versions ?? []).length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">No snapshots yet — keep writing.</p>
                ) : (
                  <div className="space-y-1">
                    {(active.versions ?? []).slice().reverse().map((v) => {
                      const text = v.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                      const words = text.split(/\s+/).filter(Boolean).length;
                      return (
                        <button
                          key={v.ts}
                          onClick={() => restoreVersion(v.html)}
                          className="group block w-full rounded-md border border-transparent bg-background/40 p-2 text-left text-xs transition hover:border-border hover:bg-card"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{new Date(v.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(v.ts).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{text || "(empty)"}</p>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">{words} word{words === 1 ? "" : "s"}</span>
                            <span className="hidden text-[10px] text-primary group-hover:inline">
                              <RotateCcw className="inline h-3 w-3 mr-0.5" />Restore
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          )}
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
