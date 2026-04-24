import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Sparkles, Wand2, Minimize2, Maximize2, Languages, FileDown, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type WriteAction = "improve" | "shorter" | "longer" | "tone" | "continue" | "fix" | "custom";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const ACTION_PROMPTS: Record<Exclude<WriteAction, "custom" | "tone">, string> = {
  improve: "Rewrite the following passage to be sharper, clearer, and more confident. Match the surrounding voice. Return ONLY the rewritten passage — no preamble, no quotes, no commentary.",
  shorter: "Rewrite the following passage to be roughly 40% shorter while keeping the meaning, voice, and key facts. Return ONLY the rewritten passage.",
  longer: "Expand the following passage with concrete detail, examples, and rhythm — without padding or fluff. Return ONLY the rewritten passage.",
  continue: "Continue writing from exactly where this passage ends. Match voice, tense, and rhythm. Return ONLY the new continuation, no recap.",
  fix: "Fix grammar, spelling, awkward phrasing, and clarity issues in the following passage. Preserve voice and meaning. Return ONLY the corrected passage.",
};

const TONES = ["Confident", "Friendly", "Editorial", "Technical", "Persuasive", "Plain"];

interface WriteWorkspaceProps {
  onCreditsChange: (n: number) => void;
}

export function WriteWorkspace({ onCreditsChange }: WriteWorkspaceProps) {
  const [busy, setBusy] = useState<WriteAction | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [toneOpen, setToneOpen] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const lastSavedHtml = useRef<string>("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Title…";
          return "Start writing — select any text and Razen will polish, expand, or rewrite it.";
        },
      }),
    ],
    content: typeof window !== "undefined" ? localStorage.getItem("razen-doc") || "" : "",
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none min-h-[60vh] font-display",
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
    },
  });

  // Local autosave (debounced)
  useEffect(() => {
    if (!editor) return;
    const id = setInterval(() => {
      const html = editor.getHTML();
      if (html !== lastSavedHtml.current) {
        localStorage.setItem("razen-doc", html);
        lastSavedHtml.current = html;
        setSavedAt(new Date());
      }
    }, 2000);
    return () => clearInterval(id);
  }, [editor]);

  if (!editor) return null;

  const runAction = async (action: WriteAction, opts?: { tone?: string; custom?: string }) => {
    if (busy) return;
    const { from, to, empty } = editor.state.selection;
    const selected = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
    const fullText = editor.getText();

    let instruction = "";
    let payload = "";

    if (action === "continue") {
      instruction = ACTION_PROMPTS.continue;
      payload = fullText.slice(-1500);
    } else if (action === "tone") {
      if (!selected) { toast.error("Select text first to change tone."); return; }
      instruction = `Rewrite the following passage in a ${opts?.tone ?? "Confident"} tone. Keep meaning and key facts. Return ONLY the rewritten passage.`;
      payload = selected;
    } else if (action === "custom") {
      if (!opts?.custom?.trim()) return;
      instruction = `${opts.custom.trim()}\n\nReturn ONLY the rewritten passage — no preamble, no quotes.`;
      payload = selected || fullText;
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
          mode: "write",
          useWebSearch: false,
          messages: [{ role: "user", content: `${instruction}\n\n---\n\n${payload}` }],
        }),
      });

      const remaining = resp.headers.get("X-Credits-Remaining");
      if (remaining) onCreditsChange(Number(remaining));

      if (!resp.ok) {
        let msg = `Error ${resp.status}`;
        try { const e = await resp.json(); if (e.error) msg = e.error; } catch { /* ignore */ }
        toast.error(msg);
        return;
      }
      if (!resp.body) throw new Error("No stream");

      // Stream into the document live
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let started = false;
      let insertFrom = from;
      let insertTo = to;

      const writeChunk = (delta: string) => {
        acc += delta;
        if (action === "continue") {
          // Append at end
          if (!started) {
            editor.commands.focus("end");
            started = true;
            insertFrom = editor.state.doc.content.size;
          }
          editor.commands.insertContentAt(insertFrom + acc.length - delta.length, delta);
        } else {
          // Replace selection (or whole doc) progressively
          if (!started) {
            if (selected) {
              editor.chain().focus().deleteRange({ from, to }).run();
              insertFrom = from;
              insertTo = from;
            } else {
              editor.chain().focus().selectAll().deleteSelection().run();
              insertFrom = editor.state.selection.from;
              insertTo = insertFrom;
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
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Write failed");
    } finally {
      setBusy(null);
      setCustomOpen(false);
      setCustomPrompt("");
      setToneOpen(false);
    }
  };

  const exportMd = () => {
    const html = editor.getHTML();
    // crude html → md (good enough for export)
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
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `razen-doc-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Doc toolbar */}
      <div className="border-b border-border/60 px-4 md:px-8 py-2 flex items-center justify-between text-xs text-muted-foreground bg-card/30">
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground">Document</span>
          <span>{wordCount} words</span>
          {savedAt && <span>· Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => runAction("continue")} disabled={!!busy}>
            {busy === "continue" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Continue writing</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => runAction("fix")} disabled={!!busy}>
            <Check className="h-3.5 w-3.5" /><span className="ml-1.5">Fix grammar</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={exportMd}>
            <FileDown className="h-3.5 w-3.5" /><span className="ml-1.5">Export</span>
          </Button>
        </div>
      </div>

      {/* Bubble menu — appears when text is selected */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100, placement: "top" }}
        shouldShow={({ editor, from, to }) => from !== to && !busy && editor.isFocused}
      >
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover shadow-2xl p-1">
          <BubbleBtn icon={<Wand2 className="h-3.5 w-3.5" />} label="Improve" onClick={() => runAction("improve")} />
          <BubbleBtn icon={<Minimize2 className="h-3.5 w-3.5" />} label="Shorter" onClick={() => runAction("shorter")} />
          <BubbleBtn icon={<Maximize2 className="h-3.5 w-3.5" />} label="Longer" onClick={() => runAction("longer")} />
          <div className="relative">
            <BubbleBtn icon={<Languages className="h-3.5 w-3.5" />} label="Tone" onClick={() => setToneOpen((v) => !v)} />
            {toneOpen && (
              <div className="absolute top-full mt-1 left-0 rounded-lg border border-border bg-popover shadow-2xl p-1 min-w-[140px] z-50">
                {TONES.map((t) => (
                  <button key={t} onClick={() => runAction("tone", { tone: t })}
                    className="block w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent">
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="w-px h-4 bg-border mx-0.5" />
          <BubbleBtn icon={<Sparkles className="h-3.5 w-3.5" />} label="Custom" onClick={() => setCustomOpen((v) => !v)} />
        </div>

        {customOpen && (
          <div className="mt-1 rounded-lg border border-border bg-popover shadow-2xl p-2 w-[320px]">
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runAction("custom", { custom: customPrompt }); }}
                placeholder="Tell Razen how to rewrite this…"
                className="flex-1 bg-transparent text-sm px-2 py-1.5 outline-none placeholder:text-muted-foreground"
              />
              <Button size="sm" className="h-7" onClick={() => runAction("custom", { custom: customPrompt })} disabled={!customPrompt.trim()}>
                Go
              </Button>
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
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-popover border border-border shadow-2xl px-4 py-2 flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Razen is rewriting…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BubbleBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded hover:bg-accent transition-colors"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
