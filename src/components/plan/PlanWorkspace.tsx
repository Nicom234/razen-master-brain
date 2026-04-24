import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, ChevronRight, Download, ListChecks, Plus, RotateCcw, Sparkles, Target, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const STORAGE_KEY = "razen.plan.v1";

type Task = { id: string; title: string; detail?: string; done: boolean };
type Milestone = { id: string; title: string; why?: string; tasks: Task[]; collapsed?: boolean };
type Plan = {
  objective: string;
  assumptions: string[];
  milestones: Milestone[];
  risks: { title: string; mitigation: string }[];
  definitionOfDone: string[];
};

const EMPTY: Plan = { objective: "", assumptions: [], milestones: [], risks: [], definitionOfDone: [] };

const PROMPT = `You are Razen — Plan mode. Convert the user's goal into an EXECUTABLE plan.

Return ONLY valid JSON (no prose, no code fences) matching exactly:
{
  "objective": "one decisive sentence",
  "assumptions": ["..."],
  "milestones": [
    { "title": "Milestone name", "why": "why this matters", "tasks": [
      { "title": "Atomic action verb-led", "detail": "1-line specifics" }
    ]}
  ],
  "risks": [{ "title": "...", "mitigation": "..." }],
  "definitionOfDone": ["concrete shippable checkpoint"]
}

Rules:
- 3-6 milestones, each with 3-7 atomic tasks.
- Tasks must be verb-led, specific, and finishable in <1 day each.
- Be opinionated. Sequence for leverage and speed.
- No filler, no generic advice.`;

function uid() { return Math.random().toString(36).slice(2, 10); }

function parseJSON(text: string): Plan | null {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return {
      objective: String(obj.objective || ""),
      assumptions: Array.isArray(obj.assumptions) ? obj.assumptions.map(String) : [],
      milestones: Array.isArray(obj.milestones) ? obj.milestones.map((m: { title?: string; why?: string; tasks?: { title?: string; detail?: string }[] }) => ({
        id: uid(),
        title: String(m.title || "Untitled"),
        why: m.why ? String(m.why) : undefined,
        tasks: Array.isArray(m.tasks) ? m.tasks.map((t) => ({
          id: uid(), title: String(t.title || ""), detail: t.detail ? String(t.detail) : undefined, done: false,
        })) : [],
      })) : [],
      risks: Array.isArray(obj.risks) ? obj.risks.map((r: { title?: string; mitigation?: string }) => ({
        title: String(r.title || ""), mitigation: String(r.mitigation || ""),
      })) : [],
      definitionOfDone: Array.isArray(obj.definitionOfDone) ? obj.definitionOfDone.map(String) : [],
    };
  } catch { return null; }
}

function planToMarkdown(p: Plan): string {
  const lines: string[] = [];
  lines.push(`# ${p.objective || "Plan"}`, "");
  if (p.assumptions.length) {
    lines.push("## Assumptions");
    p.assumptions.forEach((a) => lines.push(`- ${a}`));
    lines.push("");
  }
  p.milestones.forEach((m, i) => {
    lines.push(`## ${i + 1}. ${m.title}`);
    if (m.why) lines.push(`_${m.why}_`, "");
    m.tasks.forEach((t) => lines.push(`- [${t.done ? "x" : " "}] ${t.title}${t.detail ? ` — ${t.detail}` : ""}`));
    lines.push("");
  });
  if (p.risks.length) {
    lines.push("## Risks");
    p.risks.forEach((r) => lines.push(`- **${r.title}** — ${r.mitigation}`));
    lines.push("");
  }
  if (p.definitionOfDone.length) {
    lines.push("## Definition of done");
    p.definitionOfDone.forEach((d) => lines.push(`- ${d}`));
  }
  return lines.join("\n");
}

export function PlanWorkspace({ onCreditsChange }: { onCreditsChange?: (n: number) => void }) {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<Plan>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Persist
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.plan) setPlan(parsed.plan);
        if (parsed?.goal) setGoal(parsed.goal);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan, goal })); } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [plan, goal]);

  const total = plan.milestones.reduce((s, m) => s + m.tasks.length, 0);
  const done = plan.milestones.reduce((s, m) => s + m.tasks.filter((t) => t.done).length, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  async function generate() {
    const g = goal.trim();
    if (!g || loading) return;
    setLoading(true);
    setRaw("");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sign in required"); setLoading(false); return; }

      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          mode: "plan",
          useWebSearch: false,
          messages: [
            { role: "user", content: `${PROMPT}\n\nGOAL:\n${g}` },
          ],
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Plan failed");
        setLoading(false);
        return;
      }

      const remaining = res.headers.get("X-Credits-Remaining");
      if (remaining && onCreditsChange) onCreditsChange(Number(remaining));

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices?.[0]?.delta?.content;
            if (delta) { acc += delta; setRaw(acc); }
          } catch { /* skip */ }
        }
      }

      const parsed = parseJSON(acc);
      if (!parsed) {
        toast.error("Couldn't parse plan — try again or refine the goal.");
      } else {
        setPlan(parsed);
        toast.success("Plan ready");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  function toggle(mid: string, tid: string) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : {
        ...m, tasks: m.tasks.map((t) => t.id !== tid ? t : { ...t, done: !t.done }),
      }),
    }));
  }
  function toggleCollapse(mid: string) {
    setPlan((p) => ({ ...p, milestones: p.milestones.map((m) => m.id === mid ? { ...m, collapsed: !m.collapsed } : m) }));
  }
  function addTask(mid: string) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : { ...m, tasks: [...m.tasks, { id: uid(), title: "New task", done: false }] }),
    }));
  }
  function removeTask(mid: string, tid: string) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : { ...m, tasks: m.tasks.filter((t) => t.id !== tid) }),
    }));
  }
  function editTask(mid: string, tid: string, title: string) {
    setPlan((p) => ({
      ...p,
      milestones: p.milestones.map((m) => m.id !== mid ? m : { ...m, tasks: m.tasks.map((t) => t.id === tid ? { ...t, title } : t) }),
    }));
  }
  function reset() {
    setPlan(EMPTY); setGoal(""); setRaw("");
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  function exportMd() {
    const md = planToMarkdown(plan);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plan.md"; a.click();
    URL.revokeObjectURL(url);
  }

  const hasPlan = plan.milestones.length > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
        {/* Goal input */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Target className="h-4 w-4" />
            <span>What are you trying to ship?</span>
          </div>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Launch a paid newsletter for senior product designers, 1k subs in 90 days"
            rows={3}
            className="resize-none border-0 bg-transparent p-0 text-base focus-visible:ring-0 shadow-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); }
            }}
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">⌘/Ctrl + Enter to generate</div>
            <div className="flex items-center gap-2">
              {hasPlan && (
                <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-1 h-3 w-3" />Reset</Button>
              )}
              <Button size="sm" disabled={!goal.trim() || loading} onClick={generate}>
                {loading ? <><Sparkles className="mr-1 h-3 w-3 animate-pulse" />Decomposing…</> : <><ArrowUp className="mr-1 h-3 w-3" />Generate plan</>}
              </Button>
            </div>
          </div>
        </div>

        {/* Loading skeleton / streaming raw preview */}
        {loading && !hasPlan && (
          <div className="mt-6 rounded-2xl border bg-muted/30 p-5">
            <div className="text-xs text-muted-foreground mb-2">Streaming…</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{raw || "Thinking…"}</pre>
          </div>
        )}

        {/* Plan */}
        {hasPlan && (
          <div className="mt-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <ListChecks className="h-3 w-3" /> Objective
                </div>
                <h1 className="mt-1 font-display text-2xl md:text-3xl tracking-tight">{plan.objective}</h1>
              </div>
              <Button variant="outline" size="sm" onClick={exportMd}><Download className="mr-1 h-3 w-3" />Export</Button>
            </div>

            {/* Progress */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{done} of {total} tasks complete</span>
                <span className="font-medium">{pct}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Assumptions */}
            {plan.assumptions.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Assumptions</div>
                <ul className="space-y-1 text-sm">
                  {plan.assumptions.map((a, i) => (<li key={i} className="text-foreground/80">• {a}</li>))}
                </ul>
              </div>
            )}

            {/* Milestones */}
            <div className="space-y-3">
              {plan.milestones.map((m, i) => (
                <div key={m.id} className="rounded-xl border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(m.id)}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/30 transition-colors"
                  >
                    {m.collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{m.title}</div>
                      {m.why && <div className="mt-0.5 text-xs text-muted-foreground truncate">{m.why}</div>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.tasks.filter((t) => t.done).length}/{m.tasks.length}
                    </div>
                  </button>

                  {!m.collapsed && (
                    <div className="border-t bg-muted/20 px-4 py-3 space-y-1.5">
                      {m.tasks.map((t) => (
                        <div key={t.id} className="group flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-background transition-colors">
                          <button
                            type="button"
                            onClick={() => toggle(m.id, t.id)}
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${t.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 hover:border-primary"}`}
                          >
                            {t.done && <Check className="h-3 w-3" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <input
                              value={t.title}
                              onChange={(e) => editTask(m.id, t.id, e.target.value)}
                              className={`w-full bg-transparent text-sm outline-none ${t.done ? "line-through text-muted-foreground" : ""}`}
                            />
                            {t.detail && <div className="text-xs text-muted-foreground mt-0.5">{t.detail}</div>}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTask(m.id, t.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addTask(m.id)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                      >
                        <Plus className="h-3 w-3" /> Add task
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Risks */}
            {plan.risks.length > 0 && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-destructive mb-3">
                  <AlertTriangle className="h-3 w-3" /> Risks & mitigations
                </div>
                <div className="space-y-2">
                  {plan.risks.map((r, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{r.title}</span>
                      <span className="text-muted-foreground"> — {r.mitigation}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Definition of done */}
            {plan.definitionOfDone.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Definition of done</div>
                <ul className="space-y-1 text-sm">
                  {plan.definitionOfDone.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!hasPlan && !loading && (
          <div className="mt-10 text-center text-sm text-muted-foreground">
            Drop in any goal — Razen converts it into a sequenced, executable plan with milestones, risks, and a definition of done.
          </div>
        )}
      </div>
    </div>
  );
}
